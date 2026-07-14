import { describe, expect, test } from "vitest";
import { Widget } from "../dom/widget.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { ReadonlySelectionManager, runCols } from "./selection.ts";

class SelectableWidget extends Widget {
  constructor(private lines: string[]) {
    super("selectable");
    this.selectable = true;
  }
  selectableLines(): string[] {
    return this.lines;
  }
}

describe("ReadonlySelectionManager.paint", () => {
  test("a wide glyph's continuation cell is highlighted too, not just its first column", () => {
    // Regression: paint() did `if (c < 0) continue;` for every wide-glyph
    // continuation cell (the second screen column of a CJK char/emoji),
    // skipping it entirely instead of resolving it to the column it belongs
    // to and checking that against the selection range. A fully-selected
    // line containing a double-width character left its second column
    // unhighlighted, reading as a visibly "half-highlighted" glyph.
    const text = "a你b"; // "a", a wide CJK char, "b" -> logical cols 0,1,2
    const widget = new SelectableWidget([text]);
    const mgr = new ReadonlySelectionManager();
    mgr.beginFrame();
    mgr.addRun({ widget, line: 0, y: 0, x: 0, cols: runCols(text) });
    // runCols("a你b") === [0, 1, -1, 2] (the wide char occupies cols 1 and -1)

    mgr.active = {
      group: widget,
      anchor: { widget, line: 0, col: 0 },
      caret: { widget, line: 0, col: 3 }, // select the whole line
    };

    const buffer = new ScreenBuffer(4, 1);
    mgr.paint(buffer, () => "");

    // Screen column 2 is the wide char's continuation cell (logical col -1).
    // It must get the same selection background as its neighbors.
    const bgs = [0, 1, 2, 3].map((x) => buffer.cells[0][x].style.background);
    expect(bgs[2]).toBe(bgs[1]);
    expect(bgs[2]).not.toBe("default");
  });
});
