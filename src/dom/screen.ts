import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Widget } from "./widget.ts";

export class Screen extends Widget {
  private _focusedWidget: Widget | null = null;

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
