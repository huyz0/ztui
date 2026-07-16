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

  test("runs for widgets outside the active selection's document order are skipped", () => {
    // Regression coverage for `if (!order.has(run.widget)) continue;` — a run
    // registered for a widget that isn't part of the selected group's subtree
    // (e.g. a widget in an unrelated part of the tree) must never be painted,
    // even if its logical column happens to fall inside the selection range.
    const group = new Widget("group");
    const inside = new SelectableWidget(["a"]);
    group.appendChild(inside);
    const outside = new SelectableWidget(["b"]);

    const mgr = new ReadonlySelectionManager();
    mgr.beginFrame();
    // Non-overlapping columns so each run's paint (or lack thereof) is isolated.
    mgr.addRun({ widget: inside, line: 0, y: 0, x: 0, cols: runCols("a") });
    mgr.addRun({ widget: outside, line: 0, y: 0, x: 1, cols: runCols("b") });
    mgr.active = {
      group,
      anchor: { widget: inside, line: 0, col: 0 },
      caret: { widget: inside, line: 0, col: 1 },
    };

    const buffer = new ScreenBuffer(4, 1);
    buffer.clear();
    mgr.paint(buffer, () => "");

    expect(buffer.cells[0][0].style.background).toBe("#585b70"); // in-group cell painted
    expect(buffer.cells[0][1].style.background).toBeUndefined(); // outside-group run skipped
  });

  test("paint doesn't throw when a run's screen cell falls outside the buffer", () => {
    // Regression coverage for the `if (cell)` guard — a run positioned past
    // the buffer's edge (stale geometry from a resize) must be a silent no-op.
    const widget = new SelectableWidget(["abc"]);
    const mgr = new ReadonlySelectionManager();
    mgr.beginFrame();
    mgr.addRun({ widget, line: 0, y: 5, x: 0, cols: runCols("abc") }); // y=5 is off a 1-row buffer
    mgr.active = {
      group: widget,
      anchor: { widget, line: 0, col: 0 },
      caret: { widget, line: 0, col: 3 },
    };

    const buffer = new ScreenBuffer(4, 1);
    expect(() => mgr.paint(buffer, () => "")).not.toThrow();
  });
});

