import { requestAnimationTick, requestCosmeticRepaint } from "../anim/animation.ts";
import { ColorTween, Tween, type TweenOptions } from "../anim/tween.ts";
import type { KeyEvent, MouseEvent, PointerShape } from "../driver/driver.ts";
import { Offset } from "../geometry/offset.ts";
import { parseDimension } from "../geometry/parse-dimension.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Spacing } from "../geometry/spacing.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { mix, parseColor, rgbStr } from "../render/color.ts";
import { stringWidth } from "../render/segment.ts";
import { Style } from "../render/style.ts";
import { themeBlendBase } from "../theme.ts";
import { logger } from "../utils/logger.ts";
import { DOMNode } from "./dom.ts";
import { TextNode } from "./text-node.ts";

/** A node's paint z-index — only {@link Widget}s carry one; everything else is 0. */
function zIndexOf(node: DOMNode): number {
  return node instanceof Widget ? (node.computedStyle.zIndex ?? 0) : 0;
}

/**
 * A widget's semantic identity for non-visual output (see
 * {@link Widget.getAccessibleNode} and {@link Screen.toAccessibleText}).
 */
export interface AccessibleNode {
  /** Coarse role, defaults to the widget's tag (e.g. `button`, `input`). */
  role: string;
  /** Human-readable label (inline text, or a `label` prop). */
  label: string;
  /** Current value, when the control has one (input text, slider number, …). */
  value?: string;
  /** State flags such as `focused`, `disabled`, `checked`. */
  state?: string[];
}

/**
 * @internal
 * The slice of the owning `App` that widgets reach through {@link Widget.app}:
 * render scheduling, the focus-bearing active screen, and the style resolver.
 * Declared structurally (dependency inversion) so the DOM layer carries no
 * import edge to `core/app` — `App` satisfies this shape. Methods on
 * `cssResolver` mirror `CSSResolver` without importing it (which would be an
 * upward `dom → css` dependency).
 */
export interface WidgetApp {
  queueRender(reason?: string): void;
  /** Paint-only re-render that reuses the current layout; an optional region scopes the damage. */
  queueRepaint(region?: { y: number; bottom: number } | null, reason?: string): void;
  activeScreen: { focusWidget(widget: Widget): void };
  cssResolver: {
    resolveVariable(widget: Widget, value: string): string;
    resolveStyles(widget: Widget, isHovered: boolean): WidgetStyles;
  };
  /**
   * Read-only text-selection manager. Selectable widgets register their visible
   * runs here each frame (the run shape mirrors `SelectableRun` in
   * `core/selection`, inlined to keep the DOM layer free of an upward import).
   */
  selection: {
    addRun(run: { widget: Widget; line: number; y: number; x: number; cols: number[] }): void;
  };
}

/** Inline style properties for a widget — the `style` prop's shape. See the Styling and Layout guides. */
export interface WidgetStyles {
  /** Foreground/text color: hex, named, or `$token`. */
  color?: string;
  /** Background color: hex, named, `$token`, or `"transparent"`. */
  background?: string;
  /** Width: cells (`10`), `"50%"`, `"3fr"`, or `"auto"`. */
  width?: string | number;
  /** Height: cells, `"%"`, `"fr"`, or `"auto"`. */
  height?: string | number;
  /** Minimum width in cells. */
  minWidth?: number;
  /** Minimum height in cells. */
  minHeight?: number;
  /** Maximum width in cells. */
  maxWidth?: number;
  /** Maximum height in cells. */
  maxHeight?: number;
  /** Space outside the border: number (all sides), per-side object, or {@link Spacing}. */
  margin?: Spacing | number | { top?: number; right?: number; bottom?: number; left?: number };
  /** Space inside the border, before content. */
  padding?: Spacing | number | { top?: number; right?: number; bottom?: number; left?: number };
  /** Border style: `"rounded"` (default), `"solid"`, `"double"`, `"dashed"`, or `"none"`. */
  border?: string;
  /** Border color: hex, named, or `$token`. */
  borderColor?: string;
  /** Child flow direction / mode: vertical, horizontal, dock, or grid. */
  layout?: "vertical" | "horizontal" | "dock" | "grid";
  /** Pin this child to an edge of a `dock` parent. */
  dock?: "top" | "right" | "bottom" | "left";
  /** Horizontal alignment of children on the cross axis. */
  align?: "left" | "center" | "right";
  /** Vertical alignment of children on the cross axis. */
  verticalAlign?: "top" | "middle" | "bottom";
  /** `"absolute"` takes the widget out of flow, positioned by left/top/right/bottom. */
  position?: "relative" | "absolute";
  /** Offset from the parent's left edge when positioned. */
  left?: number | string;
  /** Offset from the parent's top edge when positioned. */
  top?: number | string;
  /** Offset from the parent's right edge when positioned. */
  right?: number | string;
  /** Offset from the parent's bottom edge when positioned. */
  bottom?: number | string;
  /** Stacking order among siblings (higher paints on top). */
  zIndex?: number;
  /** Layout mode alias: `"flex"` (use `flexDirection`), `"grid"`, or `"dock"`. */
  display?: "flex" | "grid" | "dock";
  /** Flex flow when `display: "flex"`: `"row"` (horizontal) or `"column"` (vertical). */
  flexDirection?: "row" | "column";
  /** Share of leftover space along the flow axis (equivalent to `N fr`). */
  flexGrow?: number;
  /** Bold/bright text. */
  bold?: boolean;
  /** Italic text. */
  italic?: boolean;
  /** Underlined text. */
  underline?: boolean;
  /** Swap foreground and background. */
  reverse?: boolean;
  /** Reduced-intensity text. */
  dim?: boolean;
  /** Struck-through text. */
  strikethrough?: boolean;
  /** Hyperlink target (OSC 8) where the terminal supports it. */
  link?: string;
  /**
   * Mouse-pointer shape shown while the pointer is over this widget, named after
   * the CSS `cursor` property (`"pointer"`, `"text"`, `"grab"`, `"not-allowed"`,
   * `"col-resize"` → `"ew-resize"`, …). Inherited from the nearest ancestor that
   * sets it. Requires terminal OSC 22 support (see
   * {@link TerminalCapabilities.pointerShapes}); ignored otherwise.
   */
  cursor?: PointerShape;
  /** Horizontal overflow: clip (`"hidden"`, default), `"scroll"`/`"auto"`, or `"visible"`. */
  overflowX?: "scroll" | "auto" | "hidden" | "visible";
  /** Vertical overflow handling (see {@link overflowX}). */
  overflowY?: "scroll" | "auto" | "hidden" | "visible";
}

