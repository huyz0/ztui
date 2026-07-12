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
    const children = parent.children.filter(
      (c): c is Widget =>
        c instanceof Widget && c.visible && c.computedStyle.position !== "absolute",
    );
    if (children.length === 0) return;

    const cols = Math.max(1, this.columns);
    const rows = Math.ceil(children.length / cols);

    // Plain floor division leaves `width % cols` (resp. `height % rows`)
    // cells unaccounted for — a permanent blank strip along the right/bottom
    // edge of the grid. Distribute that remainder across the first N
    // columns/rows (one extra cell each) so the grid fills its content box
    // exactly, then derive offsets from cumulative widths/heights rather
    // than `index * cellSize` so column/row edges never drift.
    const baseColWidth = Math.floor(parentRect.width / cols);
    const extraCols = parentRect.width % cols;
    const baseRowHeight = Math.floor(parentRect.height / rows);
    const extraRows = parentRect.height % rows;

    const colWidths = Array.from(
      { length: cols },
      (_, i) => baseColWidth + (i < extraCols ? 1 : 0),
    );
    const rowHeights = Array.from(
      { length: rows },
      (_, i) => baseRowHeight + (i < extraRows ? 1 : 0),
    );
    const colOffsets = [0];
    for (const w of colWidths) colOffsets.push(colOffsets[colOffsets.length - 1] + w);
    const rowOffsets = [0];
    for (const h of rowHeights) rowOffsets.push(rowOffsets[rowOffsets.length - 1] + h);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const colIdx = i % cols;
      const rowIdx = Math.floor(i / cols);

      child.region = new Region(
        new Offset(parentRect.x + colOffsets[colIdx], parentRect.y + rowOffsets[rowIdx]),
        new Size(colWidths[colIdx], rowHeights[rowIdx]),
      );
    }
  }
}
