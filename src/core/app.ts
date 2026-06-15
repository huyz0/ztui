import { parseTCSS } from "../css/css-parser.ts";
import { CSSResolver } from "../css/css-resolver.ts";
import { DOMNode } from "../dom/dom.ts";
import { Screen } from "../dom/screen.ts";
import { Widget } from "../dom/widget.ts";
import { BunDriver } from "../driver/bun/index.ts";
import type { Driver, KeyEvent, MouseEvent } from "../driver/driver.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { BoxLayout } from "../layout/box-layout.ts";
import { DockLayout } from "../layout/dock-layout.ts";
import { GridLayout } from "../layout/grid-layout.ts";
import { parseDimension } from "../layout/layout.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { ThemeManager } from "../theme.ts";
import { logger } from "../utils/logger.ts";
import { HotkeyRegistry } from "./hotkeys.ts";
import { type InspectorServer, startInspector } from "./inspector.ts";
import { ReadonlySelectionManager } from "./selection.ts";

/**
 * Optional clipboard/selection surface implemented by editable text widgets
 * (`Input`, `TextArea`). The App routes copy/cut/paste/select-all to the focused
 * widget through this duck-typed shape without importing widget classes.
 */
interface ClipboardWidget {
  copySelection?: () => string | null;
  cutSelection?: () => string | null;
  clearSelection?: () => void;
  hasSelection?: () => boolean;
  selectAll?: () => void;
  insertText?: (text: string) => void;
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
  private hoveredWidget: Widget | null = null;
  private activeDragWidget: Widget | null = null;
  // Last pointer cell, so a stream of same-cell `move` events (terminals emit one
  // per pixel under any-motion tracking, but report cell coords) is collapsed to
  // a single hit-test — the dominant cost of hovering.
  private lastMouseX = -1;
  private lastMouseY = -1;
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
  /** Unsubscribe from the global theme manager; called on {@link stop}. */
  private themeUnsubscribe: (() => void) | null = null;

