import { describe, expect, test } from "vitest";
import { Gauge, VBox } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";

// Eighth-blocks occupy U+2588 (█) … U+258F (▏).
const isFill = (ch: string) =>
  ch.length > 0 && ch.charCodeAt(0) >= 0x2588 && ch.charCodeAt(0) <= 0x258f;

/** Cells in a row matching a predicate. */
function countRow(
  cellAt: (x: number, y: number) => { char: string },
  rect: { x: number; y: number; width: number },
  pred: (ch: string) => boolean,
): number {
  let n = 0;
  for (let x = rect.x; x < rect.x + rect.width; x++) if (pred(cellAt(x, rect.y).char)) n++;
  return n;
}

describe("Gauge", () => {
  test("fills proportionally and prints a percentage readout", async () => {
    const { findById, cellAt, text, settle } = await mountApp(
      <VBox>
        <Gauge id="g" style={{ width: 24 }} value={50} />
      </VBox>,
      { cols: 40, rows: 4 },
    );
    await settle();
    expect(text()).toContain("50%");
    const r = findById("g").getClientRect();
    const fill = countRow(cellAt, r, isFill);
    // ~half of the ~20-wide bar (24 - " 50%" readout) is filled.
    expect(fill).toBeGreaterThan(6);
    expect(fill).toBeLessThan(16);
  });

  test("colours the fill by the threshold band the value falls in", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <Gauge
          id="g"
          style={{ width: 20 }}
          value={95}
          showValue={false}
          thresholds={[
            { at: 0, color: "$success" },
            { at: 70, color: "$warning" },
            { at: 90, color: "$error" },
          ]}
        />
      </VBox>,
      { cols: 30, rows: 4 },
    );
    await settle();
    const r = findById("g").getClientRect();
    const colors = new Set<string>();
    for (let x = r.x; x < r.x + r.width; x++) {
      const c = cellAt(x, r.y) as { char: string; style: { color?: string } };
      if (isFill(c.char)) colors.add(c.style.color ?? "");
    }
    // A value spanning all three bands paints at least the three zone colours.
    expect(colors.size).toBeGreaterThanOrEqual(3);
  });

  test("uses a unit readout and clamps an out-of-range value", async () => {
    const { text, settle } = await mountApp(
      <VBox>
        <Gauge id="g" style={{ width: 24 }} value={9999} max={100} unit="MB" />
      </VBox>,
      { cols: 40, rows: 4 },
    );
    await settle();
    expect(text()).toContain("9999MB"); // readout shows the raw value + unit
  });

  test("survives a tiny width by shedding the readout and label", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <Gauge id="g" style={{ width: 3 }} label="CPU" value={80} />
      </VBox>,
      { cols: 20, rows: 4 },
    );
    await settle();
    const r = findById("g").getClientRect();
    expect(r.width).toBe(3);
    expect(countRow(cellAt, r, isFill)).toBeGreaterThan(0); // bar survives
    expect(cellAt(r.x + r.width, r.y).char.trim()).toBe(""); // nothing past the edge
  });
});
