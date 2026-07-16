import type { DOMNode } from "../dom/dom.ts";
import type { Screen } from "../dom/screen.ts";
import { Widget } from "../dom/widget.ts";
import type { Driver, KeyEvent, MouseEvent, PointerShape } from "../driver/driver.ts";
import { logger } from "../utils/logger.ts";
import { hitTest } from "./hit-test.ts";

/**
 * Optional clipboard/selection surface implemented by editable text widgets
 * (`Input`, `TextArea`). Copy/cut/paste/select-all route to the focused widget
 * through this duck-typed shape without importing widget classes.
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
 * The slice of {@link App} that {@link AppInput} drives. Declared structurally
 * (like `dom/widget.ts`'s `WidgetApp`) so the input controller never imports
 * `App` directly — keeping the module edge one-directional (app → app-input)
 * and free of a dependency cycle.
 */
export interface InputHost {
  readonly driver: Driver;
  readonly activeScreen: Screen;
  readonly cssResolver: { hasHoverRules(): boolean };
  readonly selection: { active: unknown };
  readonly hotkeys: { dispatch(ev: KeyEvent, phase: "priority" | "fallback"): boolean };
  /** Whether widget `cursor` styles drive the pointer shape (App.pointerShapes). */
  readonly pointerShapes: boolean;
  queueRender(reason?: string): void;
  queueRepaintWidget(widget: Widget, reason?: string): void;
  copyActiveSelection(): string | null;
  stop(): void;
}

/**
 * Owns all terminal input: keyboard routing (clipboard shortcuts, layer
 * interception, global hotkeys, focus navigation, the focus-chain bubble),
 * pointer handling (hit-testing, hover enter/leave, drag tracking, click/scroll
 * dispatch, pointer-shape resolution) and bracketed paste. Split out of
 * {@link App} so the frame pipeline and the event subsystem live in separate
 * files; the two share state only through the {@link InputHost} surface plus the
 * hover/diagnostics getters {@link App} re-exposes.
 */
export class AppInput {
  private hoveredWidgetRef: Widget | null = null;
  private activeDragWidget: Widget | null = null;
  private readonly mouseDiagnostics = {
    rawMovesSeen: 0,
    receivedMoves: 0,
    movesDroppedNoHover: 0,
    throttledImmediate: 0,
    throttledDeferred: 0,
    sameCellSkipped: 0,
  };
  // Last pointer cell, so a stream of same-cell `move` events (terminals emit one
  // per pixel under any-motion tracking, but report cell coords) is collapsed to
  // a single hit-test — the dominant cost of hovering.
  private lastMouseX = -1;
  private lastMouseY = -1;

  // Multi-click synthesis: terminals report each press independently, so the
  // input layer tracks the previous left-press to derive a 1/2/3 click count
  // (single/double/triple) for word- and line-select. A press resets the run
  // when it is too slow or lands on a different cell.
  private lastPressAt = 0;
  private lastPressX = -1;
  private lastPressY = -1;
  private clickRun = 0;
  private static readonly MULTI_CLICK_MS = 400;

  // Pointer-motion throttling state (see handleMouse).
  private pendingMove: MouseEvent | null = null;
  private moveScheduled = false;
  private lastMoveAt = 0;
  // ~15 Hz. Hover only needs to feel responsive, not match the terminal's
  // pixel-rate motion stream, so a coarser window further cuts work on
  // high-frequency terminals (Ghostty) at no perceptible cost.
  private static readonly MOVE_MIN_MS = 66;

  constructor(private readonly host: InputHost) {}

  /** The widget currently under the pointer, or null. Surfaced via `App.hoveredWidget`. */
  public get hoveredWidget(): Widget | null {
    return this.hoveredWidgetRef;
  }

  /** A copy of the pointer-event diagnostics counters (App.getMouseDiagnostics). */
  public getDiagnostics(): Record<string, number> {
    return { ...this.mouseDiagnostics };
  }

  // Lazy + level-gated: skip building the (often `describe()`-bearing) message
  // entirely when debug logging is off, which is the default. Called per input
  // event, so eager string building dominated under a Ghostty move flood.
  private log(msg: string | (() => string)): void {
    if (!logger.isEnabled("debug")) return;
    logger.debug("app", typeof msg === "function" ? msg() : msg);
  }

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

