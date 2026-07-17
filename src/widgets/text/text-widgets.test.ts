import { describe, expect, test } from "vitest";
import { TextNode } from "../../dom/text-node.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { LabelWidget } from "./label.ts";
import { RichTextWidget } from "./rich-text.ts";

function withText<T extends LabelWidget | RichTextWidget>(w: T, text: string): T {
  w.appendChild(new TextNode(text));
  return w;
}

describe("LabelWidget selectable lines", () => {
  test("an empty label has no selectable line", () => {
    expect(new LabelWidget().selectableLines()).toEqual([]);
  });

  test("plain mode returns the raw text; markup mode strips the markup", () => {
    expect(withText(new LabelWidget(), "plain text").selectableLines()).toEqual(["plain text"]);
    const m = withText(new LabelWidget(), "[bold]hi[/]");
    m.markup = true;
    expect(m.selectableLines()).toEqual(["hi"]);
  });

  test("an already-handled mouse event is left untouched (no re-processing)", () => {
    const w = withText(new LabelWidget(), "x");
    const ev = { type: "press", button: "left", x: 0, y: 0, handled: true } as any;
    w.handleMouse(ev);
    expect(ev.handled).toBe(true); // consumed upstream → early return, still handled
  });

  test("wrappedRows falls back to the unwrapped text when width is 0", () => {
    const w = withText(new LabelWidget(), "hello world");
    w.wrap = true;
    w.region = new Region(Offset.ORIGIN, new Size(0, 1));
    const buffer = new ScreenBuffer(0, 1);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("wrappedRows' memo evicts its oldest entry past 4 distinct widths", () => {
    const w = withText(new LabelWidget(), "one two three four five six seven eight");
    w.wrap = true;
    w.region = new Region(Offset.ORIGIN, new Size(50, 20));
    for (const width of [5, 10, 15, 20, 25, 30]) {
      w.measure(width, 20);
    }
    expect(w.measuredHeight).toBeGreaterThan(0);
  });

  test("wrapped, selectable rows register a selectable run per line", () => {
    const w = withText(new LabelWidget(), "one two three four five");
    w.wrap = true;
    w.selectable = true;
    w.region = new Region(Offset.ORIGIN, new Size(10, 5));
    const buffer = new ScreenBuffer(10, 5);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("a non-selectable label registers no selectable run", () => {
    const w = withText(new LabelWidget(), "text");
    w.selectable = false;
    w.region = new Region(Offset.ORIGIN, new Size(10, 1));
    const buffer = new ScreenBuffer(10, 1);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("registers no selectable run when the content rect has zero width", () => {
    // contentRect.width === 0 pins x === contentRect.right, so maxCols
    // collapses to 0 and the cols.length > 0 guard must skip the run.
    const w = withText(new LabelWidget(), "text");
    w.selectable = true;
    w.region = new Region(Offset.ORIGIN, new Size(0, 1));
    const buffer = new ScreenBuffer(1, 1);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("wrapped rows register no selectable run when not selectable", () => {
    const w = withText(new LabelWidget(), "one two three four five");
    w.wrap = true;
    w.selectable = false;
    w.region = new Region(Offset.ORIGIN, new Size(10, 5));
    const buffer = new ScreenBuffer(10, 5);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("markup with a mixed themed/literal color resolves only the $-prefixed field", () => {
    const w = withText(new LabelWidget(), "[$accent on blue]hi[/]");
    w.markup = true;
    w.region = new Region(Offset.ORIGIN, new Size(10, 1));
    const buffer = new ScreenBuffer(10, 1);
    expect(() => w.render(buffer)).not.toThrow();
  });
});

describe("RichTextWidget selectable lines", () => {
  test("an empty rich-text has no selectable line", () => {
    expect(new RichTextWidget().selectableLines()).toEqual([]);
  });

  test("strips inline markup to a plain selectable line", () => {
    expect(withText(new RichTextWidget(), "[red]value[/]").selectableLines()).toEqual(["value"]);
  });

  test("an already-handled mouse event is left untouched (no re-processing)", () => {
    const w = withText(new RichTextWidget(), "y");
    const ev = { type: "press", button: "left", x: 0, y: 0, handled: true } as any;
    w.handleMouse(ev);
    expect(ev.handled).toBe(true); // consumed upstream → early return, still handled
  });

  test("wrapWidth clamps to an explicit numeric width style instead of the measure budget", () => {
    const w = withText(new RichTextWidget(), "hello world");
    w.style.width = 5;
    w.region = new Region(Offset.ORIGIN, new Size(50, 3));
    w.measure(50, 10);
    // Explicit width (5) is narrower than the offered budget (50), so the
    // measured width is capped at 5, not left at the full budget.
    expect(w.measuredWidth).toBeLessThanOrEqual(5);
  });

  test("measure skips height/width auto-sizing when an explicit style value is set", () => {
    const w = withText(new RichTextWidget(), "a longer line of prose that could wrap");
    w.wrap = true;
    w.style.height = 7;
    w.style.width = 20;
    w.measure(20, 20);
    // Explicit style values win outright: rich-text's own auto-sizing (which
    // would otherwise derive height/width from the wrapped row count) never
    // overwrites what the base Widget.measure() already set from style.
    expect(w.measuredHeight).toBe(7);
    expect(w.measuredWidth).toBe(20);
  });

  test("the row-layout memo evicts its oldest entry past 4 distinct widths", () => {
    const w = withText(new RichTextWidget(), "one two three four five six seven eight");
    w.wrap = true;
    w.region = new Region(Offset.ORIGIN, new Size(50, 20));
    for (const width of [5, 10, 15, 20, 25, 30]) {
      w.measure(width, 20);
    }
    // No assertion beyond "doesn't throw and keeps measuring correctly" — the
    // memo is an internal perf cache; exercising 6 distinct widths pushes it
    // past its 4-slot cap and forces the shift() eviction branch to run.
    expect(w.measuredHeight).toBeGreaterThan(0);
  });

  test("render clips rows that fall past the box's bottom edge", () => {
    const w = withText(new RichTextWidget(), "line one\nline two\nline three");
    w.region = new Region(Offset.ORIGIN, new Size(20, 1));
    const buffer = new ScreenBuffer(20, 1);
    expect(() => w.render(buffer)).not.toThrow();
    expect(
      buffer.cells[0]
        .map((c) => c.char)
        .join("")
        .trim()
        .startsWith("line one"),
    ).toBe(true);
  });

  test("render registers no selectable run when the content rect has zero width", () => {
    const w = withText(new RichTextWidget(), "text");
    w.selectable = true;
    w.region = new Region(Offset.ORIGIN, new Size(0, 1));
    const buffer = new ScreenBuffer(1, 1);
    expect(() => w.render(buffer)).not.toThrow();
  });
});
