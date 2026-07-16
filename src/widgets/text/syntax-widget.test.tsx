import { describe, expect, test, vi } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { Syntax, VBox } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { Syntax as SyntaxEngine } from "../../render/rich/syntax.ts";
import "../../syntax.ts";
import { mountApp } from "../../test/harness.tsx";
import { SyntaxWidget } from "./syntax.ts";

describe("SyntaxWidget", () => {
  test("empty code has no selectable lines", async () => {
    const t = await mountApp(
      <VBox>
        <Syntax id="s" language="ts">
          {""}
        </Syntax>
      </VBox>,
    );
    await t.settle();
    expect(t.findById<SyntaxWidget>("s")?.selectableLines()).toEqual([]);
  });

  test("clips long highlighted code to a tiny viewport without overflowing", async () => {
    const code = Array.from({ length: 20 }, (_, i) => `const x${i} = ${"y".repeat(40)};`).join(
      "\n",
    );
    const t = await mountApp(
      <VBox>
        <Syntax id="s" language="ts" style={{ width: 12, height: 3 }}>
          {code}
        </Syntax>
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await t.settle();
    const rows = t.text().split("\n");
    // Nothing painted past the 12-col / 3-row box (vertical + horizontal clip).
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(20);
    expect(t.findById("s")).toBeDefined();
  });

  test("renders a code block with line numbers and theme support", async () => {
    const tsCode = "const a = 12;\nconst b = 'str';";
    const { app } = await mountApp(
      <VBox>
        <Syntax language="typescript" lineNumbers={true} theme="default-dark">
          {tsCode}
        </Syntax>
        <Syntax language="typescript" lineNumbers={false} theme="default-light">
          {"const x = true;"}
        </Syntax>
        <Syntax language="diff" lineNumbers={false}>
          {"- old line\n+ new line"}
        </Syntax>
        <Syntax language="unknown" lineNumbers={false}>
          {"plain text"}
        </Syntax>
      </VBox>,
      { cols: 40, rows: 15, capabilities: { glyphProtocol: false, graphicsProtocol: "none" } },
    );

    const buffer = app.buffer;

    // Gutter for a 2-line block: max 1 digit + " │ " = 4 chars wide -> " 1 │ const a = 12;"
    expect(buffer.cells[0][0].char).toBe(" ");
    expect(buffer.cells[0][1].char).toBe("1");
    expect(buffer.cells[0][2].char).toBe(" ");
    expect(buffer.cells[0][3].char).toBe("│");

    // Line 2: no line numbers.
    expect(buffer.cells[2][0].char).toBe("c");

    // Line 3: diff.
    expect(buffer.cells[3][0].char).toBe("-");
  });

  test("handleMouse ignores an event already handled upstream", async () => {
    const t = await mountApp(
      <VBox>
        <Syntax id="s" language="ts">
          {"const x = 1;"}
        </Syntax>
      </VBox>,
    );
    await t.settle();
    const widget = t.findById<SyntaxWidget>("s")!;
    const before = t.driver.clipboard.get();
    widget.handleMouse({
      type: "press",
      button: "left",
      x: 0,
      y: 0,
      handled: true,
    } as never);
    await expect(t.driver.clipboard.get()).resolves.toEqual(await before);
  });

  test("measure resolves an explicit width/height instead of auto-sizing", async () => {
    const t = await mountApp(
      <VBox>
        <Syntax id="s" language="ts" style={{ width: 30, height: 5 }}>
          {"const x = 1;\nconst y = 2;"}
        </Syntax>
      </VBox>,
    );
    await t.settle();
    const widget = t.findById<SyntaxWidget>("s")!;
    expect(widget.measuredWidth).toBe(30);
    expect(widget.measuredHeight).toBe(5);
  });

  test("measure auto-sizes width/height with an 'fr' dimension, same as unset", async () => {
    const t = await mountApp(
      <VBox style={{ width: 40 }}>
        <Syntax id="s" language="ts" style={{ width: "1fr", height: "1fr" }}>
          {"const x = 1;\nconst y = 2;"}
        </Syntax>
      </VBox>,
      { cols: 40, rows: 10 },
    );
    await t.settle();
    const widget = t.findById<SyntaxWidget>("s")!;
    // "fr" hits the same auto-sizing branch as no explicit width — height is
    // the line count (+ border/padding), not the "1fr" token treated literally.
    expect(widget.measuredHeight).toBe(2);
  });

  test("resolves colored segments to the raw color when there's no App to resolve theme variables", () => {
    // With no App.instance, `App.instance?.cssResolver.resolveVariable(...)`
    // short-circuits to undefined for every colored segment, exercising the
    // `|| segment.style.color` fallback (and the color/no-color ternary, since
    // highlighted TS code produces both colored and plain segments).
    const widget = new SyntaxWidget();
    widget.language = "typescript";
    (widget as any).getTextContent = () => "const x = 1;";
    widget.region = new Region(new Offset(0, 0), new Size(40, 3));
    const buffer = new ScreenBuffer(40, 3);
    expect(() => widget.render(buffer)).not.toThrow();
    // Something painted — proves the render loop actually walked segments
    // rather than bailing out early.
    expect(buffer.cells[0].some((c) => c.char !== " ")).toBe(true);

    // Plain ("text") language: no colored tokens at all, exercising the
    // ternary's "no color" (undefined) branch too.
    const plain = new SyntaxWidget();
    plain.language = "text";
    (plain as any).getTextContent = () => "just plain text";
    plain.region = new Region(new Offset(0, 0), new Size(40, 3));
    const plainBuffer = new ScreenBuffer(40, 3);
    expect(() => plain.render(plainBuffer)).not.toThrow();
    expect(plainBuffer.cells[0].some((c) => c.char !== " ")).toBe(true);
  });

  test("falls back to plain lines if highlighting itself throws", async () => {
    const spy = vi.spyOn(SyntaxEngine, "renderToLines").mockImplementation(() => {
      throw new Error("boom");
    });
    try {
      const t = await mountApp(
        <VBox>
          <Syntax id="s" language="ts">
            {"const x = 1;"}
          </Syntax>
        </VBox>,
      );
      await t.settle();
      expect(t.buffer.cells[0][0].char).toBe("c");
    } finally {
      spy.mockRestore();
    }
  });
});
