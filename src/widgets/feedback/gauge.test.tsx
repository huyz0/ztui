import { describe, expect, test } from "vitest";
import { App } from "../../core/app.ts";
import { Gauge, VBox } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";
import { GaugeWidget } from "./gauge.ts";

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

  test("the partial (boundary) cell bands by its own scale position, not the raw value", async () => {
    // Regression: the boundary eighth-block cell colored itself from raw
    // `this.value` while full cells band by their own interpolated
    // `cellValue`. With a narrow bar, a cell's fractional position on the
    // scale can sit in a different threshold band than the raw value itself
    // (rounding collapses several scale units into one cell) — value=36
    // with a 3-wide bar puts the boundary cell's own position at ~66.7,
    // past the 50 threshold, even though the raw value (36) is before it.
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <Gauge
          id="g"
          style={{ width: 3 }}
          value={36}
          showValue={false}
          label={undefined}
          thresholds={[
            { at: 0, color: "$success" },
            { at: 50, color: "$error" },
          ]}
        />
      </VBox>,
      { cols: 10, rows: 3 },
    );
    await settle();
    const r = findById("g").getClientRect();
    // The boundary cell is at index `full` = 1 (0-based) for this input.
    const boundary = cellAt(r.x + 1, r.y) as { style: { color?: string } };
    const errorColor = App.instance?.cssResolver.resolveVariable(findById("g")!, "$error");
    expect(boundary.style.color).toBe(errorColor);
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

  test("a fractional value prints one decimal in a unit readout", async () => {
    const { text } = await mountApp(
      <VBox>
        <Gauge id="g" style={{ width: 28 }} value={12.5} max={100} unit="MB" />
      </VBox>,
      { cols: 34, rows: 4 },
    );
    expect(text()).toContain("12.5"); // fmtNum keeps one decimal for non-integers
  });

  test("a zero range (min === max) renders an empty bar without dividing by zero", async () => {
    const { findById, text } = await mountApp(
      <VBox>
        <Gauge
          id="g"
          style={{ width: 20, height: 1 }}
          value={5}
          min={5}
          max={5}
          showValue={false}
        />
      </VBox>,
      { cols: 24, rows: 3 },
    );
    expect(findById("g")).toBeDefined();
    expect(() => text()).not.toThrow();
  });

  test("a 1-wide content rect clamps labelW to 0 instead of going negative", async () => {
    // Defensive: labelW = min(stringWidth(label), rect.width - 2) could go
    // negative once rect.width dropped to 1 (rect.width - 2 === -1). The
    // `labelW > 0` checks elsewhere happen to treat -1 the same as 0 today,
    // so this isn't currently visible in output, but labelW should never be
    // a negative "width" — clamp it so future changes to this logic (e.g. a
    // `>= 0` check, or reusing labelW as a slice length) can't regress on it.
    const { findById, text } = await mountApp(
      <VBox>
        <Gauge id="g" label="CPU" style={{ width: 1, height: 1 }} value={50} showValue={false} />
      </VBox>,
      { cols: 10, rows: 3 },
    );
    expect(findById("g")).toBeDefined();
    expect(() => text()).not.toThrow();
    // The label can't fit in a 1-wide bar — it must not appear at all, and
    // the single cell renders as bar fill/track, not a clipped label glyph.
    expect(text()).not.toContain("CPU");
  });

  test("measure() falls back to its intrinsic size when width/height style is unset", () => {
    const w = new GaugeWidget();
    w.label = "CPU";
    w.value = 50;
    // No style.width/height at all -> computedStyle.width/height are undefined,
    // taking the intrinsic-size branch rather than parseDimension.
    w.measure(80, 24);
    expect(w.measuredWidth).toBeGreaterThan(0);
    expect(w.measuredHeight).toBe(1);
  });

  test("measure() falls back to the intrinsic default for a non-numeric (fr) width/height", () => {
    const w = new GaugeWidget();
    w.value = 50;
    w.style.width = "1fr"; // parseDimension returns {fr}, not a number
    w.style.height = "1fr";
    w.measure(80, 24);
    expect(w.measuredWidth).toBeGreaterThan(0);
    expect(w.measuredHeight).toBeGreaterThan(0);
  });
});