/**
 * Base class for every visual node in the tree, and the extension point for
 * custom widgets. Subclass it, override the methods below, then make it usable:
 * `registerElement("ztui-mywidget", () => new MyWidget())` (from `ztui`) and, for
 * JSX, `hostComponent("ztui-mywidget")` (from `ztui/react`). See the
 * "Extending ztui" guide.
 *
 * The lifecycle each frame is **measure → layout → render**:
 * - {@link measure} computes your intrinsic size from the offered space (called
 *   bottom-up, so children are measured first).
 * - The layout engine assigns your {@link region} from your styles.
 * - {@link render} paints cells into the {@link ScreenBuffer} for your region.
 *
 * Input arrives through {@link handleKey} / {@link handleMouse} /
 * {@link handleScroll} when the widget is focused or hit-tested; set
 * {@link focusable} to take keyboard focus. {@link onMount} / {@link onUnmount}
 * bracket the widget's time in the live tree.
 *
 * The override methods listed here form the **stable extension contract**.
 * Anything not documented as overridable is internal plumbing and may change.
 */
export class Widget extends DOMNode {
  /** Opt-in hint: this widget visually or behaviorally cares about passive hover motion. */
  public hoverInterest = false;
  /** Author-set inline styles; override the widget's `defaultStyle` key-by-key. */
  public style: WidgetStyles = {};
  /** The widget's built-in look, overridden by `style`. Set by subclasses. */
  public defaultStyle: WidgetStyles = {};
  private _computedStyle: WidgetStyles | null = null;
  // One-shot flags so a persistently-failing widget logs once, not every frame.
  private _renderErrorLogged = false;
  private _measureErrorLogged = false;
  /** Fully resolved styles for this frame ($tokens, hover/focus, defaults folded in). Read this in `render`, not `style`. */
  public get computedStyle(): WidgetStyles {
    return this._computedStyle || this.style;
  }
  /** Set by the engine each frame after resolving styles; you rarely set this yourself. */
  public set computedStyle(val: WidgetStyles) {
    this._computedStyle = val;
  }

  /**
   * The widget's intrinsic pointer shape from its *role* (a button is
   * clickable, an input edits text), independent of any author `cursor` style.
   * The base maps an `onClick` handler to `"pointer"`; interactive widget
   * subclasses override this (e.g. `InputWidget` → `"text"`). Returns `null`
   * for non-interactive widgets. Authors override the result with a `cursor`
   * style; a disabled interactive widget shows `"not-allowed"`.
   */
  protected defaultCursor(): PointerShape | null {
    return this.onClick ? "pointer" : null;
  }

  /**
   * The mouse-pointer shape shown over this widget, or `null` (default arrow).
   * An explicit `cursor` style wins (resolved style first, so a `:hover` rule
   * applies); otherwise the role-based {@link defaultCursor} is used. A disabled
   * interactive widget always reports `"not-allowed"`.
   */
  public get cursorShape(): PointerShape | null {
    const explicit = this.computedStyle.cursor ?? this.style.cursor ?? this.defaultStyle.cursor;
    const semantic = this.defaultCursor();
    if ((explicit != null || semantic != null || this.focusable) && this.isDisabled()) {
      return "not-allowed";
    }
    return explicit ?? semantic ?? null;
  }

