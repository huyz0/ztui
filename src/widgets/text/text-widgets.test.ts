import { describe, expect, test } from "vitest";
import { TextNode } from "../../dom/text-node.ts";
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

  test("a handled mouse event is left alone", () => {
    const w = withText(new LabelWidget(), "x");
    const ev = { type: "press", button: "left", x: 0, y: 0, handled: true } as any;
    expect(() => w.handleMouse(ev)).not.toThrow();
  });
});

describe("RichTextWidget selectable lines", () => {
  test("an empty rich-text has no selectable line", () => {
    expect(new RichTextWidget().selectableLines()).toEqual([]);
  });

  test("strips inline markup to a plain selectable line", () => {
    expect(withText(new RichTextWidget(), "[red]value[/]").selectableLines()).toEqual(["value"]);
  });

  test("a handled mouse event is left alone", () => {
    const w = withText(new RichTextWidget(), "y");
    const ev = { type: "press", button: "left", x: 0, y: 0, handled: true } as any;
    expect(() => w.handleMouse(ev)).not.toThrow();
  });
});