describe("ReadonlySelectionManager.copy", () => {
  test("returns null when there is no active selection", () => {
    const mgr = new ReadonlySelectionManager();
    expect(mgr.copy()).toBeNull();
  });

  test("falls back gracefully when the anchor/caret widget is no longer in the document", () => {
    // Regression coverage for the `order.get(...) ?? 0` fallbacks — an
    // anchor/caret can reference a widget that was removed from the tree
    // between when the selection started and when copy() is called (e.g. a
    // filtered list). copy() must not throw and should treat the missing
    // widget as document index 0 rather than crashing on `undefined`.
    const group = new Widget("group");
    const content = new SelectableWidget(["hello"]);
    group.appendChild(content);
    const detached = new SelectableWidget(["gone"]); // never appended to `group`

    const mgr = new ReadonlySelectionManager();
    mgr.active = {
      group,
      anchor: { widget: detached, line: 0, col: 0 },
      caret: { widget: content, line: 0, col: 5 },
    };

    expect(() => mgr.copy()).not.toThrow();
    expect(mgr.copy()).toBe("hello");
  });

  test("skips selectable content outside the selection's widget range", () => {
    // Regression coverage for `if (idx >= si && idx <= ei)` — widgets before
    // the anchor or after the caret in document order must not be copied.
    const group = new Widget("group");
    const before = new SelectableWidget(["before"]);
    const selected = new SelectableWidget(["abc"]);
    const after = new SelectableWidget(["after"]);
    group.appendChild(before);
    group.appendChild(selected);
    group.appendChild(after);

    const mgr = new ReadonlySelectionManager();
    mgr.active = {
      group,
      anchor: { widget: selected, line: 0, col: 0 },
      caret: { widget: selected, line: 0, col: 3 },
    };

    expect(mgr.copy()).toBe("abc");
  });

  test("skips widgets whose selectableLines() is empty, resulting in null when nothing is copied", () => {
    // Regression coverage for `if (lines.length > 0)` and the `text === ""`
    // empty-result check — a widget that reports no lines at all (distinct
    // from a single empty line) contributes nothing to the copied text.
    const group = new Widget("group");
    const a = new SelectableWidget([]);
    const b = new SelectableWidget([]);
    group.appendChild(a);
    group.appendChild(b);

    const mgr = new ReadonlySelectionManager();
    mgr.active = {
      group,
      anchor: { widget: a, line: 0, col: 0 },
      caret: { widget: b, line: 0, col: 0 },
    };

    expect(mgr.copy()).toBeNull();
  });

  test("a raw-source subtree with no selectable content at all is skipped wholesale", () => {
    // Regression coverage for `if (leaves.length === 0) return "none";` in
    // subtreeCoverage — a selectionRaw-bearing widget (e.g. an empty Markdown
    // block) with no selectable descendants must contribute nothing, even
    // though it carries a selectionRaw string.
    const group = new Widget("group");
    const rawBlock = new Widget("raw-block");
    rawBlock.selectionRaw = "**should not appear**";
    rawBlock.appendChild(new Widget("plain-child")); // not selectable
    group.appendChild(rawBlock);
    const content = new SelectableWidget(["hello"]);
    group.appendChild(content);

    const mgr = new ReadonlySelectionManager();
    mgr.active = {
      group,
      anchor: { widget: content, line: 0, col: 0 },
      caret: { widget: content, line: 0, col: 5 },
    };

    expect(mgr.copy()).toBe("hello");
  });

  test("a raw-source subtree only partially covered by the selection falls back to rendered text", () => {
    // Regression coverage for the `li > ei` partial-coverage branch — when the
    // selection ends inside a raw-source subtree (not past its last leaf),
    // the subtree must NOT be replaced by its raw source; it should fall
    // through to per-widget rendered-text slicing instead.
    const group = new Widget("group");
    const rawBlock = new Widget("raw-block");
    rawBlock.selectionRaw = "**full markdown**";
    const first = new SelectableWidget(["first"]);
    const second = new SelectableWidget(["second"]);
    rawBlock.appendChild(first);
    rawBlock.appendChild(second);
    group.appendChild(rawBlock);

    const mgr = new ReadonlySelectionManager();
    mgr.active = {
      group,
      anchor: { widget: first, line: 0, col: 0 },
      caret: { widget: first, line: 0, col: 5 }, // selection ends inside `first`, before `second`
    };

    const result = mgr.copy();
    expect(result).toBe("first"); // rendered text, not the raw markdown
    expect(result).not.toContain("**");
  });

  test("full coverage of a raw-source subtree whose last leaf has no lines still counts as fully covered", () => {
    // Regression coverage for `[...(lines[lastLine] ?? "")].length` — when the
    // raw subtree's last leaf reports zero lines, `lines[lastLine]` indexes at
    // -1 (undefined), and the `?? ""` fallback must be exercised without
    // throwing while still resolving end-of-subtree coverage correctly.
    const group = new Widget("group");
    const rawBlock = new Widget("raw-block");
    rawBlock.selectionRaw = "**raw**";
    const first = new SelectableWidget(["only line"]);
    const emptyLast = new SelectableWidget([]); // no lines at all
    rawBlock.appendChild(first);
    rawBlock.appendChild(emptyLast);
    group.appendChild(rawBlock);

    const mgr = new ReadonlySelectionManager();
    mgr.active = {
      group,
      anchor: { widget: first, line: 0, col: 0 },
      // Caret sits on the empty-lines widget, past its (nonexistent) content —
      // this is the only way to reach "end of subtree" when the last leaf is empty.
      caret: { widget: emptyLast, line: 0, col: 0 },
    };

    expect(() => mgr.copy()).not.toThrow();
    expect(mgr.copy()).toBe("**raw**");
  });

  test("falls back gracefully when the caret's widget is no longer in the document", () => {
    // Mirror of the detached-anchor test above, but for the caret side —
    // exercises the `order.get(end.widget) ?? 0` fallback (and the matching
    // side of `compare()`'s own `?? 0` fallback).
    const group = new Widget("group");
    const content = new SelectableWidget(["hello"]);
    group.appendChild(content);
    const detached = new SelectableWidget(["gone"]); // never appended to `group`

    const mgr = new ReadonlySelectionManager();
    mgr.active = {
      group,
      anchor: { widget: content, line: 0, col: 0 },
      caret: { widget: detached, line: 0, col: 4 },
    };

    expect(() => mgr.copy()).not.toThrow();
  });

  test("a selection dragged upward (caret before anchor in document order) copies in document order", () => {
    // Regression coverage for the `ordered()` branch where the caret sorts
    // before the anchor — e.g. the user pressed on a later widget and dragged
    // up to an earlier one. The copied text must still read start-to-end in
    // document order, not anchor-to-caret gesture order.
    const group = new Widget("group");
    const first = new SelectableWidget(["first"]);
    const second = new SelectableWidget(["second"]);
    group.appendChild(first);
    group.appendChild(second);

    const mgr = new ReadonlySelectionManager();
    mgr.active = {
      group,
      // Gesture went from the end of `second` (anchor, pressed first) up to
      // the start of `first` (caret).
      anchor: { widget: second, line: 0, col: 6 },
      caret: { widget: first, line: 0, col: 0 },
    };

    expect(mgr.copy()).toBe("first\nsecond");
  });
});