  public handleKey(ev: KeyEvent): void {
    this.log(`Key event received: key=${ev.key}, name=${ev.name}`);
    if (this.handleCtrlC(ev)) return;

    const screen = this.host.activeScreen;

    if (this.interceptLayerKeys(ev, screen)) return;

    // Clipboard commands routed to the focused text widget. Copy/cut also bind
    // Ctrl+Shift+C/X (key "ctrl+C"/"ctrl+X" — distinguishable from a bare Ctrl+C
    // only under the Kitty keyboard protocol); paste/select-all use Ctrl+V /
    // Ctrl+A, which reach the app on every terminal. Each is guarded by a
    // capability check so non-text widgets are unaffected.
    if (this.routeClipboardKey(ev)) {
      this.host.queueRender("clipboard:shortcut");
      return;
    }

    // Global hotkeys, priority phase: modified keys (Ctrl/Alt/F-keys) can't be
    // ordinary typing, so they dispatch before the focused widget. Layer
    // interceptors above keep precedence (a dialog's nav keys win), but a
    // modal does NOT block hotkeys — the palette toggle must work everywhere.
    if (this.host.hotkeys.dispatch(ev, "priority")) {
      this.host.queueRender("key:hotkey-priority");
      return;
    }

    if (this.handleEscapeSelectionClear(ev, screen)) return;
    if (this.handleEscapeLayerClose(ev, screen)) return;
    if (this.handleTabKey(ev, screen)) return;
    if (this.bubbleKeyToFocusChain(ev, screen)) return;

    // Global hotkeys, fallback phase: bare keys ("?", "g", enter…) only fire
    // once the focus chain declined the event, so hotkeys never eat typing.
    if (this.host.hotkeys.dispatch(ev, "fallback")) {
      this.log(`Key "${ev.key}" handled by global hotkey`);
      this.host.queueRender("key:hotkey-fallback");
      return;
    }

    this.log(`Key "${ev.key}" ignored (no widget in the focused chain handled it)`);
  }

  /**
   * Ctrl+C: a registered hotkey gets first refusal, ahead of the built-in
   * copy-selection/quit behavior below — otherwise that hardcoded branch
   * always returns first and such a registration could never be reached at
   * all (unlike every other key, which always gets a priority-phase dispatch
   * later in {@link handleKey}). Falling through to the built-in behavior:
   * selection-aware quit — if a text selection is active, copy it instead of
   * exiting (the selection stays visible, standard editor behavior; Escape or
   * clicking elsewhere deselects, after which Ctrl+C quits). This is the only
   * copy path that works on terminals WITHOUT the Kitty keyboard protocol,
   * where Ctrl+Shift+C is byte-identical to a bare Ctrl+C. Returns whether the
   * key was Ctrl+C (and therefore fully handled here, one way or another).
   */
  private handleCtrlC(ev: KeyEvent): boolean {
    if (ev.key === "ctrl+c" && this.host.hotkeys.dispatch(ev, "priority")) {
      this.host.queueRender("key:hotkey-priority");
      return true;
    }
    if (ev.key !== "ctrl+c") return false;

    const focused = this.host.activeScreen.focusedWidget as ClipboardWidget | null;
    const copied = focused?.copySelection?.();
    if (copied != null) {
      ev.handled = true;
      this.host.queueRender("clipboard:copy-focused-selection");
      return true;
    }
    // Read-only (mouse) selection over a display widget copies too.
    if (this.host.selection.active && this.host.copyActiveSelection() != null) {
      ev.handled = true;
      this.host.queueRender("clipboard:copy-readonly-selection");
      return true;
    }
    // On a backend that doesn't own its host process (the web canvas, served
    // to many users), Ctrl+C must never quit — it would kill the shared page
    // and any server behind it. With nothing to copy, just swallow it.
    if (this.host.driver.capabilities.ownsProcess === false) {
      ev.handled = true;
      return true;
    }
    ev.handled = true;
    this.host.stop();
    process.exit(0);
  }