  /**
   * The pointer shape at a specific cell (absolute screen coordinates), letting
   * a widget vary the cursor across its own area — e.g. a list returns its
   * `pointer` over rows but the default arrow over its scrollbar gutter. The
   * base ignores position and returns {@link cursorShape}; override for
   * sub-region control. Returning `null` defers to the ancestor / default arrow.
   */
  public cursorShapeAt(_x: number, _y: number): PointerShape | null {
    return this.cursorShape;
  }

  /** Whether the pointer takes on any shape over this widget (style or role). */
  public hasCursorStyle(): boolean {
    return this.cursorShape != null;
  }

  /**
   * The {@link App} that owns this widget, found by walking the parent chain to
   * the tree root (the `App` node sets `screen.parent = this`). Returns `null`
   * when the widget is detached (e.g. mid-construction, before it's mounted).
   *
   * Prefer this over the `App.instance` singleton for anything that must act on
   * *this* widget's app — style resolution, render scheduling — so multiple live
   * apps (tests, the web backend) don't resolve each other's trees.
   */
  public get app(): WidgetApp | null {
    let node: DOMNode | null = this;
    while (node) {
      if (node.tagName === "app") return node as unknown as WidgetApp;
      node = node.parent;
    }
    return null;
  }
  /** This widget's rectangle in terminal cells, assigned by the layout engine. */
  public region: Region = Region.EMPTY;
  /** Intrinsic width from the last `measure`, before layout distributes space. */
  public measuredWidth = 0;
  /** Intrinsic height from the last `measure`. */
  public measuredHeight = 0;
  /** Scroll position of this widget's content (see {@link Scrollable}). */
  public scrollOffset: Offset = Offset.ORIGIN;
  /** Whether this widget can take keyboard focus. */
  public focusable = false;
  /** True while this widget holds keyboard focus. */
  public focused = false;
  /** Whether this widget renders and participates in layout. */
  public visible = true;
  /**
   * When true, this widget (and its descendants) are inert: not focusable, they
   * ignore key/mouse input, and interactive controls render in a muted style.
   * Set via the `disabled` prop. Checked through {@link isDisabled} so disabling
   * a container disables everything inside it.
   */
  public disabled = false;
  /**
   * When true, a read-only text selection started on any descendant is anchored
   * to *this* widget's region instead of the leaf, so a drag can span the
   * composed children (e.g. selecting across the paragraphs/code blocks a
   * Markdown widget renders into separate leaves). See `widgets/readonly-selection`.
   */
  public selectionContainer = false;
  /**
   * Whether this widget's selectable content participates in read-only text
   * selection. Default true; set false on chrome leaves (e.g. Markdown list
   * bullets / horizontal rules) so they register no content runs and are skipped.
   */
  public selectable = true;
  /**
   * When true, an absolutely-positioned child is pinned to its parent's viewport
   * and is NOT shifted by the parent's scroll offset (CSS `position: fixed`
   * semantics). Used by overlay chrome like the copy button so it stays in the
   * top-right corner instead of scrolling away with the content.
   */
  public positionFixed = false;
  /**
   * Original source text for this subtree (e.g. the raw markdown of the block a
   * Markdown widget rendered it from). When a read-only selection fully covers
   * the subtree's content, copy emits this verbatim instead of the rendered
   * text, so copied markdown round-trips its formatting.
   */
  public selectionRaw: string | null = null;
  /** Structural/accessible label; also the tab title inside `TabContainer`. */
  public label?: string;
  private _theme?: string;
  /** Theme name applied to this subtree; descendants resolve `$tokens` against it. */
  public get theme(): string | undefined {
    return this._theme;
  }
  /** Apply a theme name to this subtree (descendants resolve `$tokens` against it). */
  public set theme(val: string | undefined) {
    this._theme = val;
  }

  /** Pointer click handler. */
  public onClick?: (ev: any) => void;
  /**
   * Pointer pressed on this widget, for *any* button — fired on `press` before
   * the left-button focus/`onClick` path. The event carries `button` and
   * `x`/`y`, so this is how to react to a right-click (e.g. open a context
   * menu). Set `ev.handled = true` to suppress the default focus/click.
   */
  public onMouseDown?: (ev: MouseEvent) => void;
  /** Key handler invoked while focused (the base {@link handleKey} forwards here). */
  public onKey?: (ev: any) => void;
  /** Wheel/scroll handler (the base {@link handleScroll} forwards here). */
  public onScroll?: (ev: MouseEvent) => void;
  /** Called when the pointer enters this widget's region. */
  public onMouseEnter?: (ev: any) => void;
  /** Called when the pointer leaves this widget's region. */
  public onMouseLeave?: (ev: any) => void;
  // Pointer-drag lifecycle, emitted by the base handleMouse so any widget can be
  // a drag source (e.g. a panel rail icon dragged to re-dock). `onDragEnd`'s
  // `moved` flag distinguishes a drag from a plain tap (no pointer movement).
  /** Drag began on this widget (pointer pressed). */
  public onDragStart?: (x: number, y: number) => void;
  /** Pointer moved while dragging from this widget. */
  public onDragMove?: (x: number, y: number) => void;
  /** Drag released; `moved` is false for a tap with no movement. */
  public onDragEnd?: (x: number, y: number, moved: boolean) => void;
  private _dragActive = false;
  private _dragMoved = false;
  private _dragStartX = 0;
  private _dragStartY = 0;

