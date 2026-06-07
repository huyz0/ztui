import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Spacing } from "../geometry/spacing.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
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
  margin?: Spacing | number;
  padding?: Spacing | number;
  border?: string; // "solid", "double", "dashed", "none"
  borderColor?: string;
  layout?: "vertical" | "horizontal" | "dock" | "grid";
  dock?: "top" | "right" | "bottom" | "left";
  align?: "left" | "center" | "right"; // Horizontal alignment of children
  verticalAlign?: "top" | "middle" | "bottom"; // Vertical alignment
  display?: "flex" | "grid" | "dock";
  flexDirection?: "row" | "column";
  flexGrow?: number;
}

export class Widget extends DOMNode {
  public style: WidgetStyles = {};
  public defaultStyle: WidgetStyles = {};
  private _computedStyle: WidgetStyles | null = null;
  public get computedStyle(): WidgetStyles {
    return this._computedStyle || this.style;
  }
  public set computedStyle(val: WidgetStyles) {
    this._computedStyle = val;
  }
  public region: Region = Region.EMPTY;
  public scrollOffset: Offset = Offset.ORIGIN;
  public focusable = false;
  public focused = false;
  public visible = true;

  public onClick?: (ev: any) => void;
  public onKey?: (ev: any) => void;

  constructor(tagName = "widget") {
    super(tagName);
  }

  public get margin(): Spacing {
    const m = this.computedStyle.margin;
    if (m instanceof Spacing) return m;
    if (typeof m === "number") return new Spacing(m, m, m, m);
    return Spacing.ZERO;
  }

  public get padding(): Spacing {
    const p = this.computedStyle.padding;
    if (p instanceof Spacing) return p;
    if (typeof p === "number") return new Spacing(p, p, p, p);
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

  public render(buffer: ScreenBuffer): void {
    if (!this.visible) return;

    const client = this.getClientRect();

    // Draw background
    const bg = this.computedStyle.background || "default";
    const fg = this.computedStyle.color || "default";
    const style = new Style({ color: fg, background: bg });

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

    // Corners
    buffer.setCell(rect.x, rect.y, tl, style);
    buffer.setCell(rect.right - 1, rect.y, tr, style);
    buffer.setCell(rect.right - 1, rect.bottom - 1, br, style);
    buffer.setCell(rect.x, rect.bottom - 1, bl, style);

    // Horizontal edges
    for (let x = rect.x + 1; x < rect.right - 1; x++) {
      buffer.setCell(x, rect.y, h, style);
      buffer.setCell(x, rect.bottom - 1, h, style);
    }

    // Vertical edges
    for (let y = rect.y + 1; y < rect.bottom - 1; y++) {
      buffer.setCell(rect.x, y, v, style);
      buffer.setCell(rect.right - 1, y, v, style);
    }
  }

  public renderChildren(buffer: ScreenBuffer): void {
    for (const child of this.children) {
      if (child instanceof Widget) {
        child.render(buffer);
      }
    }
  }

  public onMount(): void {}
  public onUnmount(): void {}
}