  /**
   * Layer key interception: sticky panels see keys first (top-down) so they
   * can claim navigation keys while leaving text for the focused control
   * below. A modal blocks interception from reaching layers beneath it. Runs
   * before the clipboard shortcuts in {@link handleKey} so a dialog can claim
   * e.g. Ctrl+A for its own list ("select all rows") even while a text `Input`
   * happens to be focused inside it — otherwise routeClipboardKey's
   * unconditional focused-widget check would always win and the interceptor
   * could never see the key at all.
   */
  private interceptLayerKeys(ev: KeyEvent, screen: Screen): boolean {
    for (let i = screen.layers.length - 1; i >= 0; i--) {
      const layer = screen.layers[i];
      const interceptor = layer.keyInterceptor;
      if (interceptor) {
        this.safeInvoke(`keyInterceptor on layer ${i}`, () => interceptor(ev));
        if (ev.handled) {
          this.log(`Key "${ev.key}" intercepted by layer ${i}`);
          this.host.queueRender("key:layer-interceptor");
          return true;
        }
      }
      if (layer.modal) break;
    }
    return false;
  }

  /**
   * Escape first deselects (standard editor behavior — the selection survives
   * Ctrl+C copies until explicitly dismissed), so quitting after a copy is Esc
   * then Ctrl+C.
   */
  private handleEscapeSelectionClear(ev: KeyEvent, screen: Screen): boolean {
    if (ev.key === "escape" || ev.name === "escape") {
      const focused = screen.focusedWidget as ClipboardWidget | null;
      if (focused?.hasSelection?.()) {
        this.safeInvoke("clearSelection (escape)", () => focused.clearSelection?.());
        this.host.queueRender("selection:clear-focused-escape");
        return true;
      }
      if (this.host.selection.active) {
        this.host.selection.active = null;
        this.host.queueRender("selection:clear-readonly-escape");
        return true;
      }
    }
    return false;
  }

  /**
   * Escape closes the topmost layer that opted in (modal dialog or sticky
   * panel), before its content sees the key — a focused control would
   * otherwise mark every key handled. Disable per-layer with
   * `closeOnEscape={false}` when the content needs Escape for itself.
   */
  private handleEscapeLayerClose(ev: KeyEvent, screen: Screen): boolean {
    if (ev.key === "escape" || ev.name === "escape") {
      const top = screen.layers[screen.layers.length - 1];
      if (top?.closeOnEscape) {
        this.log("Escape closing top layer");
        this.safeInvoke("layer onClose (escape)", () => top.onClose?.());
        this.host.queueRender("layer:close-escape");
        return true;
      }
    }
    return false;
  }

  /**
   * Give the focused widget first refusal on Tab: if it has in-widget Tab work
   * (e.g. accept an open completion or inline suggestion) it claims the key;
   * otherwise Tab navigates focus as usual. Returns false (letting the caller
   * fall through) only when the key isn't Tab at all — every other path
   * handles the event.
   */
  private handleTabKey(ev: KeyEvent, screen: Screen): boolean {
    if (ev.key !== "tab") return false;

    const focused = screen.focusedWidget;
    if (focused instanceof Widget && !focused.isDisabled() && focused.wantsTab(ev)) {
      this.safeInvoke(
        () => `handleKey (tab) on ${focused.describe()}`,
        () => focused.handleKey(ev),
      );
      // A focused widget consuming the key (e.g. accepting a completion) is a
      // self-contained change — repaint scoped to it, verified for layout.
      this.host.queueRepaintWidget(focused, "key:widget-handled");
      return true;
    }
    // A fallback-phase hotkey registered on "tab" gets a chance once the
    // focused widget has declined it, before the default focus-navigation
    // behavior runs — otherwise this branch always returns first and such
    // a registration could never fire.
    if (this.host.hotkeys.dispatch(ev, "fallback")) {
      this.host.queueRender("key:hotkey-fallback");
      return true;
    }
    screen.focusNext(ev.shift);
    this.log(() => `Focus moved to: ${screen.focusedWidget?.describe() ?? "(none)"}`);
    this.host.queueRender("focus:tab-navigation");
    return true;
  }