  // Reconciler-managed handlers, typed as the universal function supertype so
  // the React binding can assign them without casts; subclasses redeclare them
  // with their precise signatures (contravariance makes any concrete signature
  // assignable to `(...args: never[]) => void`). `declare` keeps these purely
  // type-level: no instance field is emitted, so subclass fields and accessors
  // (e.g. InputWidget's `set onValidate`) are not shadowed at runtime. The base
  // class never invokes these — only subclasses that narrow the type do.
  /** @internal */ public declare onAction?: (...args: never[]) => void;
  /** @internal */ public declare onChange?: (...args: never[]) => void;
  /** @internal */ public declare onSelect?: (...args: never[]) => void;
  /** @internal */ public declare onActivate?: (...args: never[]) => void;
  /** @internal */ public declare onSortChange?: (...args: never[]) => void;
  /** @internal */ public declare onToggleGroup?: (...args: never[]) => void;
  /** @internal */ public declare onViewportChange?: (...args: never[]) => void;
  /** @internal */ public declare onViewChange?: (...args: never[]) => void;
  /** @internal */ public declare onToggle?: (...args: never[]) => void;
  /** @internal */ public declare onExpandedChange?: (...args: never[]) => void;
  /** @internal */ public declare onValidate?: (...args: never[]) => void;
  /** @internal */ public declare onSubmit?: (...args: never[]) => void;
  /** @internal */ public declare onResize?: (...args: never[]) => void;
  /** @internal */ public declare onInterrupt?: (...args: never[]) => void;
  /** @internal */ public declare onCommand?: (...args: never[]) => void;
  /** @internal */ public declare onAttach?: (...args: never[]) => void;
  /** @internal */ public declare onAttachRemove?: (...args: never[]) => void;
  /** @internal */ public declare onHintsChange?: (...args: never[]) => void;
  /** @internal */ public declare onDismiss?: (...args: never[]) => void;

  /**
   * Handle a wheel/scroll event. Override to scroll your own content; set
   * `ev.handled = true` to stop it bubbling. The base forwards to `onScroll`.
   */
  public handleScroll(ev: MouseEvent): void {
    if (this.onScroll) {
      this.onScroll(ev);
      ev.handled = true;
    }
  }

  /**
   * Handle a key event while this widget is focused. Override to implement
   * keyboard interaction; mark `ev.handled = true` for keys you consume so they
   * don't fall through to global hotkeys. The base forwards to `onKey`. Requires
   * {@link focusable} to be true to receive focus.
   */
  public handleKey(ev: KeyEvent): void {
    if (this.onKey) {
      this.onKey(ev);
      ev.handled = true;
    }
  }

  /**
   * Return true to claim a Tab/Shift+Tab press *before* it triggers focus
   * traversal. The app consults the focused widget; when it returns true the
   * key is dispatched to {@link handleKey} (to consume it) instead of moving
   * focus. Default false, so Tab navigates as usual — override only for the
   * states where Tab does in-widget work (e.g. accepting an open completion or
   * inline suggestion), and return false again once there's nothing to accept so
   * the next Tab moves on.
   */
  public wantsTab(_ev: KeyEvent): boolean {
    return false;
  }

  /**
   * Handle a mouse event hit-tested to this widget (press/release/drag/move).
   * Override for click/drag interaction; call `super.handleMouse(ev)` to keep
   * the built-in drag-source lifecycle (`onDragStart`/`onDragMove`/`onDragEnd`).
   * Set `ev.handled = true` to consume the event.
   */
  public handleMouse(ev: MouseEvent): void {
    // Drag-source lifecycle. Only engages when a drag handler is attached, so
    // ordinary widgets are unaffected. Subclasses that override handleMouse get
    // this for free as long as they call super.handleMouse(ev).
    if (!this.onDragStart && !this.onDragMove && !this.onDragEnd) return;

    if (ev.type === "press" && ev.button === "left") {
      this._dragActive = true;
      this._dragMoved = false;
      this._dragStartX = ev.x;
      this._dragStartY = ev.y;
      this.onDragStart?.(ev.x, ev.y);
      ev.handled = true;
    } else if (ev.type === "drag" && this._dragActive) {
      if (ev.x !== this._dragStartX || ev.y !== this._dragStartY) this._dragMoved = true;
      this.onDragMove?.(ev.x, ev.y);
      ev.handled = true;
    } else if (ev.type === "release" && this._dragActive) {
      this._dragActive = false;
      this.onDragEnd?.(ev.x, ev.y, this._dragMoved);
      ev.handled = true;
    }
  }

