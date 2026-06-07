import { Widget } from "../dom/widget.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Layout } from "./layout.ts";

export class GridLayout extends Layout {
  constructor(public columns = 2) {
    super();
  }

  public resolve(parent: Widget): void {
    const parentRect = parent.getContentRect();
    const children = parent.children.filter((c): c is Widget => c instanceof Widget && c.visible);
    if (children.length === 0) return;

    const cols = this.columns;
    const rows = Math.ceil(children.length / cols);

    const cellWidth = Math.floor(parentRect.width / cols);
    const cellHeight = Math.floor(parentRect.height / rows);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const colIdx = i % cols;
      const rowIdx = Math.floor(i / cols);

      child.region = new Region(
        new Offset(parentRect.x + colIdx * cellWidth, parentRect.y + rowIdx * cellHeight),
        new Size(cellWidth, cellHeight),
      );
    }
  }
}
