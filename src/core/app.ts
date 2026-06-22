import { parseTCSS } from "../css/css-parser.ts";
import { CSSResolver } from "../css/css-resolver.ts";
import { DOMNode } from "../dom/dom.ts";
import { Screen } from "../dom/screen.ts";
import { Widget } from "../dom/widget.ts";
import { BunDriver } from "../driver/bun/index.ts";
import type { Driver } from "../driver/driver.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { BoxLayout } from "../layout/box-layout.ts";
import { DockLayout } from "../layout/dock-layout.ts";
import { GridLayout } from "../layout/grid-layout.ts";
import { parseDimension } from "../layout/layout.ts";
import { needsGraphicClear, ScreenBuffer } from "../render/buffer.ts";
import { ThemeManager } from "../theme.ts";
import { logger } from "../utils/logger.ts";
import { AppInput } from "./app-input.ts";
import { frameProfiler } from "./frame-profiler.ts";
import { HotkeyRegistry } from "./hotkeys.ts";
import { type InspectorServer, startInspector } from "./inspector.ts";
import { ReadonlySelectionManager } from "./selection.ts";

/**
 * A structured record of one render-pipeline run, surfaced by
 * {@link App.getLastFrame} for deterministic frame-scheduling tests. It captures
 * *what work a frame did* — whether it relaid out, how it was scoped, and whether
 * it actually emitted — without going through React's (racy) commit timing. This
 * is the assertion vocabulary for damage-scoping / dirty-tracking work: a change
 * should produce a frame whose `damageY0..damageY1` covers only the affected rows,
 * and a no-op should produce a frame with `emitted: false` (or, once dirty
 * tracking lands, no pipeline run at all — see {@link App.framePipelineRunCount}).
 */
export interface FrameSummary {
  /** Pipeline-run index (1-based) this summary describes. */
  seq: number;
  /** A full frame re-resolved styles + measured + laid out; false = paint-only repaint. */
  full: boolean;
  /** Layout (measure + region assignment) recomputed this frame. */
  relayout: boolean;
  /** Styles were re-resolved this frame. */
  restyle: boolean;
  /** First row (inclusive) the frame rendered + diffed. */
  damageY0: number;
  /** Last row (exclusive) the frame rendered + diffed. */
  damageY1: number;
  /** Whether the diff produced output — false means a redundant (no-op) frame. */
  emitted: boolean;
  /** Bytes written to the driver (0 when not emitted). */
  bytes: number;
  /** The render reasons coalesced into this frame. */
  reasons: string[];
}

/**
 * Owns a running ztui application: the {@link Driver}, the screen stack, focus,
 * input dispatch, theming, and the frame scheduler. Construct one, `render()`
 * your tree onto {@link activeScreen}, then call {@link run}.
 */
export class App extends DOMNode {
  /** The most recently constructed App (convenience singleton; prefer `widget.app`). */
  public static instance: App | null = null;
  /** The backend this app renders through. */
  public driver: Driver;
  /** Screen stack; the top is the {@link activeScreen}. */
  public screenStack: Screen[] = [];
  /** @internal Style/`$token` resolver used during rendering. */
  public cssResolver: CSSResolver = new CSSResolver();

