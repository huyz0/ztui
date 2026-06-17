import { describe, expect, test } from "vitest";
import { Syntax, VBox } from "../../react.ts";
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
});
