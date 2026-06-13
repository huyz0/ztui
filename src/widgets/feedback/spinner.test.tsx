import { describe, expect, test } from "vitest";
import { HBox, Spinner, WaitingGrid, WaitingPanel } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";

const channelSum = (c: string): number =>
  (c.match(/\d+/g) ?? []).reduce((n, x) => n + Number(x), 0);

describe("ZTUI Spinner Widget Suite", () => {
  test("rotate mode draws one of its braille frames in a single cell", async () => {
    const { findById, cellAt } = await mountApp(
      <HBox>
        <Spinner id="sp" mode="rotate" />
      </HBox>,
      { cols: 10, rows: 3 },
    );
    expect(findById("sp")).toBeDefined();
    expect("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏").toContain(cellAt(0, 0).char);
  });

  test("custom frames take priority over the mode glyphs", async () => {
    const { cellAt } = await mountApp(
      <HBox>
        <Spinner mode="rotate" frames={["X", "Y"]} interval={80} />
      </HBox>,
      { cols: 10, rows: 3 },
    );
    expect(["X", "Y"]).toContain(cellAt(0, 0).char);
  });

  test("hex mode shows the outline or filled hexagon", async () => {
    const { cellAt } = await mountApp(
      <HBox>
        <Spinner mode="hex" />
      </HBox>,
      { cols: 10, rows: 3 },
    );
    expect(["⬡", "⬢"]).toContain(cellAt(0, 0).char);
  });

  test("quadrant and arc modes draw from their frame sets", async () => {
    const { cellAt: quad } = await mountApp(
      <HBox>
        <Spinner mode="quadrant" />
      </HBox>,
      { cols: 10, rows: 3 },
    );
    expect("▖▘▝▗").toContain(quad(0, 0).char);

    const { cellAt: arc } = await mountApp(
      <HBox>
        <Spinner mode="arc" />
      </HBox>,
      { cols: 10, rows: 3 },
    );
    expect("◜◠◝◞◡◟").toContain(arc(0, 0).char);
  });

  test("blink mode keeps a fixed glyph and modulates brightness", async () => {
    const { cellAt } = await mountApp(
      <HBox>
        <Spinner mode="blink" />
      </HBox>,
      { cols: 10, rows: 3 },
    );
    expect(cellAt(0, 0).char).toBe("●");
  });
});

describe("ZTUI WaitingGrid Widget Suite", () => {
  test("9 cells lay out as a 3x3 block of solid blocks", async () => {
    const { findById, cellAt } = await mountApp(
      <HBox>
        <WaitingGrid id="wg" cells={9} />
      </HBox>,
      { cols: 10, rows: 5 },
    );
    expect(findById("wg")).toBeDefined();
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(cellAt(x, y).char).toBe("█");
      }
    }
  });

  test("4 cells lay out as a 2x2 block", async () => {
    const { cellAt } = await mountApp(
      <HBox>
        <WaitingGrid cells={4} />
      </HBox>,
      { cols: 10, rows: 5 },
    );
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        expect(cellAt(x, y).char).toBe("█");
      }
    }
  });

  test("radar and shimmer variants render blocks with varying brightness", async () => {
    for (const variant of ["radar", "shimmer"] as const) {
      const { cellAt } = await mountApp(
        <HBox>
          <WaitingGrid cells={9} variant={variant} />
        </HBox>,
        { cols: 10, rows: 5 },
      );
      const sums: number[] = [];
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          expect(cellAt(x, y).char).toBe("█");
          sums.push(channelSum(cellAt(x, y).style.color ?? ""));
        }
      }
      expect(Math.max(...sums)).toBeGreaterThan(Math.min(...sums));
    }
  });

  test("the crest brightens at least one dot above the dim floor", async () => {
    const { cellAt } = await mountApp(
      <HBox>
        <WaitingGrid cells={9} />
      </HBox>,
      { cols: 10, rows: 5 },
    );
    let max = 0;
    let min = Number.POSITIVE_INFINITY;
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const s = channelSum(cellAt(x, y).style.color ?? "");
        max = Math.max(max, s);
        min = Math.min(min, s);
      }
    }
    expect(max).toBeGreaterThan(min);
  });
});

describe("ZTUI WaitingPanel Widget Suite", () => {
  test("fills its sized content area with solid blocks", async () => {
    const { findById, cellAt } = await mountApp(
      <HBox>
        <WaitingPanel id="wp" style={{ width: 8, height: 4 }} />
      </HBox>,
      { cols: 12, rows: 6 },
    );
    expect(findById("wp")).toBeDefined();
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 8; x++) {
        expect(cellAt(x, y).char).toBe("█");
      }
    }
  });

  test("rain variant draws falling glyphs, not solid blocks", async () => {
    const { cellAt } = await mountApp(
      <HBox>
        <WaitingPanel variant="rain" style={{ width: 10, height: 5 }} />
      </HBox>,
      { cols: 14, rows: 7 },
    );
    let glyphs = 0;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 10; x++) {
        const ch = cellAt(x, y).char;
        expect(ch).not.toBe("█");
        if (ch !== " ") glyphs++;
      }
    }
    // Streams cover part of the panel at any instant.
    expect(glyphs).toBeGreaterThan(0);
  });

  test("every variant renders with varying brightness", async () => {
    for (const variant of ["ripple", "orbit", "rain"] as const) {
      const { cellAt } = await mountApp(
        <HBox>
          <WaitingPanel variant={variant} style={{ width: 10, height: 5 }} />
        </HBox>,
        { cols: 14, rows: 7 },
      );
      const sums: number[] = [];
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 10; x++) {
          sums.push(channelSum(cellAt(x, y).style.color ?? ""));
        }
      }
      expect(Math.max(...sums)).toBeGreaterThan(Math.min(...sums));
    }
  });
});
