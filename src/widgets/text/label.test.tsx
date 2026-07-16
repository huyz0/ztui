import { describe, expect, test, vi } from "vitest";
import { HBox, Label } from "../../react.ts";
import { RichText } from "../../render/rich/text.ts";
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

  test("copies the raw markup text if RichText.fromMarkup throws when selecting", async () => {
    // selectableLines() has its own try/catch around fromMarkup, independent
    // of render()'s — force it to throw so the raw (un-stripped) text is
    // copied instead of blanking the selection.
    const spy = vi.spyOn(RichText, "fromMarkup").mockImplementation(() => {
      throw new Error("boom");
    });
    try {
      const { findById, driver, settle } = await mountApp(
        <HBox>
          <Label id="lb" markup>
            hello
          </Label>
        </HBox>,
        { cols: 40, rows: 3 },
      );
      const lb = findById("lb");
      await settle();
      const r = lb.getContentRect();
      dragSelect(lb, r.x, r.x + 5, r.y);
      expect(await driver.clipboard.get()).toBe("hello");
    } finally {
      spy.mockRestore();
    }
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

  test("resolves $theme variables in markup span colors", async () => {
    const { cellAt } = await mountApp(
      <HBox>
        <Label markup>{"[$accent]K[/] x"}</Label>
      </HBox>,
      { cols: 20, rows: 1 },
    );
    const color = cellAt(0, 0).style.color;
    // $accent is resolved to a concrete theme color, not left as the literal.
    expect(color).not.toBe("$accent");
    expect(color).not.toBe("default");
    expect(color).toMatch(/^#|rgb|[a-z]/i);
  });

  test("leaves a bracketed dollar literal alone ($ only leads a theme var)", async () => {
    const { text } = await mountApp(
      <HBox>
        <Label markup>{"price [$5.00] today"}</Label>
      </HBox>,
      { cols: 30, rows: 1 },
    );
    // `$5.00` isn't `$`+letter, so it's not a style tag and survives verbatim.
    expect(text()).toContain("price [$5.00] today");
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

  test("renders the plain text if RichText.fromMarkup itself throws", async () => {
    // A malformed-but-parseable string doesn't actually throw (see above) —
    // this exercises render()'s try/catch directly by forcing the parser to
    // throw, so a genuinely broken markup parse still shows something instead
    // of blanking the label.
    const spy = vi.spyOn(RichText, "fromMarkup").mockImplementation(() => {
      throw new Error("boom");
    });
    try {
      const { text } = await mountApp(
        <HBox>
          <Label markup>hello</Label>
        </HBox>,
        { cols: 20, rows: 1 },
      );
      expect(text()).toContain("hello");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Label alignment", () => {
  test("center-aligns text within its box", async () => {
    const { findById } = await mountApp(
      <Label id="lb" style={{ width: 10, align: "center" }}>
        hi
      </Label>,
      { cols: 20, rows: 1 },
    );
    const lb = findById("lb") as any;
    const rect = { x: 5, width: 10, y: 0 };
    // "hi" (width 2) centered in a 10-wide box starts at x + floor((10-2)/2) = x+4.
    expect(lb.alignedX(rect, 2)).toBe(rect.x + 4);
  });

  test("right-aligns text within its box", async () => {
    const { findById } = await mountApp(
      <Label id="lb" style={{ width: 10, align: "right" }}>
        hi
      </Label>,
      { cols: 20, rows: 1 },
    );
    const lb = findById("lb") as any;
    const rect = { x: 5, width: 10, right: 15, y: 0 };
    // "hi" (width 2) right-aligned in a 10-wide box starts at right - 2.
    expect(lb.alignedX(rect, 2)).toBe(rect.right - 2);
  });

  test("center-align clamps to the left edge when text overflows the box", async () => {
    // Drive alignedX() directly with a narrow content rect — going through the
    // full mount+layout pipeline lets the box grow to fit the overflowing
    // text, which would defeat the point of this clamp test.
    const { findById } = await mountApp(
      <Label id="lb" style={{ width: 4, align: "center" }}>
        way too long
      </Label>,
      { cols: 20, rows: 1 },
    );
    const lb = findById("lb") as any;
    const narrowRect = { x: 5, width: 4, y: 0 };
    // Text (12 cols) is wider than the box (4 cols), so the naive centering
    // formula goes negative — Math.max clamps it back to the box's left edge.
    expect(lb.alignedX(narrowRect, 12)).toBe(narrowRect.x);
  });

  test("right-align clamps to the left edge when text overflows the box", async () => {
    const { findById } = await mountApp(
      <Label id="lb" style={{ width: 4, align: "right" }}>
        way too long
      </Label>,
      { cols: 20, rows: 1 },
    );
    const lb = findById("lb") as any;
    const narrowRect = { x: 5, width: 4, right: 9, y: 0 };
    expect(lb.alignedX(narrowRect, 12)).toBe(narrowRect.x);
  });
});

describe("Label wrap", () => {
  const long = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi rho";

  test("wrap spans multiple rows and keeps the tail word", async () => {
    const { findById, settle, text } = await mountApp(
      <Label id="lb" wrap style={{ width: 20 }}>
        {long}
      </Label>,
      { cols: 40, rows: 10 },
    );
    await settle();
    const lb = findById("lb") as any;
    expect(lb.measuredHeight).toBeGreaterThan(1);
    expect(text()).toContain("rho"); // tail not clipped
  });

  test("empty text with wrap enabled produces no wrapped rows", async () => {
    const { findById, settle } = await mountApp(
      <Label id="lb" wrap style={{ width: 20 }}>
        {""}
      </Label>,
      { cols: 40, rows: 10 },
    );
    await settle();
    const lb = findById("lb") as any;
    // No text at all — measure()'s wrappedRows("") early-return keeps the
    // base single-line measurement instead of computing a wrapped height.
    expect(lb.measuredHeight).toBeLessThanOrEqual(1);
  });

  test("wrapped rows past the box height are clipped, not overflowed", async () => {
    const { findById, settle, text } = await mountApp(
      <HBox style={{ width: 10, height: 2 }}>
        <Label id="lb" wrap style={{ width: 10, height: 2 }}>
          {long}
        </Label>
      </HBox>,
      { cols: 40, rows: 10 },
    );
    await settle();
    const lb = findById("lb") as any;
    // Explicit height keeps the box at 2 rows even though the wrapped text
    // needs many more — render()'s `y >= contentRect.bottom` guard must clip
    // the extra rows rather than drawing outside the box.
    const rect = lb.getContentRect();
    expect(rect.height).toBe(2);
    expect(text()).not.toContain("rho"); // the tail word is clipped off
  });

  test("without wrap the label stays a single row", async () => {
    const { findById, settle } = await mountApp(
      <Label id="lb" style={{ width: 20 }}>
        {long}
      </Label>,
      { cols: 40, rows: 10 },
    );
    await settle();
    const lb = findById("lb") as any;
    expect(lb.measuredHeight).toBe(1);
  });
});