  constructor(tagName = "widget") {
    super(tagName);
  }

  /** This widget's margin as a normalized {@link Spacing}. */
  public get margin(): Spacing {
    const m = this.computedStyle.margin;
    if (m instanceof Spacing) return m;
    if (typeof m === "number") return new Spacing(m, m, m, m);
    if (m && typeof m === "object") {
      return new Spacing(m.top ?? 0, m.right ?? 0, m.bottom ?? 0, m.left ?? 0);
    }
    return Spacing.ZERO;
  }

  /** This widget's padding as a normalized {@link Spacing}. */
  public get padding(): Spacing {
    const p = this.computedStyle.padding;
    if (p instanceof Spacing) return p;
    if (typeof p === "number") return new Spacing(p, p, p, p);
    if (p && typeof p === "object") {
      return new Spacing(p.top ?? 0, p.right ?? 0, p.bottom ?? 0, p.left ?? 0);
    }
    return Spacing.ZERO;
  }

  /** Border thickness as a {@link Spacing} — 1 on each side when a border is set, else zero. */
  public get borderSize(): Spacing {
    if (this.computedStyle.border && this.computedStyle.border !== "none") {
      return new Spacing(1, 1, 1, 1);
    }
    return Spacing.ZERO;
  }

  /** The region inside the margin (the widget's visible box, border included). */
  public getClientRect(): Region {
    const m = this.margin;
    const offset = new Offset(this.region.x + m.left, this.region.y + m.top);
    const size = new Size(
      Math.max(0, this.region.width - m.width),
      Math.max(0, this.region.height - m.height),
    );
    return new Region(offset, size);
  }

  /** The drawable region inside margin + border + padding — paint custom content here. */
  public getContentRect(): Region {
    const client = this.getClientRect();
    const b = this.borderSize;
    const p = this.padding;
    const offset = new Offset(client.x + b.left + p.left, client.y + b.top + p.top);
    const size = new Size(
      Math.max(0, client.width - b.width - p.width),
      Math.max(0, client.height - b.height - p.height),
    );
    return new Region(offset, size);
  }

  /**
   * True when this widget or any ancestor is `disabled`, so a disabled container
   * (e.g. a `<Form disabled>`) propagates to every control inside it.
   */
  public isDisabled(): boolean {
    let current: Widget | null = this;
    while (current) {
      if (current.disabled) return true;
      current = current.parent instanceof Widget ? current.parent : null;
    }
    return false;
  }

  /**
   * Named tweens owned by this widget. Lazily created on first {@link animate}
   * call; each key drives one independent in-flight value (e.g. "width",
   * "scroll", "glow"). Keeping them on the widget — not in a framework hook —
   * is what makes animation portable: any binding (React, Solid, or none)
   * animates by calling {@link animate} from the widget's own render.
   */
  private _tweens?: Map<string, Tween>;
  private _colorTweens?: Map<string, ColorTween>;

  /**
   * Drive a named scalar tween toward `target`, returning the value to show this
   * frame. Call it from {@link render}: while the tween is still moving it books
   * the next animation frame on this widget, so the value advances on its own
   * without any external clock or state. This is the framework-agnostic
   * counterpart to React's `useAnimatedValue` — the engine lives on the widget,
   * so every binding gets smooth motion for the same call.
   *
   * A non-positive `duration` (or `opts` omitted with a default of 0 from the
   * caller) snaps immediately, so animation can be turned off by passing
   * `duration: 0`.
   */
  public animate(key: string, target: number, opts?: TweenOptions): number {
    this._tweens ??= new Map();
    const map = this._tweens;
    let tween = map.get(key);
    if (!tween) {
      // First sight of this key starts already settled on the target, so a
      // freshly mounted widget paints its final value rather than tweening in
      // from zero.
      tween = new Tween(target);
      map.set(key, tween);
    }
    tween.to(target, opts);
    const value = tween.value;
    if (tween.animating) requestAnimationTick(this, 16);
    return value;
  }

  /**
   * Colour counterpart to {@link animate}: tweens a named CSS colour toward
   * `target`, returning the `rgb(...)` string to paint this frame and booking
   * the next frame while in flight.
   */
  public animateColor(key: string, target: string, opts?: TweenOptions): string {
    this._colorTweens ??= new Map();
    const map = this._colorTweens;
    let tween = map.get(key);
    if (!tween) {
      tween = new ColorTween(target);
      map.set(key, tween);
    }
    tween.to(target, opts);
    const value = tween.value;
    // A colour tween changes only appearance — batch cosmetic repaints onto the
    // shared low-frequency repaint clock instead of scheduling per-widget ticks.
    if (tween.animating) requestCosmeticRepaint(this, `animation:paint-only:${this.tagName}`);
    return value;
  }