  /**
   * @param driver Backend to render through. Defaults to {@link BunDriver} (the
   * terminal); pass {@link WebDriver} for the browser canvas or {@link MockDriver}
   * for tests.
   */
  constructor(driver?: Driver) {
    super("app");
    App.instance = this;
    this.driver = driver || new BunDriver();

    const defaultScreen = new Screen();
    this.pushScreen(defaultScreen);

    this.themeUnsubscribe = ThemeManager.getInstance().subscribe(() => {
      this.queueRender();
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
    this.queueRender();
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
        this.queueRender();
      }, 30);
    });

    this.driver.on("capabilities_resolved", () => {
      log(
        `Capabilities resolved event received from driver. Cell size: ${JSON.stringify(this.driver.capabilities.cellSize)}, Graphics: ${this.driver.capabilities.graphicsProtocol}`,
      );
      this.queueRender();
    });

    this.driver.on("key", (ev) => {
      log(`Key event received: key=${ev.key}, name=${ev.name}`);
      if (ev.key === "ctrl+c") {
        // Selection-aware quit: if a text selection is active, copy it instead
        // of exiting — the selection stays visible (standard editor behavior);
        // Escape or clicking elsewhere deselects, after which Ctrl+C quits.
        // This is the only copy path that works on terminals WITHOUT the Kitty
        // keyboard protocol, where Ctrl+Shift+C is byte-identical to a bare
        // Ctrl+C. Marking the event handled stops the driver's fallback exit.
        const focused = this.activeScreen.focusedWidget as ClipboardWidget | null;
        const copied = focused?.copySelection?.();
        if (copied != null) {
          ev.handled = true;
          this.queueRender();
          return;
        }
        // Read-only (mouse) selection over a display widget copies too.
        if (this.selection.active && this.copyActiveSelection() != null) {
          ev.handled = true;
          this.queueRender();
          return;
        }
        // On a backend that doesn't own its host process (the web canvas, served
        // to many users), Ctrl+C must never quit — it would kill the shared page
        // and any server behind it. With nothing to copy, just swallow it.
        if (this.driver.capabilities.ownsProcess === false) {
          ev.handled = true;
          return;
        }
        ev.handled = true;
        this.stop();
        process.exit(0);
      }

      // Clipboard commands routed to the focused text widget. Copy/cut also bind
      // Ctrl+Shift+C/X (key "ctrl+C"/"ctrl+X" — distinguishable from a bare Ctrl+C
      // only under the Kitty keyboard protocol); paste/select-all use Ctrl+V /
      // Ctrl+A, which reach the app on every terminal. Each is guarded by a
      // capability check so non-text widgets are unaffected.
      if (this.routeClipboardKey(ev)) {
        this.queueRender();
        return;
      }

      const screen = this.activeScreen;

      // Layer key interception: sticky panels see keys first (top-down) so they
      // can claim navigation keys while leaving text for the focused control
      // below. A modal blocks interception from reaching layers beneath it.
      for (let i = screen.layers.length - 1; i >= 0; i--) {
        const layer = screen.layers[i];
        const interceptor = layer.keyInterceptor;
        if (interceptor) {
          this.safeInvoke(`keyInterceptor on layer ${i}`, () => interceptor(ev));
          if (ev.handled) {
            log(`Key "${ev.key}" intercepted by layer ${i}`);
            this.queueRender();
            return;
          }
        }
        if (layer.modal) break;
      }

      // Global hotkeys, priority phase: modified keys (Ctrl/Alt/F-keys) can't be
      // ordinary typing, so they dispatch before the focused widget. Layer
      // interceptors above keep precedence (a dialog's nav keys win), but a
      // modal does NOT block hotkeys — the palette toggle must work everywhere.
      if (this.hotkeys.dispatch(ev, "priority")) {
        this.queueRender();
        return;
      }

      if (ev.key === "escape" || ev.name === "escape") {
        // Escape first deselects (standard editor behavior — the selection
        // survives Ctrl+C copies until explicitly dismissed), so quitting after
        // a copy is Esc then Ctrl+C.
        const focused = screen.focusedWidget as ClipboardWidget | null;
        if (focused?.hasSelection?.()) {
          this.safeInvoke("clearSelection (escape)", () => focused.clearSelection?.());
          this.queueRender();
          return;
        }
        if (this.selection.active) {
          this.selection.active = null;
          this.queueRender();
          return;
        }
      }

      // Escape closes the topmost layer that opted in (modal dialog or sticky
      // panel), before its content sees the key — a focused control would
      // otherwise mark every key handled. Disable per-layer with
      // `closeOnEscape={false}` when the content needs Escape for itself.
      if (ev.key === "escape" || ev.name === "escape") {
        const top = screen.layers[screen.layers.length - 1];
        if (top?.closeOnEscape) {
          log("Escape closing top layer");
          this.safeInvoke("layer onClose (escape)", () => top.onClose?.());
          this.queueRender();
          return;
        }
      }

      if (ev.key === "tab") {
        screen.focusNext(ev.shift);
        log(() => `Focus moved to: ${screen.focusedWidget?.describe() ?? "(none)"}`);
        this.queueRender();
        return;
      }

      // Bubble key event up from the focused widget. A disabled focused widget
      // (e.g. it was disabled while focused) swallows nothing — skip its chain
      // so input can't reach an inert control.
      let current: DOMNode | null = screen.focusedWidget;
      if (current instanceof Widget && current.isDisabled()) current = null;
      let handledBy: Widget | null = null;
      while (current) {
        if (current instanceof Widget) {
          const w = current;
          if (w.handleKey) {
            this.safeInvoke(
              () => `handleKey on ${w.describe()}`,
              () => w.handleKey(ev),
            );
            if (ev.handled) {
              handledBy = w;
              break;
            }
          }
        }
        current = current.parent;
      }
      if (handledBy) {
        log(() => `Key "${ev.key}" handled by ${handledBy.describe()}`);
        this.queueRender();
        return;
      }

      // Global hotkeys, fallback phase: bare keys ("?", "g", enter…) only fire
      // once the focus chain declined the event, so hotkeys never eat typing.
      if (this.hotkeys.dispatch(ev, "fallback")) {
        log(`Key "${ev.key}" handled by global hotkey`);
        this.queueRender();
        return;
      }

      log(`Key "${ev.key}" ignored (no widget in the focused chain handled it)`);
    });

    const processMouse = (ev: MouseEvent) => {
      // Collapse redundant same-cell motion. Under any-motion tracking (1003) a
      // hover sends a move per pixel; without a button down, a move that stays in
      // the same cell can't change the hovered widget or a drag, so it is pure
      // overhead (a full tree hit-test) — skip it.
      if (ev.type === "move" && ev.x === this.lastMouseX && ev.y === this.lastMouseY) {
        return;
      }
      this.lastMouseX = ev.x;
      this.lastMouseY = ev.y;

      let hit = this.hitTest(this.activeScreen, ev.x, ev.y);

      if (this.activeDragWidget && (ev.type === "drag" || ev.type === "release")) {
        hit = this.activeDragWidget;
      }
      if (ev.type === "press") {
        this.activeDragWidget = hit;
        // A new left-press drops any prior read-only selection; the hit widget's
        // handleMouse re-establishes one if it is selectable.
        if (ev.button === "left" && this.selection.active) {
          this.selection.active = null;
          this.queueRender();
        }
      }

      log(
        () =>
          `Mouse ${ev.type} @ (${ev.x},${ev.y}) btn=${ev.button} -> hit: ${hit?.describe() ?? "none"}`,
      );

      if (ev.type === "release") {
        this.activeDragWidget = null;
      }

      if (hit !== this.hoveredWidget) {
        const oldHovered = this.hoveredWidget;
        this.hoveredWidget = hit;

        if (oldHovered?.onMouseLeave) {
          log(() => `onMouseLeave -> ${oldHovered.describe()}`);
          this.safeInvoke(
            () => `onMouseLeave on ${oldHovered.describe()}`,
            () => oldHovered.onMouseLeave?.(ev),
          );
        }
        if (hit?.onMouseEnter) {
          log(() => `onMouseEnter -> ${hit.describe()}`);
          this.safeInvoke(
            () => `onMouseEnter on ${hit.describe()}`,
            () => hit.onMouseEnter?.(ev),
          );
        }
        // Only repaint for the hover change itself when a `:hover` stylesheet rule
        // could actually change the frame. Widgets that react to hover via their
        // own state (e.g. the copy button) queue their own render from the
        // enter/leave handlers above, so we don't relayout the whole tree on every
        // pointer boundary crossing when nothing visual depends on it.
        if (this.cssResolver.hasHoverRules()) {
          this.queueRender();
        }
      }

      // Modal outside-click: a press that resolves to the bare backdrop (i.e.
      // missed the panel) dismisses the layer if it opted in. The full-screen
      // modal backdrop is hit-tested first, so the layer below never sees it.
      if (ev.type === "press" && ev.button === "left") {
        const modal = this.activeScreen.topModalLayer;
        if (modal && hit === modal.root) {
          if (modal.closeOnOutsideClick) {
            log("Outside click closing top modal layer");
            this.safeInvoke("modal onClose (outside click)", () => modal.onClose?.());
          }
          this.queueRender();
          return;
        }
      }

      if (hit) {
        const hitWidget = hit;
        // A disabled control (or anything inside a disabled container) ignores
        // pointer input entirely — no activation, focus, or click.
        if (hitWidget.isDisabled()) {
          ev.handled = true;
          return;
        }
        if (hitWidget.handleMouse) {
          this.safeInvoke(
            () => `handleMouse on ${hitWidget.describe()}`,
            () => hitWidget.handleMouse(ev),
          );
        }

        if (!ev.handled) {
          if (ev.type === "press" && ev.button === "left") {
            if (hitWidget.focusable) {
              this.activeScreen.focusWidget(hitWidget);
              log(() => `Focused via click -> ${hitWidget.describe()}`);
              this.queueRender();
            }
            if (hitWidget.onClick) {
              log(() => `onClick -> ${hitWidget.describe()}`);
              this.safeInvoke(
                () => `onClick on ${hitWidget.describe()}`,
                () => hitWidget.onClick?.(ev),
              );
              this.queueRender();
            }
          } else if (ev.type === "scroll_up" || ev.type === "scroll_down") {
            let current: DOMNode | null = hitWidget;
            while (current) {
              if (current instanceof Widget) {
                const w = current;
                if (w.handleScroll) {
                  log(() => `Scroll forwarded to ${w.describe()}`);
                  this.safeInvoke(
                    () => `handleScroll on ${w.describe()}`,
                    () => w.handleScroll(ev),
                  );
                  if (ev.handled) {
                    this.queueRender();
                    break;
                  }
                }
              }
              current = current.parent;
            }
          }
        } else {
          this.queueRender();
        }
      }
    };

    // Throttle pointer *motion* to ~60 Hz. Hover-capable terminals (e.g. Ghostty
    // via 1003 any-motion) stream a move event per pixel; processing each one
    // hit-tests the tree and burns CPU during a fast drag of the mouse. We handle
    // the first move immediately (responsive hover) then coalesce a burst to the
    // latest position on a trailing tick. Non-motion events (press/release/drag/
    // scroll) are never delayed; a pending move is flushed first so ordering is
    // preserved. Terminals without hover (e.g. Windows Terminal) send no moves
    // and pay nothing here regardless.
    let pendingMove: MouseEvent | null = null;
    let moveScheduled = false;
    let lastMoveAt = 0;
    // ~30 Hz. Hover only needs to feel responsive, not match the terminal's
    // pixel-rate motion stream, so a coarser window further cuts work on
    // high-frequency terminals (Ghostty) at no perceptible cost.
    const MOVE_MIN_MS = 33;
    this.driver.on("mouse", (ev) => {
      if (ev.type === "move" && !this.activeDragWidget) {
        const now = Date.now();
        if (now - lastMoveAt >= MOVE_MIN_MS) {
          lastMoveAt = now;
          processMouse(ev);
          return;
        }
        pendingMove = ev;
        if (!moveScheduled) {
          moveScheduled = true;
          const timer = setTimeout(
            () => {
              moveScheduled = false;
              lastMoveAt = Date.now();
              const m = pendingMove;
              pendingMove = null;
              if (m) processMouse(m);
            },
            Math.max(1, MOVE_MIN_MS - (now - lastMoveAt)),
          );
          (timer as { unref?: () => void }).unref?.();
        }
        return;
      }
      // A real event: flush any coalesced move first so hover/position is current.
      if (pendingMove) {
        const m = pendingMove;
        pendingMove = null;
        processMouse(m);
      }
      processMouse(ev);
    });

    // Native terminal paste (bracketed paste) arrives as one event; route the
    // whole payload to the focused text widget as a single insert.
    this.driver.on("paste", (text) => {
      const focused = this.activeScreen.focusedWidget as ClipboardWidget | null;
      if (focused && typeof focused.insertText === "function") {
        this.safeInvoke("paste (bracketed)", () => focused.insertText?.(text));
        this.queueRender();
      }
    });
  }

  /**
   * Route a clipboard shortcut to the focused widget if it is text-capable.
   * Returns true when the key was consumed. Paste reads the framework clipboard
   * (OSC 52) asynchronously, so it resolves on a later tick.
   */
  private routeClipboardKey(ev: KeyEvent): boolean {
    const focused = this.activeScreen.focusedWidget as ClipboardWidget | null;
    if (!focused) return false;

    if (ev.ctrl && ev.shift && ev.name === "c" && typeof focused.copySelection === "function") {
      this.safeInvoke("copySelection", () => focused.copySelection?.());
      return true;
    }
    if (ev.ctrl && ev.shift && ev.name === "x" && typeof focused.cutSelection === "function") {
      this.safeInvoke("cutSelection", () => focused.cutSelection?.());
      return true;
    }
    if (ev.ctrl && !ev.shift && ev.name === "a" && typeof focused.selectAll === "function") {
      this.safeInvoke("selectAll", () => focused.selectAll?.());
      return true;
    }
    if (ev.ctrl && !ev.shift && ev.name === "v" && typeof focused.insertText === "function") {
      this.safeInvoke("paste", () => {
        Promise.resolve(this.driver.clipboard.get()).then((text) => {
          if (text) {
            this.safeInvoke("insertText (paste)", () => focused.insertText?.(text));
            this.queueRender();
          }
        });
      });
      return true;
    }
    return false;
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
  public queueRender(): void {
    this.needsLayout = true;
    this.repaintFull = true;
    this.scheduleRender();
  }

  /**
   * Schedule a **paint-only** re-render: restyle + paint, reusing the previous
   * frame's layout (regions/sizes). For high-frequency animations that change
   * appearance but never geometry — the blinking caret above all — so an idle
   * focused editor doesn't relayout the whole tree ~17×/second. If anything calls
   * {@link queueRender} in the same frame, the full path runs instead, so a
   * repaint can never mask a real layout change.
   */
  public queueRepaint(region?: { y: number; bottom: number } | null): void {
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

  /** Invoke user/widget event code without letting a throw kill the event loop. */
  private safeInvoke(what: string | (() => string), fn: () => void): void {
    try {
      fn();
    } catch (err) {
      // `what` may be a thunk so callers can avoid building a `describe()` label
      // on every (hot) invocation — it's only needed on the rare throw.
      const label = typeof what === "function" ? what() : what;
      logger.error("event", `handler threw during ${label}`, err);
    }
  }

  private layoutAndRender(): void {
    if (!this.driver.capabilitiesResolved) {
      return;
    }
    try {
      this.layoutAndRenderUnsafe();
    } catch (err) {
      // Last-resort guard: a render exception must never crash the app or leave
      // the terminal wedged. Log it and keep the previous frame on screen.
      logger.error("render", "layoutAndRender failed; keeping previous frame", err);
    }
  }

  private layoutAndRenderUnsafe(): void {
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
    if (restyle) this.resolveAllStyles(screen);
    const size = this.driver.getSize();
    if (doLayout) {
      screen.measure(screen.region.width, size.height);
      this.resolveAllLayouts(screen);
    }

    // Resolve styles and absolute layouts for screen overlays. Overlays fill the
    // screen and must be measured (so layer content can size/center itself)
    // before their subtree is laid out.
    for (const overlay of screen.overlays) {
      if (restyle) this.resolveAllStyles(overlay);
      if (doLayout) {
        overlay.measure(screen.region.width, screen.region.height);
        overlay.region = screen.region.clone();
        this.resolveAllLayouts(overlay);
      }
    }

    // Damage band for a partial frame: clamp to the screen and clip rendering to
    // those rows. renderChildren prunes subtrees that don't intersect the clip and
    // setCell drops writes outside it, so only the changed band is rebuilt; every
    // other row is retained from the previous frame (and therefore matches
    // prevBuffer, so the diff finds nothing there).
    const dmgY0 = full ? 0 : Math.max(0, Math.floor(damageTop));
    const dmgY1 = full ? size.height : Math.min(size.height, Math.ceil(damageBottom));

    if (full) {
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

    const ansiDiff = this.currentBuffer.renderDiff(
      this.prevBuffer,
      (cell, oldCell) => {
        let prefix = "";
        // Erase a stale image when the cell previously held an icon/graphic that
        // is now different or gone. Text/spaces don't clear a terminal's graphics
        // layer (esp. sixel), so without this an old icon lingers after a swap.
        const oldHadImage = !!(oldCell && (oldCell.icon || oldCell.graphic));
        if (oldHadImage && (oldCell.icon !== cell.icon || oldCell.graphic !== cell.graphic)) {
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
    if (ansiDiff) {
      this.driver.writeFrame(ansiDiff);
      this.driver.presentBuffer(this.currentBuffer);
      this.currentBuffer.copyTo(this.prevBuffer, dmgY0, dmgY1);
      this.frameCount++;
      logger.debug(
        "render",
        `frame #${this.frameCount} painted (${ansiDiff.length} bytes, ${size.width}x${size.height})`,
      );
    }
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

  private hitTest(node: DOMNode, x: number, y: number): Widget | null {
    if (!(node instanceof Widget) || !node.visible) {
      return null;
    }

    // Hit-test overlays first if this node is a Screen
    if (node instanceof Screen) {
      // Topmost-first: only allocate a sorted copy when overlays actually carry
      // differing z-indices (rare); otherwise walk newest-first in place.
      const overlays = node.overlays;
      let needsSort = false;
      for (let i = 1; i < overlays.length; i++) {
        if (
          ((overlays[i] as any).computedStyle?.zIndex ?? 0) !==
          ((overlays[0] as any).computedStyle?.zIndex ?? 0)
        ) {
          needsSort = true;
          break;
        }
      }
      const sortedOverlays = needsSort
        ? [...overlays].sort((a, b) => {
            const az = (a as any).computedStyle?.zIndex ?? 0;
            const bz = (b as any).computedStyle?.zIndex ?? 0;
            return bz - az;
          })
        : overlays;
      for (const overlay of sortedOverlays) {
        const match = this.hitTest(overlay, x, y);
        if (match) {
          // A sticky pass-through layer only captures clicks that land on its
          // panel content; clicks that resolve to the bare backdrop fall through
          // to the layer below (keeping e.g. a chatbox clickable).
          if (match === overlay && (overlay as any).passThrough) {
            continue;
          }
          return match;
        }
      }
    }

    if (!node.region.contains(x, y)) {
      return null;
    }

    if (this.isPointOnScrollbar(node, x, y)) {
      return node;
    }

    // Fast path: when no child sets a z-index (the overwhelming common case),
    // the stable z-sort is a no-op, so hit-test in document order without
    // allocating + sorting a copy at every node on every mouse event.
    const children = node.children;
    let hasZ = false;
    for (let i = 0; i < children.length; i++) {
      if (((children[i] as any).computedStyle?.zIndex ?? 0) !== 0) {
        hasZ = true;
        break;
      }
    }
    if (!hasZ) {
      for (let i = 0; i < children.length; i++) {
        const match = this.hitTest(children[i], x, y);
        if (match) return match;
      }
      return node;
    }

    const sorted = [...children].sort((a, b) => {
      const az = (a as any).computedStyle?.zIndex ?? 0;
      const bz = (b as any).computedStyle?.zIndex ?? 0;
      return bz - az;
    });

    for (const child of sorted) {
      const match = this.hitTest(child, x, y);
      if (match) {
        return match;
      }
    }

    return node;
  }

  private isPointOnScrollbar(widget: Widget, x: number, y: number): boolean {
    const parent = widget as any;
    const isScrollable = parent.scrollableX !== undefined || parent.scrollableY !== undefined;
    if (!isScrollable) return false;

    const client = parent.getClientRect();
    const content = parent.getContentRect();
    // The scrollbar is painted at the full viewport edge (outside the gutter it
    // reserves), so hit-test against that, not the gutter-shrunk content rect.
    const viewport = parent.getViewportRect ? parent.getViewportRect() : content;
    const contentSize = parent.getContentSize();
    const hasBorder = parent.computedStyle.border && parent.computedStyle.border !== "none";

    const overflowY = parent.computedStyle.overflowY || "auto";
    const showY =
      overflowY === "scroll" || (overflowY === "auto" && contentSize.height > viewport.height);
    const overflowX = parent.computedStyle.overflowX || "auto";
    const showX =
      overflowX === "scroll" || (overflowX === "auto" && contentSize.width > viewport.width);

    if (showY) {
      const vScrollbarX = hasBorder ? client.right - 1 : viewport.right - 1;
      const startY = hasBorder ? client.y + 1 : content.y;
      const endY = hasBorder ? client.bottom - 2 : content.bottom - 1;
      if (x === vScrollbarX && y >= startY && y <= endY) {
        return true;
      }
    }

    if (showX) {
      const hScrollbarY = hasBorder ? client.bottom - 1 : viewport.bottom - 1;
      const startX = hasBorder ? client.x + 1 : content.x;
      const endX = hasBorder ? client.right - 2 : content.right - 1;
      if (y === hScrollbarY && x >= startX && x <= endX) {
        return true;
      }
    }

    return false;
  }
}
