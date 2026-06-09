import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Spacing } from "../geometry/spacing.ts";
import { DOMNode } from "./dom.ts";
import { Widget } from "./widget.ts";

describe("geometry toString", () => {
  test("Offset / Size / Region / Spacing render readably", () => {
    expect(new Offset(2, 3).toString()).toBe("(2, 3)");
    expect(new Size(10, 4).toString()).toBe("10x4");
    expect(new Region(new Offset(2, 3), new Size(10, 4)).toString()).toBe("(2,3 10x4)");
    expect(new Spacing(1, 2, 3, 4).toString()).toBe("[t:1 r:2 b:3 l:4]");
  });

  test("template-string interpolation uses toString", () => {
    const r = new Region(new Offset(5, 6), new Size(8, 2));
    expect(`region=${r}`).toBe("region=(5,6 8x2)");
  });
});

describe("DOMNode.describe", () => {
  test("renders tag, id, and classes as a selector", () => {
    const node = new DOMNode("view");
    node.id = "main";
    node.classes = new Set(["a", "b"]);
    expect(node.describe()).toBe("view#main.a.b");
  });

  test("includes the laid-out region for widgets", () => {
    const w = new Widget("button");
    w.id = "ok";
    w.region = new Region(new Offset(2, 1), new Size(10, 1));
    expect(w.describe()).toBe("button#ok @ (2,1 10x1)");
  });

  test("text nodes show a content preview", () => {
    const text = new DOMNode("text") as any;
    text.text = "hello world this is quite long";
    expect(text.describe()).toBe('text("hello world this is…")');
  });
});