  /** This widget's effective background, walking up to ancestors when unset — used to composite translucent fills. */
  public findResolvedBackground(): string {
    const bg = this.computedStyle?.background;
    if (bg && bg !== "default" && bg !== "transparent") {
      return bg;
    }
    if (this.parent && this.parent instanceof Widget) {
      return this.parent.findResolvedBackground();
    }
    return "default";
  }

  /**
   * Concatenates the text of all direct {@link TextNode} children.
   *
   * This is the canonical way widgets read their inline JSX text content.
   * Subclasses may override to add behavior (e.g. trimming, or falling back to
   * a `label` field), typically by post-processing `super.getTextContent()`.
   */
  public getTextContent(): string {
    let text = "";
    for (const child of this.children) {
      if (child instanceof TextNode) {
        text += child.text;
      }
    }
    return text;
  }

  /**
   * A semantic snapshot of this widget for accessibility / non-visual output
   * (see {@link Screen.toAccessibleText}). Returns `null` to be skipped — the
   * default for pure layout containers that carry no inline text — so the
   * accessible tree shows meaningful nodes (controls, labels, headings) without
   * the structural scaffolding around them.
   *
   * The base infers a reasonable node from the tag, inline text, focus/disabled
   * state, and a structurally-read `checked`/`value`/`label`. Interactive widgets
   * that know more (a slider's range, a select's options) should override to add
   * `value`/`state`, calling `super.getAccessibleNode()` for the common fields.
   */
  public getAccessibleNode(): AccessibleNode | null {
    if (!this.visible) return null;
    const label = this.getTextContent().trim();
    const self = this as {
      checked?: unknown;
      value?: unknown;
      label?: unknown;
      focusable?: boolean;
    };
    // Skip anonymous layout boxes: no text, not interactive, no own semantics.
    const interactive = this.focusable;
    const named = typeof self.label === "string" && self.label.length > 0;
    if (!label && !interactive && !named && typeof self.checked === "undefined") {
      return null;
    }
    const state: string[] = [];
    if (this.focused) state.push("focused");
    if (this.isDisabled()) state.push("disabled");
    if (typeof self.checked === "boolean") state.push(self.checked ? "checked" : "unchecked");
    let value: string | undefined;
    if (typeof self.value === "string" || typeof self.value === "number") {
      value = String(self.value);
    }
    return {
      role: this.tagName,
      label: label || (named ? String(self.label) : ""),
      value,
      state: state.length > 0 ? state : undefined,
    };
  }

  /**
   * Paint this widget into the cell `buffer`. The base draws the background,
   * border, and children. **Custom-widget override point**: call
   * `super.render(buffer)` to keep background/border, then paint your content
   * within {@link getContentRect} using `buffer.setCell(...)`. Stay inside your
   * region — the parent clips children to its content box by default. Keep
   * `render` pure and fast: it runs every frame and must not mutate the tree.
   */
  public render(buffer: ScreenBuffer): void {
    if (!this.visible) return;

    const client = this.getClientRect();

    // Draw background
    const bg = this.findResolvedBackground();
    const fg = this.computedStyle.color || "default";

    // A translucent background (`rgba(...)` / `#rrggbbaa`) composites over what's
    // already painted behind this widget instead of replacing it — enabling
    // translucent panels and shadows. The opaque approximation (the colour
    // blended over the theme surface) drives the border so it matches the fill.
    const parsedBg = parseColor(bg);
    const translucent = parsedBg !== null && parsedBg.alpha < 1;
    let bgForStyle = bg;
    if (translucent && parsedBg) {
      const base = themeBlendBase();
      buffer.blendRegion(client, parsedBg.rgb, parsedBg.alpha, base);
      bgForStyle = rgbStr(mix(base.bg, parsedBg.rgb, parsedBg.alpha));
    }

    const style = new Style({
      color: fg,
      background: bgForStyle,
      bold: this.computedStyle.bold,
      italic: this.computedStyle.italic,
      underline: this.computedStyle.underline,
      reverse: this.computedStyle.reverse,
      dim: this.computedStyle.dim,
      strikethrough: this.computedStyle.strikethrough,
      link: this.computedStyle.link,
    });

    if (!translucent) {
      for (let y = client.y; y < client.bottom; y++) {
        for (let x = client.x; x < client.right; x++) {
          buffer.setCell(x, y, " ", style);
        }
      }
    }

    // Draw border
    if (this.computedStyle.border && this.computedStyle.border !== "none") {
      this.drawBorder(buffer, client, style);
    }

    // Render children
    this.renderChildren(buffer);
  }