  private currentBuffer: ScreenBuffer = new ScreenBuffer();
  private prevBuffer: ScreenBuffer = new ScreenBuffer();
  private renderQueued = false;
  // Whether the next scheduled frame must recompute layout (measure + regions).
  // Set by queueRender; cleared after a full frame. queueRepaint leaves it as-is,
  // so a paint-only frame reuses the prior layout unless a real change is pending.
  private needsLayout = true;
  // Damage tracking for partial repaint. `repaintFull` forces a whole-screen
  // frame; otherwise [damageTop, damageBottom) is the band of rows a repaint
  // touched (a widget's region), so only those rows are re-cleared, re-rendered,
  // diffed, and copied.
  private repaintFull = true;
  private damageTop = Number.POSITIVE_INFINITY;
  private damageBottom = Number.NEGATIVE_INFINITY;
  // Last full frame's graphic-position signature; a change means a graphic was
  // added/moved/removed, triggering a full graphics wipe + re-emit to clear
  // orphaned placements (see ScreenBuffer.graphicSignature).
  private lastGraphicSignature = 0;
  private renderReasonStats: Record<string, number> = Object.create(null);
  private pendingRenderReasons = new Set<string>();
  // All terminal input (keyboard, pointer, paste) lives in a dedicated controller
  // so the frame pipeline and the event subsystem stay in separate files. It
  // owns the hover/drag/diagnostics state, surfaced back through `hoveredWidget`
  // and `getMouseDiagnostics` below. Initialised in the constructor.
  public readonly input: AppInput = new AppInput(this);
  /**
   * @internal
   * Read-only text selection over display widgets (`Syntax`, `RichText`,
   * `Markdown` blocks, `Table` body). Defined in logical content space so it
   * crosses widget boundaries, skips chrome, and copies the true value; editable
   * widgets manage their own selection separately.
   */
  public readonly selection = new ReadonlySelectionManager();
  /**
   * Global hotkey registry: named, grouped, context-scoped shortcuts. Priority
   * (modified) keys dispatch before the focused widget; bare keys after the
   * focus chain declined them — see the key handler in {@link run}.
   */
  public readonly hotkeys = HotkeyRegistry.getInstance();
  private inspectorServer: InspectorServer | null = null;
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  private frameCount = 0;
  // Number of times the render pipeline actually ran (full or paint-only),
  // whether or not it emitted bytes. Differs from frameCount, which counts only
  // frames that wrote output. The gap (ran but emitted nothing) is the
  // redundant-frame cost that subtree-damage dirty tracking aims to eliminate, so
  // tests assert on this to prove a change scheduled — or skipped — real work.
  private framePipelineRuns = 0;
  // Render reasons coalesced into the frame currently being rendered (snapshot of
  // pendingRenderReasons taken when the frame starts), surfaced on the frame log.
  private currentFrameReasons: string[] = [];
  private _lastFrame: FrameSummary | null = null;
  /** Unsubscribe from the global theme manager; called on {@link stop}. */
  private themeUnsubscribe: (() => void) | null = null;
  private _pointerShapes = true;

  /**
   * Whether the app drives the mouse-pointer shape (OSC 22) from the hovered
   * widget's `cursor`. On by default; set `false` to leave the pointer alone
   * (e.g. to cut passive-hover tracking on capable terminals). Turning it off at
   * runtime immediately resets the pointer to the terminal default. Has no
   * effect on terminals that don't advertise {@link TerminalCapabilities.pointerShapes}.
   */
  public get pointerShapes(): boolean {
    return this._pointerShapes;
  }
  public set pointerShapes(enabled: boolean) {
    if (this._pointerShapes === enabled) return;
    this._pointerShapes = enabled;
    if (!enabled) this.driver.setPointerShape(null);
    // Cursor widgets count as hover interest only while enabled, so the tracking
    // mode may need to flip.
    this.input.syncMouseHoverMode();
  }

  /**
   * @param driver Backend to render through. Defaults to {@link BunDriver} (the
   * terminal); pass {@link WebDriver} for the browser canvas or {@link MockDriver}
   * for tests.
   * @param options.pointerShapes Drive the mouse-pointer shape from widget
   * `cursor` styles (default `true`); see {@link App.pointerShapes}.
   */
  constructor(driver?: Driver, options?: { pointerShapes?: boolean }) {
    super("app");
    App.instance = this;
    this.driver = driver || new BunDriver();
    if (options?.pointerShapes !== undefined) this._pointerShapes = options.pointerShapes;

    const defaultScreen = new Screen();
    this.pushScreen(defaultScreen);

    this.themeUnsubscribe = ThemeManager.getInstance().subscribe(() => {
      this.queueRender("theme:change");
    });
  }