  /**
   * Bubble the key event up from the focused widget. A disabled focused
   * widget (e.g. it was disabled while focused) swallows nothing — skip its
   * chain so input can't reach an inert control.
   */
  private bubbleKeyToFocusChain(ev: KeyEvent, screen: Screen): boolean {
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
      this.log(() => `Key "${ev.key}" handled by ${handledBy.describe()}`);
      // Typing/editing in the focused control is local: repaint scoped to the
      // handler's subtree (which contains the focused descendant). The geometry
      // check upgrades to a full frame if the keystroke actually resized it (a
      // growing textarea, reflowed content), and any app-state cascade routes
      // through React's own queueRender, so this never hides a wider change.
      this.host.queueRepaintWidget(handledBy, "key:widget-handled");
      return true;
    }
    return false;
  }

  private processMouse(ev: MouseEvent): void {
    if (this.shouldSkipDuplicateMove(ev)) return;
    if (this.shouldSkipUninterestingMove(ev)) return;

    const hit = this.resolveMouseHit(ev);

    this.log(
      () =>
        `Mouse ${ev.type} @ (${ev.x},${ev.y}) btn=${ev.button} -> hit: ${hit?.describe() ?? "none"}`,
    );

    if (ev.type === "release") {
      this.activeDragWidget = null;
    }

    this.updateHoverState(hit, ev);
    this.updatePointerShape(hit, ev);

    if (this.dismissModalOnOutsideClick(ev, hit)) return;

    this.dispatchMouseToHitWidget(hit, ev);
  }

  /**
   * Collapse redundant same-cell motion. Under any-motion tracking (1003) a
   * hover sends a move per pixel; without a button down, a move that stays in
   * the same cell can't change the hovered widget or a drag, so it is pure
   * overhead (a full tree hit-test) — skip it.
   */
  private shouldSkipDuplicateMove(ev: MouseEvent): boolean {
    if (ev.type === "move" && ev.x === this.lastMouseX && ev.y === this.lastMouseY) {
      this.mouseDiagnostics.sameCellSkipped += 1;
      return true;
    }
    this.lastMouseX = ev.x;
    this.lastMouseY = ev.y;
    return false;
  }

  /** A move that can't affect hover (no drag, no `:hover` rules, no widget hover interest) is pure overhead. */
  private shouldSkipUninterestingMove(ev: MouseEvent): boolean {
    return (
      ev.type === "move" &&
      !this.activeDragWidget &&
      !this.host.cssResolver.hasHoverRules() &&
      !this.screenHasHoverInterest(this.host.activeScreen)
    );
  }

  /**
   * Hit-test the pointer position (pinned to the drag widget for `drag`/
   * `release`), and — on `press` — update drag/multi-click bookkeeping.
   */
  private resolveMouseHit(ev: MouseEvent): Widget | null {
    let hit = hitTest(this.host.activeScreen, ev.x, ev.y);

    if (this.activeDragWidget && (ev.type === "drag" || ev.type === "release")) {
      hit = this.activeDragWidget;
    }
    if (ev.type === "press") {
      this.activeDragWidget = hit;
      if (ev.button === "left") {
        // Derive the consecutive-click count (1/2/3, cycling) so widgets can
        // word- and line-select. A slow press or one on a different cell starts
        // a fresh run.
        const now = Date.now();
        const fast = now - this.lastPressAt <= AppInput.MULTI_CLICK_MS;
        const sameCell = ev.x === this.lastPressX && ev.y === this.lastPressY;
        this.clickRun = fast && sameCell ? Math.min(3, this.clickRun + 1) : 1;
        this.lastPressAt = now;
        this.lastPressX = ev.x;
        this.lastPressY = ev.y;
        ev.clickCount = this.clickRun;
        // A new left-press drops any prior read-only selection; the hit widget's
        // handleMouse re-establishes one if it is selectable.
        if (this.host.selection.active) {
          this.host.selection.active = null;
          this.host.queueRender("selection:clear-readonly-press");
        }
      }
    }
    return hit;
  }

  /** Fire onMouseLeave/onMouseEnter and queue a hover-CSS repaint when the hovered widget changes. */
  private updateHoverState(hit: Widget | null, ev: MouseEvent): void {
    if (hit !== this.hoveredWidgetRef) {
      const oldHovered = this.hoveredWidgetRef;
      this.hoveredWidgetRef = hit;

      if (oldHovered?.onMouseLeave) {
        this.log(() => `onMouseLeave -> ${oldHovered.describe()}`);
        this.safeInvoke(
          () => `onMouseLeave on ${oldHovered.describe()}`,
          () => oldHovered.onMouseLeave?.(ev),
        );
      }
      if (hit?.onMouseEnter) {
        this.log(() => `onMouseEnter -> ${hit.describe()}`);
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
      if (this.host.cssResolver.hasHoverRules()) {
        this.host.queueRender("mouse:hover-css");
      }
    }
  }

  /**
   * Push the pointer shape (OSC 22) for the cell under the cursor. Resolved
   * every processed move — not just on widget boundary crossings — so a
   * shape that varies *within* a widget (e.g. a list's rows vs its scrollbar
   * gutter) updates too. `setPointerShape` dedupes redundant writes.
   */
  private updatePointerShape(hit: Widget | null, ev: MouseEvent): void {
    if (this.host.pointerShapes && this.host.driver.capabilities.pointerShapes) {
      const dragging = this.activeDragWidget;
      const target = dragging ?? hit;
      this.host.driver.setPointerShape(this.resolveCursorShape(target, ev.x, ev.y));
    }
  }

  /**
   * Modal outside-click: a press that resolves to the bare backdrop (i.e.
   * missed the panel) dismisses the layer if it opted in. The full-screen
   * modal backdrop is hit-tested first, so the layer below never sees it.
   * Returns whether the event was consumed this way.
   */
  private dismissModalOnOutsideClick(ev: MouseEvent, hit: Widget | null): boolean {
    if (ev.type === "press" && ev.button === "left") {
      const modal = this.host.activeScreen.topModalLayer;
      if (modal && hit === modal.root) {
        if (modal.closeOnOutsideClick) {
          this.log("Outside click closing top modal layer");
          this.safeInvoke("modal onClose (outside click)", () => modal.onClose?.());
          // The press in resolveMouseHit already set activeDragWidget to the
          // modal root; onClose typically detaches it. Left set, the next
          // release/drag event would force `hit` back to this now-detached
          // widget and run hover enter/leave / pointer-shape resolution
          // against it.
          this.activeDragWidget = null;
        }
        this.host.queueRender("layer:close-outside-click");
        return true;
      }
    }
    return false;
  }

  /** Dispatch handleMouse, then onMouseDown/focus/onClick or scroll-forwarding, to the hit widget. */
  private dispatchMouseToHitWidget(hit: Widget | null, ev: MouseEvent): void {
    if (!hit) return;
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
      // Any-button press fires onMouseDown first, so a right-click can be
      // observed (e.g. to open a context menu) before the left-only
      // focus/onClick path below. Handling it here suppresses both. The
      // handler bubbles to the nearest ancestor that defines it, so a click
      // on a leaf (e.g. a Label) still reaches a clickable container's
      // handler — handlers don't have to sit on the exact hit widget.
      if (ev.type === "press") {
        const target = this.findAncestorHandler(hitWidget, "onMouseDown");
        if (target) {
          this.log(() => `onMouseDown (${ev.button}) -> ${target.describe()}`);
          this.safeInvoke(
            () => `onMouseDown on ${target.describe()}`,
            () => target.onMouseDown?.(ev),
          );
          this.host.queueRepaintWidget(target, "mouse:down");
        }
      }
      if (!ev.handled && ev.type === "press" && ev.button === "left") {
        // The clicked widget itself, or — when it can't take focus — the first
        // focusable inside the nearest `focusOnClick` container (so clicking a
        // form/panel's chrome hands focus to its first field).
        const focusTarget = hitWidget.focusable
          ? hitWidget
          : firstFocusableInClickContainer(hitWidget);
        if (focusTarget) {
          const prevFocused = this.host.activeScreen.focusedWidget;
          // Pointer focus must not scroll: the user clicked a visible cell, and
          // a read-only selection may have just anchored on this same press —
          // scrolling here would shift that anchor off the clicked content.
          this.host.activeScreen.focusWidget(focusTarget, { scroll: false });
          this.log(() => `Focused via click -> ${focusTarget.describe()}`);
          // Focus moves the ring between two fixed-size widgets — repaint both
          // (old loses the ring, new gains it), scoped + geometry-verified.
          if (prevFocused instanceof Widget && prevFocused !== focusTarget) {
            this.host.queueRepaintWidget(prevFocused, "focus:mouse-press");
          }
          this.host.queueRepaintWidget(focusTarget, "focus:mouse-press");
        }
        // onClick bubbles to the nearest ancestor handler too.
        const target = this.findAncestorHandler(hitWidget, "onClick");
        if (target) {
          this.log(() => `onClick -> ${target.describe()}`);
          this.safeInvoke(
            () => `onClick on ${target.describe()}`,
            () => target.onClick?.(ev),
          );
          // The click's own visual is local; any app-state cascade an onClick
          // triggers routes through React's full queueRender, so this can't hide
          // a wider change.
          this.host.queueRepaintWidget(target, "mouse:click");
        }
      } else if (ev.type === "scroll_up" || ev.type === "scroll_down") {
        let current: DOMNode | null = hitWidget;
        while (current) {
          if (current instanceof Widget) {
            const w = current;
            if (w.handleScroll) {
              this.log(() => `Scroll forwarded to ${w.describe()}`);
              this.safeInvoke(
                () => `handleScroll on ${w.describe()}`,
                () => w.handleScroll(ev),
              );
              if (ev.handled) {
                // Scrolling shifts content within the widget's fixed region
                // (scrollOffset isn't layout) — scope the repaint to it.
                this.host.queueRepaintWidget(w, "mouse:scroll-handled");
                break;
              }
            }
          }
          current = current.parent;
        }
      }
    } else {
      // The hit widget consumed the event (e.g. a toggle/slider/custom control);
      // its change is local to its subtree, so scope + verify.
      this.host.queueRepaintWidget(hitWidget, "mouse:handled");
    }
  }

  /**
   * Driver entry point for a pointer event. Throttles pointer *motion* to ~15 Hz:
   * hover-capable terminals (e.g. Ghostty via 1003 any-motion) stream a move per
   * pixel, and processing each one hit-tests the tree and burns CPU during a fast
   * drag. We handle the first move immediately (responsive hover) then coalesce a
   * burst to the latest position on a trailing tick. Non-motion events
   * (press/release/drag/scroll) are never delayed; a pending move is flushed first
   * so ordering is preserved. Terminals without hover send no moves and pay
   * nothing here regardless.
   */
  public handleMouse(ev: MouseEvent): void {
    if (ev.type === "move") this.mouseDiagnostics.rawMovesSeen += 1;
    if (
      ev.type === "move" &&
      !this.activeDragWidget &&
      this.host.driver.enforcesRuntimeHoverMode &&
      this.host.driver.capabilities.mouseHover === false
    ) {
      this.mouseDiagnostics.movesDroppedNoHover += 1;
      return;
    }
    if (ev.type === "move") this.mouseDiagnostics.receivedMoves += 1;
    if (ev.type === "move" && !this.activeDragWidget) {
      const now = Date.now();
      if (now - this.lastMoveAt >= AppInput.MOVE_MIN_MS) {
        this.lastMoveAt = now;
        this.mouseDiagnostics.throttledImmediate += 1;
        this.processMouse(ev);
        return;
      }
      this.pendingMove = ev;
      if (!this.moveScheduled) {
        this.moveScheduled = true;
        const timer = setTimeout(
          () => {
            this.moveScheduled = false;
            this.lastMoveAt = Date.now();
            const m = this.pendingMove;
            this.pendingMove = null;
            if (m) {
              this.mouseDiagnostics.throttledDeferred += 1;
              this.processMouse(m);
            }
          },
          Math.max(1, AppInput.MOVE_MIN_MS - (now - this.lastMoveAt)),
        );
        (timer as { unref?: () => void }).unref?.();
      }
      return;
    }
    // A real event: flush any coalesced move first so hover/position is current.
    if (this.pendingMove) {
      const m = this.pendingMove;
      this.pendingMove = null;
      this.processMouse(m);
    }
    this.processMouse(ev);
  }

  /**
   * Native terminal paste (bracketed paste) arrives as one event; route the
   * whole payload to the focused text widget as a single insert.
   */
  public handlePaste(text: string): void {
    const focused = this.host.activeScreen.focusedWidget as ClipboardWidget | null;
    if (focused && typeof focused.insertText === "function") {
      this.safeInvoke("paste (bracketed)", () => focused.insertText?.(text));
      this.host.queueRender("clipboard:paste-bracketed");
    }
  }

  /**
   * Route a clipboard shortcut to the focused widget if it is text-capable.
   * Returns true when the key was consumed. Paste reads the framework clipboard
   * (OSC 52) asynchronously, so it resolves on a later tick.
   */
  private routeClipboardKey(ev: KeyEvent): boolean {
    const focused = this.host.activeScreen.focusedWidget as ClipboardWidget | null;
    if (!focused) return false;
    // A disabled focused widget (e.g. disabled while it still held focus)
    // must not accept paste/select-all/copy/cut either — it swallows nothing,
    // same as the normal key-bubbling guard below.
    if (focused instanceof Widget && focused.isDisabled()) return false;

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
        Promise.resolve(this.host.driver.clipboard.get()).then((text) => {
          if (text) {
            this.safeInvoke("insertText (paste)", () => focused.insertText?.(text));
            this.host.queueRender("clipboard:paste-shortcut");
          }
        });
      });
      return true;
    }
    return false;
  }

  private resolveCursorShape(hit: Widget | null, x: number, y: number): PointerShape | null {
    let node: DOMNode | null = hit;
    while (node) {
      if (node instanceof Widget && node.visible) {
        const shape = node.cursorShapeAt(x, y);
        if (shape) return shape;
      }
      node = node.parent;
    }
    return null;
  }

  private screenHasHoverInterest(screen: Screen): boolean {
    const screenRegion = screen.region;
    let interested = false;
    const check = (node: DOMNode) => {
      if (interested) return;
      if (
        node instanceof Widget &&
        node.visible &&
        (node.hoverInterest ||
          (this.host.pointerShapes &&
            this.host.driver.capabilities.pointerShapes &&
            node.hasCursorStyle())) &&
        node.region.width > 0 &&
        node.region.height > 0 &&
        node.region.overlaps(screenRegion)
      ) {
        interested = true;
      }
    };
    screen.walk(check);
    // Overlay layers (dialogs, context menus) live outside the child tree, so
    // walk them too — otherwise a hover-only overlay (e.g. an open menu) would
    // leave passive-hover tracking disabled and never highlight on hover.
    for (const overlay of screen.overlays) overlay.walk(check);
    return interested;
  }

  public syncMouseHoverMode(): void {
    const enabled =
      this.host.cssResolver.hasHoverRules() || this.screenHasHoverInterest(this.host.activeScreen);
    this.host.driver.setMouseHover(enabled);
  }

  /**
   * Walk up from `widget` (inclusive) to the nearest ancestor that defines the
   * pointer handler `prop` (`onClick` / `onMouseDown`), or null. Lets a handler
   * on a container fire for a click that hit-tests to one of its leaf children —
   * pointer handlers bubble, matching the scroll-forwarding behaviour.
   */
  private findAncestorHandler(widget: Widget, prop: "onClick" | "onMouseDown"): Widget | null {
    let current: DOMNode | null = widget;
    while (current) {
      if (current instanceof Widget && current[prop]) return current;
      current = current.parent;
    }
    return null;
  }
}

/**
 * For a click that landed on a non-focusable `widget`, find the first focusable
 * descendant of the nearest ancestor (inclusive) marked `focusOnClick` — so
 * clicking a `Form`/`Panel`/`Box` chrome hands focus to its first field. Returns
 * null when no such container is in the chain (the click focuses nothing).
 */
function firstFocusableInClickContainer(widget: Widget): Widget | null {
  let container: DOMNode | null = widget;
  while (container && !(container instanceof Widget && container.focusOnClick)) {
    container = container.parent;
  }
  if (!(container instanceof Widget)) return null;
  let found: Widget | null = null;
  // Document order, not paint (z-index) order — see DOMNode.walk's doc comment.
  container.walkDocumentOrder((node) => {
    if (!found && node instanceof Widget && node.focusable && node.visible && !node.isDisabled()) {
      found = node;
    }
  });
  return found;
}
