import { requestAnimationTick } from "../anim/animation.ts";
import { ColorTween, Tween, type TweenOptions } from "../anim/tween.ts";
import type { KeyEvent, MouseEvent } from "../driver/driver.ts";
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

/**
 * The slice of the owning `App` that widgets reach through {@link Widget.app}:
 * render scheduling, the focus-bearing active screen, and the style resolver.
 * Declared structurally (dependency inversion) so the DOM layer carries no
 * import edge to `core/app` — `App` satisfies this shape. Methods on
 * `cssResolver` mirror `CSSResolver` without importing it (which would be an
 * upward `dom → css` dependency).
 */
export interface WidgetApp {
  queueRender(): void;
  activeScreen: { focusWidget(widget: Widget): void };
  cssResolver: {
    resolveVariable(widget: Widget, value: string): string;
    resolveStyles(widget: Widget, isHovered: boolean): WidgetStyles;
  };
}

export interface WidgetStyles {
  color?: string;
  background?: string;
  width?: string | number; // "auto", "50%", "3fr", 10
  height?: string | number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  margin?: Spacing | number | { top?: number; right?: number; bottom?: number; left?: number };
  padding?: Spacing | number | { top?: number; right?: number; bottom?: number; left?: number };
  border?: string; // "rounded" (default), "solid", "double", "dashed", "none"
  borderColor?: string;
  layout?: "vertical" | "horizontal" | "dock" | "grid";
  dock?: "top" | "right" | "bottom" | "left";
  align?: "left" | "center" | "right"; // Horizontal alignment of children
  verticalAlign?: "top" | "middle" | "bottom"; // Vertical alignment
  position?: "relative" | "absolute";
  left?: number | string;
  top?: number | string;
  right?: number | string;
  bottom?: number | string;
  zIndex?: number;
  display?: "flex" | "grid" | "dock";
  flexDirection?: "row" | "column";
  flexGrow?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  reverse?: boolean;
  dim?: boolean;
  strikethrough?: boolean;
  link?: string;
  overflowX?: "scroll" | "auto" | "hidden" | "visible";
  overflowY?: "scroll" | "auto" | "hidden" | "visible";
}

export class Widget extends DOMNode {
  public style: WidgetStyles = {};
  public defaultStyle: WidgetStyles = {};
  private _computedStyle: WidgetStyles | null = null;
  // One-shot flags so a persistently-failing widget logs once, not every frame.
  private _renderErrorLogged = false;
  private _measureErrorLogged = false;
  public get computedStyle(): WidgetStyles {
    return this._computedStyle || this.style;
  }
  public set computedStyle(val: WidgetStyles) {
    this._computedStyle = val;
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
  public region: Region = Region.EMPTY;
  public measuredWidth = 0;
  public measuredHeight = 0;
  public scrollOffset: Offset = Offset.ORIGIN;
  public focusable = false;
  public focused = false;
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
   * Original source text for this subtree (e.g. the raw markdown of the block a
   * Markdown widget rendered it from). When a read-only selection fully covers
   * the subtree's content, copy emits this verbatim instead of the rendered
   * text, so copied markdown round-trips its formatting.
   */
  public selectionRaw: string | null = null;
  public label?: string;
  private _theme?: string;
  public get theme(): string | undefined {
    return this._theme;
  }
  public set theme(val: string | undefined) {
    this._theme = val;
  }

  public onClick?: (ev: any) => void;
  public onKey?: (ev: any) => void;
  public onScroll?: (ev: MouseEvent) => void;
  public onMouseEnter?: (ev: any) => void;
  public onMouseLeave?: (ev: any) => void;
  // Pointer-drag lifecycle, emitted by the base handleMouse so any widget can be
  // a drag source (e.g. a panel rail icon dragged to re-dock). `onDragEnd`'s
  // `moved` flag distinguishes a drag from a plain tap (no pointer movement).
  public onDragStart?: (x: number, y: number) => void;
  public onDragMove?: (x: number, y: number) => void;
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
  public declare onAction?: (...args: never[]) => void;
  public declare onChange?: (...args: never[]) => void;
  public declare onSelect?: (...args: never[]) => void;
  public declare onActivate?: (...args: never[]) => void;
  public declare onSortChange?: (...args: never[]) => void;
  public declare onViewportChange?: (...args: never[]) => void;
  public declare onViewChange?: (...args: never[]) => void;
  public declare onToggle?: (...args: never[]) => void;
  public declare onExpandedChange?: (...args: never[]) => void;
  public declare onValidate?: (...args: never[]) => void;
  public declare onSubmit?: (...args: never[]) => void;
  public declare onResize?: (...args: never[]) => void;

  public handleScroll(ev: MouseEvent): void {
    if (this.onScroll) {
      this.onScroll(ev);
      ev.handled = true;
    }
  }

  public handleKey(ev: KeyEvent): void {
    if (this.onKey) {
      this.onKey(ev);
      ev.handled = true;
    }
  }

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

  public get margin(): Spacing {
    const m = this.computedStyle.margin;
    if (m instanceof Spacing) return m;
    if (typeof m === "number") return new Spacing(m, m, m, m);
    if (m && typeof m === "object") {
      return new Spacing(
        (m as any).top ?? 0,
        (m as any).right ?? 0,
        (m as any).bottom ?? 0,
        (m as any).left ?? 0,
      );
    }
    return Spacing.ZERO;
  }

  public get padding(): Spacing {
    const p = this.computedStyle.padding;
    if (p instanceof Spacing) return p;
    if (typeof p === "number") return new Spacing(p, p, p, p);
    if (p && typeof p === "object") {
      return new Spacing(
        (p as any).top ?? 0,
        (p as any).right ?? 0,
        (p as any).bottom ?? 0,
        (p as any).left ?? 0,
      );
    }
    return Spacing.ZERO;
  }

  public get borderSize(): Spacing {
    if (this.computedStyle.border && this.computedStyle.border !== "none") {
      return new Spacing(1, 1, 1, 1);
    }
    return Spacing.ZERO;
  }

  public getClientRect(): Region {
    const m = this.margin;
    const offset = new Offset(this.region.x + m.left, this.region.y + m.top);
    const size = new Size(
      Math.max(0, this.region.width - m.width),
      Math.max(0, this.region.height - m.height),
    );
    return new Region(offset, size);
  }

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
    if (tween.animating) requestAnimationTick(this, 16);
    return value;
  }

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

  public renderChildren(buffer: ScreenBuffer): void {
    // Enforce `overflow: hidden`: clip children to the content box so an
    // oversized or mispositioned child can't draw on top of sibling widgets.
    // (Scrollable overrides this to always clip.) Matches CSS semantics, which
    // also keeps the model portable to a web/DOM backend.
    const clipOverflow =
      this.computedStyle.overflowX === "hidden" || this.computedStyle.overflowY === "hidden";
    if (clipOverflow) {
      buffer.pushClip(this.getContentRect());
    }

    const sorted = [...this.children].sort((a, b) => {
      const az = (a as any).computedStyle?.zIndex ?? 0;
      const bz = (b as any).computedStyle?.zIndex ?? 0;
      return az - bz;
    });
    for (const child of sorted) {
      if (child instanceof Widget) {
        // Skip hidden children here rather than relying on each child's render to
        // bail: leaf widgets (Label, RichText, …) call super.render() but then
        // draw their own content unconditionally, so gating must happen here.
        if (!child.visible) continue;
        if (buffer.currentClip && !buffer.currentClip.intersection(child.region)) {
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

  public onMount(): void {}
  public onUnmount(): void {}

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