  /** The screen on top of the stack — where {@link render} mounts the tree. */
  public get activeScreen(): Screen {
    return this.screenStack[this.screenStack.length - 1];
  }

  /**
   * The most recently rendered frame buffer (read-only view).
   * Exposed for inspection/testing — callers must not mutate it.
   */
  public get buffer(): ScreenBuffer {
    return this.currentBuffer;
  }

  /** Push a screen onto the stack and make it active (e.g. a full-screen view). */
  public pushScreen(screen: Screen): void {
    screen.parent = this;
    this.screenStack.push(screen);
    const size = this.driver.getSize();
    if (size.width > 0) {
      screen.resize(Math.max(80, size.width), Math.max(24, size.height));
      this.layoutAndRender();
    }
  }

  /** Pop the top screen, returning to the one beneath (never empties the stack). */
  public popScreen(): void {
    if (this.screenStack.length > 1) {
      const popped = this.screenStack.pop();
      if (popped) popped.parent = null;
      this.layoutAndRender();
    }
  }

  /** Load a TCSS stylesheet string (selectors + `:hover`/`:focus` rules) into the resolver. */
  public loadStyles(tcssContent: string): void {
    const rules = parseTCSS(tcssContent);
    this.cssResolver.addRules(rules);
    this.queueRender("styles:load");
  }

