import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import type { DOMNode } from "./dom.ts";
import { Widget } from "./widget.ts";

export class Screen extends Widget {
  private _focusedWidget: Widget | null = null;
  public overlays: Widget[] = [];

  constructor() {
    super("screen");
  }

  public get focusedWidget(): Widget | null {
    return this._focusedWidget;
  }

  public resize(width: number, height: number): void {
    this.region = new Region(Offset.ORIGIN, new Size(width, height));
  }

  public override measure(maxW: number, maxH: number): void {
    for (const child of this.children) {
      if (child instanceof Widget && child.visible) {
        child.measure(maxW, maxH);
      }
    }
    this.measuredWidth = maxW;
    this.measuredHeight = maxH;
  }

  public addOverlay(widget: Widget): void {
    widget.parent = this;
    this.overlays.push(widget);
  }

  public removeOverlay(widget: Widget): void {
    const idx = this.overlays.indexOf(widget);
    if (idx !== -1) {
      this.overlays.splice(idx, 1);
      widget.parent = null;
    }
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    // Draw overlays on top of all normal children
    for (const overlay of this.overlays) {
      overlay.render(buffer);
    }
  }

  public getFocusableWidgets(): Widget[] {
    const list: Widget[] = [];
    this.walk((node) => {
      if (node instanceof Widget && node.focusable && node.visible) {
        list.push(node);
      }
    });
    return list;
  }

  public focusWidget(widget: Widget | null): void {
    if (this._focusedWidget === widget) return;

    if (this._focusedWidget) {
      this._focusedWidget.focused = false;
    }

    this._focusedWidget = widget;

    if (this._focusedWidget) {
      this._focusedWidget.focused = true;
      this.scrollIntoView(this._focusedWidget);
    }
  }

  private scrollIntoView(widget: Widget): void {
    let current: DOMNode | null = widget.parent;
    let child = widget;
    while (current) {
      if (current instanceof Widget) {
        const parent = current as any;
        const isScrollable = parent.scrollableX !== undefined || parent.scrollableY !== undefined;
        if (isScrollable) {
          const parentRect = parent.getContentRect();

          const childUnscrolled = new Region(
            new Offset(
              child.region.x + parent.scrollOffset.x,
              child.region.y + parent.scrollOffset.y,
            ),
            child.region.size,
          );

          let newScrollY = parent.scrollOffset.y;
          if (parent.scrollableY) {
            const contentSize = parent.getContentSize();
            const maxScrollY = Math.max(0, contentSize.height - parentRect.height);

            const y1 = childUnscrolled.y;
            const y2 = childUnscrolled.bottom;
            const v1 = parentRect.y;
            const v2 = parentRect.bottom;

            if (y1 - newScrollY < v1) {
              newScrollY = Math.max(0, y1 - v1);
            } else if (y2 - newScrollY > v2) {
              newScrollY = Math.min(maxScrollY, y2 - v2);
            }
          }

          let newScrollX = parent.scrollOffset.x;
          if (parent.scrollableX) {
            const contentSize = parent.getContentSize();
            const maxScrollX = Math.max(0, contentSize.width - parentRect.width);

            const x1 = childUnscrolled.x;
            const x2 = childUnscrolled.right;
            const v1 = parentRect.x;
            const v2 = parentRect.right;

            if (x1 - newScrollX < v1) {
              newScrollX = Math.max(0, x1 - v1);
            } else if (x2 - newScrollX > v2) {
              newScrollX = Math.min(maxScrollX, x2 - v2);
            }
          }

          if (newScrollX !== parent.scrollOffset.x || newScrollY !== parent.scrollOffset.y) {
            parent.scrollOffset = new Offset(newScrollX, newScrollY);
          }
        }
        child = current;
      }
      current = current.parent;
    }
  }

  public focusNext(reverse = false): void {
    const widgets = this.getFocusableWidgets();
    if (widgets.length === 0) return;

    let index = -1;
    if (this._focusedWidget) {
      index = widgets.indexOf(this._focusedWidget);
    }

    if (reverse) {
      index = index <= 0 ? widgets.length - 1 : index - 1;
    } else {
      index = index === -1 || index === widgets.length - 1 ? 0 : index + 1;
    }

    this.focusWidget(widgets[index]);
  }
}
