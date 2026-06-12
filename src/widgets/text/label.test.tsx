import { describe, expect, test } from "vitest";
import { HBox, Label } from "../../index.ts";
import { mountApp } from "../../test/harness.tsx";

/** Drive a press→drag→release over a widget's rendered cells (one row). */
function dragSelect(widget: any, fromX: number, toX: number, y: number): void {
  widget.handleMouse({ type: "press", button: "left", x: fromX, y });
  widget.handleMouse({ type: "drag", button: "left", x: toX, y });
  widget.handleMouse({ type: "release", button: "left", x: toX, y });
}

describe("Label selection", () => {
  test("drag selects rendered text and copies it", async () => {
    const { findById, driver, settle } = await mountApp(
      <HBox>
        <Label id="lb">hello world</Label>
      </HBox>,
      { cols: 40, rows: 3 },
    );
    const lb = findById("lb");
    await settle();
    const r = lb.getContentRect();
    dragSelect(lb, r.x, r.x + 5, r.y); // cols [0,5) = "hello"
    expect(await driver.clipboard.get()).toBe("hello");
  });

  test("with markup, copies the plain value not the markup", async () => {
    const { findById, driver, settle } = await mountApp(
      <HBox>
        <Label id="lb" markup>
          [bold]Hi[/] there
        </Label>
      </HBox>,
      { cols: 40, rows: 3 },
    );
    const lb = findById("lb");
    await settle();
    const r = lb.getContentRect();
    dragSelect(lb, r.x, r.x + 2, r.y); // "Hi"
    expect(await driver.clipboard.get()).toBe("Hi");
  });
});

describe("Label markup", () => {
  test("renders literal bracket text verbatim when markup is off", async () => {
    const { text } = await mountApp(
      <HBox>
        <Label>[bold]Hi[/]</Label>
      </HBox>,
      { cols: 20, rows: 1 },
    );
    // The tags are shown as-is; nothing is parsed.
    expect(text()).toContain("[bold]Hi[/]");
  });

  test("parses markup into styled spans when markup is on", async () => {
    const { text, cellAt } = await mountApp(
      <HBox>
        <Label markup>[bold]Hi[/] there</Label>
      </HBox>,
      { cols: 20, rows: 1 },
    );
    // Tags are stripped; the plain text remains.
    expect(text()).toContain("Hi there");
    expect(text()).not.toContain("[bold]");
    // The first run is bold; the text after the closing tag is not.
    expect(cellAt(0, 0).style.bold).toBe(true);
    expect(cellAt(3, 0).char).toBe("t"); // start of " there" → "there"
    expect(cellAt(3, 0).style.bold).toBe(false);
  });

  test("supports underline shapes and colours from this session's markup", async () => {
    const { cellAt } = await mountApp(
      <HBox>
        <Label markup>[undercurl underline=red]typo[/]</Label>
      </HBox>,
      { cols: 20, rows: 1 },
    );
    const c = cellAt(0, 0).style;
    expect(c.underline).toBe(true);
    expect(c.underlineStyle).toBe("curly");
    expect(c.underlineColor).toBe("red");
  });

  test("falls back to raw text on malformed markup instead of blanking", async () => {
    const { text } = await mountApp(
      <HBox>
        <Label markup>{"[unclosed"}</Label>
      </HBox>,
      { cols: 20, rows: 1 },
    );
    expect(text()).toContain("[unclosed");
  });
});