  /** Start the event loop: bind the driver, probe capabilities, and render frames. */
  public run(options?: { inspectorPort?: number }): void {
    logger.init("App started");
    // Lazy + level-gated: skip building the (often `describe()`-bearing) message
    // entirely when debug logging is off, which is the default. Called per input
    // event, so eager string building dominated under a Ghostty move flood.
    const log = (msg: string | (() => string)) => {
      if (!logger.isEnabled("debug")) return;
      logger.debug("app", typeof msg === "function" ? msg() : msg);
    };

    if (options?.inspectorPort) {
      this.inspectorServer = startInspector(this, options.inspectorPort);
      log(`Inspector server started on port ${options.inspectorPort}`);
    }

    this.driver.start();

    const size = this.driver.getSize();
    const targetW = Math.max(80, size.width);
    const targetH = Math.max(24, size.height);
    this.activeScreen.resize(targetW, targetH);
    this.currentBuffer.resize(targetW, targetH);
    this.prevBuffer.resize(targetW, targetH);

    log(`Initial screen bounds resolved: ${size.width}x${size.height}`);
    this.layoutAndRender();

    this.driver.on("resize", (newSize) => {
      log(`Resize event: ${newSize.width}x${newSize.height}`);
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        this.resizeTimeout = null;
        const latestSize = this.driver.getSize();
        const targetW = Math.max(80, latestSize.width);
        const targetH = Math.max(24, latestSize.height);
        this.activeScreen.resize(targetW, targetH);
        this.currentBuffer.resize(targetW, targetH);
        this.prevBuffer.resize(0, 0); // Force full redraw

        this.driver.clearScreen();
        this.queueRender("driver:resize");
      }, 30);
    });

    this.driver.on("capabilities_resolved", () => {
      log(
        `Capabilities resolved event received from driver. Cell size: ${JSON.stringify(this.driver.capabilities.cellSize)}, Graphics: ${this.driver.capabilities.graphicsProtocol}`,
      );
      this.queueRender("driver:capabilities-resolved");
    });

    // All keyboard, pointer and paste handling lives in AppInput; the driver
    // events delegate straight to it. Pointer-motion throttling is internal to
    // handleMouse.
    this.driver.on("key", (ev) => this.input.handleKey(ev));
    this.driver.on("mouse", (ev) => this.input.handleMouse(ev));
    this.driver.on("paste", (text) => this.input.handlePaste(text));
  }

  /** Stop the loop and restore the backend; releases timers, the inspector, and the singleton. */
  public stop(): void {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
    if (this.inspectorServer) {
      this.inspectorServer.stop();
      this.inspectorServer = null;
    }
    // Drop the global theme subscription so a stopped app stops receiving render
    // callbacks (and can be garbage-collected instead of lingering for the life
    // of the process).
    this.themeUnsubscribe?.();
    this.themeUnsubscribe = null;
    // Release the global pointer if it still references us.
    if (App.instance === this) {
      App.instance = null;
    }
    this.driver.stop();
  }

  /**
   * Schedule a full re-render — restyle + measure + layout + paint — on the next
   * microtask (coalesced). This is the safe default: call it after any state
   * change that might affect sizes or structure.
   */
  public queueRender(reason = "unknown"): void {
    this.noteRenderReason(reason);
    this.needsLayout = true;
    this.repaintFull = true;
    this.scheduleRender();
  }

  /**
   * Force the next frame to re-emit **every** cell, even ones whose buffer
   * content is unchanged. Needed after a global that affects *serialization* but
   * not the cell data the per-cell diff compares — toggling {@link colorMode}
   * (`NO_COLOR`) or the terminal's colour depth — where a normal
   * {@link queueRender} would find no changed cells and emit nothing.
   */
  public refresh(reason = "refresh"): void {
    // Invalidate the retained frame: the next diff sees a size mismatch, blanks
    // every old cell, and so treats the whole screen as changed.
    this.prevBuffer.resize(0, 0);
    this.queueRender(reason);
  }

  /**
   * Schedule a **paint-only** re-render: restyle + paint, reusing the previous
   * frame's layout (regions/sizes). For high-frequency animations that change
   * appearance but never geometry — the blinking caret above all — so an idle
   * focused editor doesn't relayout the whole tree ~17×/second. If anything calls
   * {@link queueRender} in the same frame, the full path runs instead, so a
   * repaint can never mask a real layout change.
   */
  public queueRepaint(region?: { y: number; bottom: number } | null, reason = "unknown"): void {
    this.noteRenderReason(`repaint:${reason}`);
    // A region scopes the repaint to that band of rows (damage tracking). No
    // region means "repaint the whole screen" — the safe default.
    if (region && region.bottom > region.y) {
      this.damageTop = Math.min(this.damageTop, region.y);
      this.damageBottom = Math.max(this.damageBottom, region.bottom);
    } else {
      this.repaintFull = true;
    }
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      this.layoutAndRender();
    });
  }

  /**
   * Copy the active read-only selection (the true content value across every
   * widget it spans, in document order — see {@link ReadonlySelectionManager}).
   * Writes the clipboard and returns the text, or null when the selection is
   * empty.
   */
  public copyActiveSelection(): string | null {
    const text = this.selection.copy();
    if (text != null) this.driver.clipboard.set(text);
    return text;
  }

  public getRenderReasonStats(): Record<string, number> {
    return { ...this.renderReasonStats };
  }

  public getMouseDiagnostics(): Record<string, number> {
    return this.input.getDiagnostics();
  }

  /**
   * The widget currently under the pointer, or null. Read by the style pass (for
   * `:hover`) and the inspector; the live state is owned by {@link AppInput}.
   */
  public get hoveredWidget(): Widget | null {
    return this.input.hoveredWidget;
  }

  private noteRenderReason(reason: string): void {
    this.pendingRenderReasons.add(reason);
  }

  private flushRenderReasons(): void {
    if (this.pendingRenderReasons.size === 0) {
      this.pendingRenderReasons.add("unspecified");
    }
    for (const reason of this.pendingRenderReasons) {
      this.renderReasonStats[reason] = (this.renderReasonStats[reason] ?? 0) + 1;
    }
    // Snapshot for the frame log before clearing — these are the reasons the
    // about-to-run frame is servicing.
    this.currentFrameReasons = [...this.pendingRenderReasons];
    this.pendingRenderReasons.clear();
  }

  /**
   * The {@link FrameSummary} of the most recent render-pipeline run, or null
   * before the first. For deterministic frame-scheduling tests — inspect it after
   * flushing a frame to assert how the frame was scoped and whether it emitted.
   */
  public getLastFrame(): FrameSummary | null {
    return this._lastFrame;
  }

  /**
   * Total render-pipeline runs so far (full or paint-only), regardless of whether
   * they emitted. Tests diff this across an action to assert a frame ran — or, for
   * a no-op, that none did.
   */
  public get framePipelineRunCount(): number {
    return this.framePipelineRuns;
  }

  private layoutAndRender(): void {
    if (!this.driver.capabilitiesResolved) {
      return;
    }
    this.flushRenderReasons();
    try {
      this.layoutAndRenderUnsafe();
      this.input.syncMouseHoverMode();
    } catch (err) {
      // Last-resort guard: a render exception must never crash the app or leave
      // the terminal wedged. Log it and keep the previous frame on screen.
      logger.error("render", "layoutAndRender failed; keeping previous frame", err);
    }
  }

  private layoutAndRenderUnsafe(): void {
    this.framePipelineRuns++;
    const screen = this.activeScreen;

    // Capture and clear the layout-dirty flag up front: a re-entrant queueRender
    // during this frame must re-dirty for the *next* frame, not be swallowed.
    const doLayout = this.needsLayout;
    this.needsLayout = false;

    // Decide full vs. partial (damage-tracked) repaint, capturing and clearing the
    // dirty state up front so a re-entrant request re-dirties for the next frame.
    let full = doLayout || this.repaintFull;
    const damageTop = this.damageTop;
    const damageBottom = this.damageBottom;
    this.repaintFull = false;
    this.damageTop = Number.POSITIVE_INFINITY;
    this.damageBottom = Number.NEGATIVE_INFINITY;
    // Be conservative: a partial frame composites over the retained buffer, which
    // is only valid when nothing outside the damaged rows changed. Overlays
    // (dropdowns/dialogs) and an active text selection can both touch arbitrary
    // rows, so fall back to a full frame whenever either is present.
    if (this.activeScreen.overlays.length > 0 || this.selection.active) full = true;
    // Inline graphics (icons/images) are a separate terminal layer that only the
    // full-buffer diff clears and redraws correctly; a damage-scoped partial
    // frame would leave stale images behind. If the last frame drew any, stay
    // full until they're gone.
    if (this.currentBuffer.containsGraphics) full = true;
    if (!full && (damageTop === Number.POSITIVE_INFINITY || damageBottom <= damageTop)) {
      full = true;
    }

    // Styles: a full frame always re-resolves. On a paint-only frame we can reuse
    // the previous frame's computedStyle, because nothing that the central pass
    // resolves has changed — real style/focus/hover/theme changes all go through
    // queueRender (a full frame), and time-varying colors (focus/attention
    // breathing, the caret) are re-resolved by each widget in its own render().
    // The one exception is a loaded stylesheet, whose `:focus`/`:hover` rules
    // *could* carry a time-varying token resolved by this pass — so when rules
    // exist we keep re-resolving every frame (correctness over speed).
    const restyle = doLayout || this.cssResolver.hasRules();
    if (restyle) {
      const t = frameProfiler.now();
      this.resolveAllStyles(screen);
      frameProfiler.record("restyle", t);
    }
    const size = this.driver.getSize();
    if (doLayout) {
      let t = frameProfiler.now();
      screen.measure(screen.region.width, size.height);
      frameProfiler.record("measure", t);
      t = frameProfiler.now();
      this.resolveAllLayouts(screen);
      frameProfiler.record("layout", t);
    }

    // Resolve styles and absolute layouts for screen overlays. Overlays fill the
    // screen and must be measured (so layer content can size/center itself)
    // before their subtree is laid out.
    for (const overlay of screen.overlays) {
      if (restyle) {
        const t = frameProfiler.now();
        this.resolveAllStyles(overlay);
        frameProfiler.record("restyle", t);
      }
      if (doLayout) {
        let t = frameProfiler.now();
        overlay.measure(screen.region.width, screen.region.height);
        frameProfiler.record("measure", t);
        overlay.region = screen.region.clone();
        t = frameProfiler.now();
        this.resolveAllLayouts(overlay);
        frameProfiler.record("layout", t);
      }
    }

    // Damage band for a partial frame: clamp to the screen and clip rendering to
    // those rows. renderChildren prunes subtrees that don't intersect the clip and
    // setCell drops writes outside it, so only the changed band is rebuilt; every
    // other row is retained from the previous frame (and therefore matches
    // prevBuffer, so the diff finds nothing there).
    const dmgY0 = full ? 0 : Math.max(0, Math.floor(damageTop));
    const dmgY1 = full ? size.height : Math.min(size.height, Math.ceil(damageBottom));

    const tRender = frameProfiler.now();
    if (full) {
      // Recompute graphics presence/signature from scratch this frame; a full
      // render visits every widget, so they end accurate. (Partial frames leave
      // them as-is — they only run when no graphics were present.)
      this.currentBuffer.containsGraphics = false;
      this.currentBuffer.graphicSignature = 0;
      this.currentBuffer.clear();
    } else {
      this.currentBuffer.clear(dmgY0, dmgY1);
    }
    // Selectable widgets register their content runs during render; reset the
    // registry first, then highlight the active selection as a post-pass over
    // the composed frame (only real content cells are painted).
    this.selection.beginFrame();
    if (full) {
      screen.render(this.currentBuffer);
    } else {
      this.currentBuffer.pushClip(
        new Region(new Offset(0, dmgY0), new Size(size.width, dmgY1 - dmgY0)),
      );
      screen.render(this.currentBuffer);
      this.currentBuffer.popClip();
    }
    this.selection.paint(this.currentBuffer, (w, v) => this.cssResolver.resolveVariable(w, v));

    // When the set of inline graphics changed across full frames (one appeared,
    // moved, or vanished), erase the whole terminal — text *and* graphics — and
    // force a full redraw. Two problems the per-cell diff can't solve on its own:
    // an orphaned placement (scrolled, or left by a swapped screen) is never
    // deleted, and stale text from a previous screen survives in any cell the new
    // frame doesn't overwrite. A clean wipe + full re-emit fixes both. Images now
    // render at z=0 (above text), so the erase's opaque background can no longer
    // hide them — that was the empty-square bug behind-text (z<0) images had. The
    // signature is unchanged across steady-state frames, so static graphics never
    // flicker.
    let graphicsResetSeq = "";
    if (full && this.currentBuffer.graphicSignature !== this.lastGraphicSignature) {
      const resetSeq = this.driver.getGraphicResetSequence();
      // Take the wipe path on any inline-graphics terminal, not just those with a
      // global delete (Kitty). Kitty deletes every placement up front; the others
      // (Sixel, iTerm2) rely on the screen erase (ED), which clears the
      // inline-graphics layer too. Either way we then re-emit the whole frame.
      //
      // The alternative — per-cell opaque "clear" rectangles — is what punched a
      // black hole into a freshly drawn Sixel image when switching between two
      // graphics screens: a cell the old screen drew an image in, now covered by
      // the *new* image, was erased on top of it. Sixel has no global delete to
      // fall back on, so wiping + redrawing once is the only clean fix.
      const usesInlineGraphics = this.driver.capabilities.graphicsProtocol !== "none";
      if (resetSeq || usesInlineGraphics) {
        // Graphics reset (Kitty delete-all, else empty) + screen blank; the clear
        // sequence (SGR reset + home + erase) lives behind a Driver method so no
        // raw escape leaks into core.
        graphicsResetSeq = `${resetSeq}${this.driver.getScreenClearSequence()}`;
        // After the wipe, every current cell must be re-emitted, so invalidate
        // the prev buffer to force a full redraw over the just-erased terminal.
        // Dropping the prev icons/graphics also stops the per-cell diff from
        // emitting its own erase before re-placing an image: on Kitty that
        // delete-at-cursor would drop the fresh placement (an empty square); on
        // Sixel that opaque rectangle would punch the black hole described above.
        for (const row of this.prevBuffer.cells) {
          for (const c of row) {
            c.char = "";
            c.icon = undefined;
            c.graphic = undefined;
          }
        }
      }
      this.lastGraphicSignature = this.currentBuffer.graphicSignature;
    }

    frameProfiler.record("render", tRender);

    const tDiff = frameProfiler.now();
    const ansiDiff = this.currentBuffer.renderDiff(
      this.prevBuffer,
      (cell, oldCell) => {
        let prefix = "";
        // Erase a stale image when the cell previously held an icon/graphic that
        // is now different or gone (continuation cells of a current image are
        // exempt — see needsGraphicClear). Text/spaces don't clear a terminal's
        // graphics layer (esp. sixel), so without this an old icon lingers.
        if (needsGraphicClear(cell, oldCell)) {
          prefix = this.driver.getGraphicClearSequence(cell.style.background);
        }

        // Only rasterized graphics produce a terminal sequence; vector graphics
        // (web/canvas) carry no pixel buffer and are drawn by the canvas backend.
        if (cell.graphic?.pixelBuffer) {
          return (
            prefix +
            this.driver.getImageSequence(
              cell.graphic.pixelBuffer,
              cell.graphic.pixelWidth ?? 0,
              cell.graphic.pixelHeight ?? 0,
              cell.graphic.cellWidth,
              cell.graphic.cellHeight,
              cell.graphic.pngBase64,
              cell.style.background,
              cell.graphic.zIndex,
            )
          );
        }
        if (cell.icon) {
          return (
            prefix + this.driver.getIconSequence(cell.icon, cell.style.color, cell.style.background)
          );
        }
        return prefix + cell.char;
      },
      size.width,
      dmgY1,
      dmgY0,
    );
    frameProfiler.record("diff", tDiff);

    const emitted = !!(ansiDiff || graphicsResetSeq);
    const tWrite = frameProfiler.now();
    if (emitted) {
      this.driver.writeFrame(graphicsResetSeq + ansiDiff);
      this.driver.presentBuffer(this.currentBuffer);
      this.currentBuffer.copyTo(this.prevBuffer, dmgY0, dmgY1);
      this.frameCount++;
      logger.debug(
        "render",
        `frame #${this.frameCount} painted (${ansiDiff.length} bytes, ${size.width}x${size.height})`,
      );
    }
    frameProfiler.record("write", tWrite);
    const bytes = emitted ? graphicsResetSeq.length + ansiDiff.length : 0;
    frameProfiler.frame({ full, emitted, bytes });
    this._lastFrame = {
      seq: this.framePipelineRuns,
      full,
      relayout: doLayout,
      restyle,
      damageY0: dmgY0,
      damageY1: dmgY1,
      emitted,
      bytes,
      reasons: this.currentFrameReasons,
    };
  }

  private resolveAllStyles(node: DOMNode): void {
    if (node instanceof Widget) {
      const isHovered = this.hoveredWidget === node;
      try {
        node.computedStyle = this.cssResolver.resolveStyles(node, isHovered);
      } catch (err) {
        // A bad style value for one widget must not abort styling the whole tree;
        // fall back to its inline style and log.
        logger.error("style", `style resolution failed: ${node.describe()}`, err);
        node.computedStyle = node.style;
      }
    }
    for (const child of node.children) {
      this.resolveAllStyles(child);
    }
  }

  private resolveAllLayouts(parent: Widget): void {
    let layoutType = parent.computedStyle.layout;
    const display = parent.computedStyle.display;
    const flexDirection = parent.computedStyle.flexDirection;

    if (display === "grid") {
      layoutType = "grid";
    } else if (display === "dock") {
      layoutType = "dock";
    } else if (display === "flex" || flexDirection !== undefined) {
      layoutType = flexDirection === "row" ? "horizontal" : "vertical";
    }

    // Widgets that lay out their own children (e.g. a virtualized table that
    // positions cell widgets into row/column slots) opt in via `layoutChildren`.
    // Returning true means the default layout dispatch below is skipped; the
    // recursion at the end still lays out each child's own subtree.
    const customLayout = (parent as unknown as { layoutChildren?: () => boolean }).layoutChildren;
    if (typeof customLayout === "function" && customLayout.call(parent)) {
      // handled by the widget
    } else if (parent.tagName === "tabcontainer") {
      const inner = parent.getContentRect();
      const tabBarHeight = 1;
      for (const child of parent.children) {
        if (child instanceof Widget && child.visible) {
          child.region = new Region(
            new Offset(inner.x, inner.y + tabBarHeight),
            new Size(inner.width, Math.max(0, inner.height - tabBarHeight)),
          );
        }
      }
    } else if (layoutType === "vertical" || layoutType === "horizontal") {
      new BoxLayout(layoutType).resolve(parent);
    } else if (layoutType === "dock") {
      new DockLayout().resolve(parent);
    } else if (layoutType === "grid") {
      new GridLayout(2).resolve(parent);
    } else {
      const inner = parent.getContentRect();
      for (const child of parent.children) {
        if (child instanceof Widget && child.visible) {
          child.region = inner.clone();
        }
      }
    }

    this.resolveAbsoluteChildren(parent);

    if (parent.scrollOffset.x !== 0 || parent.scrollOffset.y !== 0) {
      for (const child of parent.children) {
        // Pinned (position: fixed) children stay put against scroll — e.g. the
        // copy button anchored to the viewport's top-right corner.
        if (child instanceof Widget && !child.positionFixed) {
          child.region = new Region(
            new Offset(
              child.region.x - parent.scrollOffset.x,
              child.region.y - parent.scrollOffset.y,
            ),
            child.region.size,
          );
        }
      }
    }

    for (const child of parent.children) {
      if (child instanceof Widget) {
        this.resolveAllLayouts(child);
      }
    }
  }

  private resolveAbsoluteChildren(parent: Widget): void {
    const parentRect = parent.getContentRect();
    for (const child of parent.children) {
      if (child instanceof Widget && child.visible && child.computedStyle.position === "absolute") {
        const wVal = parseDimension(
          child.computedStyle.width,
          parentRect.width,
          child.measuredWidth,
        );
        const childWidth = typeof wVal === "number" ? wVal : child.measuredWidth;

        const hVal = parseDimension(
          child.computedStyle.height,
          parentRect.height,
          child.measuredHeight,
        );
        const childHeight = typeof hVal === "number" ? hVal : child.measuredHeight;

        let x = parentRect.x;
        if (child.computedStyle.left !== undefined) {
          const val = parseDimension(child.computedStyle.left, parentRect.width, 0);
          x = parentRect.x + (typeof val === "number" ? val : 0);
        } else if (child.computedStyle.right !== undefined) {
          const val = parseDimension(child.computedStyle.right, parentRect.width, 0);
          x = parentRect.right - childWidth - (typeof val === "number" ? val : 0);
        }

        let y = parentRect.y;
        if (child.computedStyle.top !== undefined) {
          const val = parseDimension(child.computedStyle.top, parentRect.height, 0);
          y = parentRect.y + (typeof val === "number" ? val : 0);
        } else if (child.computedStyle.bottom !== undefined) {
          const val = parseDimension(child.computedStyle.bottom, parentRect.height, 0);
          y = parentRect.bottom - childHeight - (typeof val === "number" ? val : 0);
        }

        child.region = new Region(new Offset(x, y), new Size(childWidth, childHeight));
      }
    }
  }
}