  private drawBorder(buffer: ScreenBuffer, rect: Region, style: Style): void {
    const type = this.computedStyle.border;
    // Rounded corners are the default (matches Textual's "round"): solid edges,
    // rounded corner glyphs.
    let chars = ["╭", "─", "╮", "│", "╯", "╰"];

    if (type === "double") {
      chars = ["╔", "═", "╗", "║", "╝", "╚"];
    } else if (type === "dashed") {
      // Rounded corners with dashed edges (corners themselves aren't dashed).
      chars = ["╭", "╌", "╮", "┆", "╯", "╰"];
    } else if (type === "solid" || type === "single") {
      chars = ["┌", "─", "┐", "│", "┘", "└"];
    }

    const [tl, h, tr, v, br, bl] = chars;

    const borderStyle = this.computedStyle.borderColor
      ? style.merge({ color: this.computedStyle.borderColor })
      : style;

    // Corners
    buffer.setCell(rect.x, rect.y, tl, borderStyle);
    buffer.setCell(rect.right - 1, rect.y, tr, borderStyle);
    buffer.setCell(rect.right - 1, rect.bottom - 1, br, borderStyle);
    buffer.setCell(rect.x, rect.bottom - 1, bl, borderStyle);

    // Horizontal edges
    for (let x = rect.x + 1; x < rect.right - 1; x++) {
      buffer.setCell(x, rect.y, h, borderStyle);
      buffer.setCell(x, rect.bottom - 1, h, borderStyle);
    }

    // Vertical edges
    for (let y = rect.y + 1; y < rect.bottom - 1; y++) {
      buffer.setCell(rect.x, y, v, borderStyle);
      buffer.setCell(rect.right - 1, y, v, borderStyle);
    }
  }

  /**
   * Paint child widgets (z-index ordered, clipped to the content box). The base
   * {@link render} already calls this; override only for unusual child handling
   * (e.g. a custom scroll transform). Most custom widgets don't need to.
   */
  public renderChildren(buffer: ScreenBuffer): void {
    // Clip children to the content box by default so an oversized or
    // mispositioned child can never paint over this widget's own border or its
    // siblings — the spill-over that plagues naive TUIs. Opt out per axis with
    // `overflow: "visible"` (e.g. a deliberately escaping badge). Top-level
    // layers that must paint outside their parent (dialogs, dropdowns) portal to
    // a full-screen overlay root instead. (Scrollable always clips.)
    const clipOverflow =
      this.computedStyle.overflowX !== "visible" && this.computedStyle.overflowY !== "visible";
    if (clipOverflow) {
      buffer.pushClip(this.getContentRect());
    }

    // Fast path: with no z-index in play (the common case) the sort is a no-op,
    // so paint in document order without copying + sorting the children array on
    // every node, every frame.
    let hasZ = false;
    for (let i = 0; i < this.children.length; i++) {
      if (zIndexOf(this.children[i]) !== 0) {
        hasZ = true;
        break;
      }
    }
    const sorted = hasZ
      ? [...this.children].sort((a, b) => zIndexOf(a) - zIndexOf(b))
      : this.children;
    for (const child of sorted) {
      if (child instanceof Widget) {
        // Skip hidden children here rather than relying on each child's render to
        // bail: leaf widgets (Label, RichText, …) call super.render() but then
        // draw their own content unconditionally, so gating must happen here.
        if (!child.visible) continue;
        if (buffer.currentClip && !buffer.currentClip.overlaps(child.region)) {
          continue;
        }
        // Isolate each child's render: a single broken widget must not blank the
        // whole screen. Log the failure once (until it recovers) so it isn't
        // silently swallowed.
        try {
          child.render(buffer);
          child._renderErrorLogged = false;
        } catch (err) {
          if (!child._renderErrorLogged) {
            logger.error("render", `widget render failed, skipping: ${child.describe()}`, err);
            child._renderErrorLogged = true;
          }
        }
      }
    }

    if (clipOverflow) {
      buffer.popClip();
    }
  }

  /** Called once when the widget enters the live tree. Override to start timers,
   * subscribe to stores, or kick off async loads; pair cleanup in {@link onUnmount}. */
  public onMount(): void {}
  /** Called once when the widget leaves the tree. Override to release whatever
   * {@link onMount} acquired (timers, subscriptions) so nothing leaks. */
  public onUnmount(): void {}

