import { logger } from "../core/logger.ts";
import type { KeyEvent, MouseEvent } from "../driver/driver.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Spacing } from "../geometry/spacing.ts";
import { parseDimension } from "../layout/layout.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { stringWidth } from "../render/segment.ts";
import { Style } from "../render/style.ts";
import { DOMNode } from "./dom.ts";

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
  border?: string; // "solid", "double", "dashed", "none"
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
  public region: Region = Region.EMPTY;
  public measuredWidth = 0;
  public measuredHeight = 0;
  public scrollOffset: Offset = Offset.ORIGIN;
  public focusable = false;
  public focused = false;
  public visible = true;
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

  public handleMouse(_ev: MouseEvent): void {}

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

  public render(buffer: ScreenBuffer): void {
    if (!this.visible) return;

    const client = this.getClientRect();

    // Draw background
    const bg = this.findResolvedBackground();
    const fg = this.computedStyle.color || "default";
    const style = new Style({
      color: fg,
      background: bg,
      bold: this.computedStyle.bold,
      italic: this.computedStyle.italic,
      underline: this.computedStyle.underline,
      reverse: this.computedStyle.reverse,
      dim: this.computedStyle.dim,
      strikethrough: this.computedStyle.strikethrough,
      link: this.computedStyle.link,
    });

    for (let y = client.y; y < client.bottom; y++) {
      for (let x = client.x; x < client.right; x++) {
        buffer.setCell(x, y, " ", style);
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
    let chars = ["┌", "─", "┐", "│", "┘", "└"]; // solid default

    if (type === "double") {
      chars = ["╔", "═", "╗", "║", "╝", "╚"];
    } else if (type === "dashed") {
      chars = ["┌", "╌", "┐", "┆", "┘", "└"];
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
      if (child.constructor.name === "TextNode") {
        text += (child as any).text || "";
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
