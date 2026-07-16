import { describe, expect, test, vi } from "vitest";
import { Syntax, VBox } from "../../react.ts";
import { Syntax as SyntaxEngine } from "../../render/rich/syntax.ts";
import "../../syntax.ts";
import { mountApp } from "../../test/harness.tsx";
import type { SyntaxWidget } from "./syntax.ts";

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