  /**
   * Compute this widget's intrinsic size into {@link measuredWidth} /
   * {@link measuredHeight}, given the space the parent offers (`maxW`/`maxH`).
   * Runs bottom-up (children first). **Override point** for content-sized custom
   * widgets (e.g. measure your text); call `super.measure(maxW, maxH)` first if
   * you also have children. Clamp to the offered space so you never overflow.
   */
  public measure(maxW: number, maxH: number): void {
    // 1. Recursively measure children first (bottom-up). Isolate each child so a
    // broken measure() degrades that subtree instead of aborting layout.
    for (const child of this.children) {
      if (child instanceof Widget && child.visible) {
        try {
          child.measure(maxW, maxH);
          child._measureErrorLogged = false;
        } catch (err) {
          if (!child._measureErrorLogged) {
            logger.error("measure", `widget measure failed: ${child.describe()}`, err);
            child._measureErrorLogged = true;
          }
        }
      }
    }

    // Determine layout type
    const display = this.computedStyle.display;
    const flexDirection = this.computedStyle.flexDirection;
    let layoutType: "vertical" | "horizontal" | "dock" | "grid" = "vertical";
    if (this.computedStyle.layout) {
      layoutType = this.computedStyle.layout;
    } else if (display === "grid") {
      layoutType = "grid";
    } else if (display === "dock") {
      layoutType = "dock";
    } else if (display === "flex" || flexDirection !== undefined) {
      layoutType = flexDirection === "row" ? "horizontal" : "vertical";
    }

    // Determine text content if any (handling Label, Button, Header, Footer inline text)
    let text = "";
    let hasText = false;
    for (const child of this.children) {
      if (child instanceof TextNode) {
        text += child.text || "";
        hasText = true;
      }
    }

    const b = this.borderSize;
    const p = this.padding;

    // 2. Resolve own width
    const wVal = parseDimension(this.computedStyle.width, maxW, -1);
    if (wVal === -1 || (typeof wVal === "object" && "fr" in wVal)) {
      let contentW = 0;
      if (hasText) {
        contentW = stringWidth(text);
      } else {
        if (layoutType === "horizontal") {
          for (const child of this.children) {
            if (
              child instanceof Widget &&
              child.visible &&
              child.computedStyle.position !== "absolute"
            ) {
              const childWProp = child.computedStyle.width;
              const isFr =
                childWProp !== undefined &&
                typeof childWProp === "string" &&
                childWProp.endsWith("fr");
              const isFlexGrow = child.computedStyle.flexGrow !== undefined;
              if (!isFr && !isFlexGrow) {
                contentW += child.measuredWidth + child.margin.left + child.margin.right;
              } else {
                contentW += 1 + child.margin.left + child.margin.right;
              }
            }
          }
        } else {
          for (const child of this.children) {
            if (
              child instanceof Widget &&
              child.visible &&
              child.computedStyle.position !== "absolute"
            ) {
              const childWProp = child.computedStyle.width;
              const isFr =
                childWProp !== undefined &&
                typeof childWProp === "string" &&
                childWProp.endsWith("fr");
              const childW = !isFr ? child.measuredWidth : 1;
              contentW = Math.max(contentW, childW + child.margin.left + child.margin.right);
            }
          }
        }
      }
      // Clamp auto/content-sized width to the space actually offered so a
      // content-sized widget never claims more room than its parent has
      // (scroll content is offered a large maxW, so this is a no-op there).
      this.measuredWidth = Math.min(contentW + b.width + p.width, maxW);
    } else {
      this.measuredWidth = wVal as number;
    }

    // 3. Resolve own height
    const hVal = parseDimension(this.computedStyle.height, maxH, -1);
    if (hVal === -1 || (typeof hVal === "object" && "fr" in hVal)) {
      let contentH = 0;
      if (hasText) {
        contentH = text ? 1 : 0;
      } else {
        if (layoutType === "vertical") {
          for (const child of this.children) {
            if (
              child instanceof Widget &&
              child.visible &&
              child.computedStyle.position !== "absolute"
            ) {
              const childHProp = child.computedStyle.height;
              const isFr =
                childHProp !== undefined &&
                typeof childHProp === "string" &&
                childHProp.endsWith("fr");
              const isFlexGrow = child.computedStyle.flexGrow !== undefined;
              if (!isFr && !isFlexGrow) {
                contentH += child.measuredHeight + child.margin.top + child.margin.bottom;
              } else {
                contentH += 1 + child.margin.top + child.margin.bottom;
              }
            }
          }
        } else {
          for (const child of this.children) {
            if (
              child instanceof Widget &&
              child.visible &&
              child.computedStyle.position !== "absolute"
            ) {
              const childHProp = child.computedStyle.height;
              const isFr =
                childHProp !== undefined &&
                typeof childHProp === "string" &&
                childHProp.endsWith("fr");
              const childH = !isFr ? child.measuredHeight : 1;
              contentH = Math.max(contentH, childH + child.margin.top + child.margin.bottom);
            }
          }
        }
      }
      // Clamp auto/content-sized height to the offered space (see width above).
      this.measuredHeight = Math.min(contentH + b.height + p.height, maxH);
    } else {
      this.measuredHeight = hVal as number;
    }

    // Apply min/max constraints
    if (this.computedStyle.minWidth !== undefined) {
      this.measuredWidth = Math.max(this.measuredWidth, this.computedStyle.minWidth);
    }
    if (this.computedStyle.maxWidth !== undefined) {
      this.measuredWidth = Math.min(this.measuredWidth, this.computedStyle.maxWidth);
    }
    if (this.computedStyle.minHeight !== undefined) {
      this.measuredHeight = Math.max(this.measuredHeight, this.computedStyle.minHeight);
    }
    if (this.computedStyle.maxHeight !== undefined) {
      this.measuredHeight = Math.min(this.measuredHeight, this.computedStyle.maxHeight);
    }
  }
}
