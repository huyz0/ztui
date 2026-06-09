import { describe, expect, test } from "vitest";
import { HBox, ProgressBar } from "../../index.ts";
import { mountApp } from "../../test/harness.tsx";

// Default theme primary is #00ffff (cyan); the bar fills with that and dims
// toward black for the empty track.
const FILL = "rgb(0, 255, 255)";
const channelSum = (c: string): number =>
  (c.match(/\d+/g) ?? []).reduce((n, x) => n + Number(x), 0);

describe("ZTUI ProgressBar Widget Suite", () => {
  test("renders a solid block band coloured by progress", async () => {
    const { findById, cellAt } = await mountApp(
      <HBox>
        <ProgressBar id="pb" value={50} style={{ width: 10 }} />
      </HBox>,
      { cols: 20, rows: 3 },
    );
    expect(findById("pb")).toBeDefined();

    // Every cell is the same full block — progress is shown via colour only.
    for (let x = 0; x < 10; x++) {
      expect(cellAt(x, 0).char).toBe("█");
    }
    // First half is the bright fill colour, second half a dark shade of it.
    expect(cellAt(0, 0).style.color).toBe(FILL);
    expect(channelSum(cellAt(9, 0).style.color ?? "")).toBeLessThan(channelSum(FILL));
  });

  test("a fully complete bar is entirely the fill colour", async () => {
    const { cellAt } = await mountApp(
      <HBox>
        <ProgressBar value={100} style={{ width: 8 }} />
      </HBox>,
      {
        cols: 20,
        rows: 3,
      },
    );
    for (let x = 0; x < 8; x++) {
      expect(cellAt(x, 0).style.color).toBe(FILL);
    }
  });

  test("boundary cell takes an in-between shade for sub-cell progress", async () => {
    // width 10, 55% => 5 full cells, boundary cell half-lit.
    const { cellAt } = await mountApp(
      <HBox>
        <ProgressBar value={55} style={{ width: 10 }} />
      </HBox>,
      {
        cols: 20,
        rows: 3,
      },
    );
    const full = channelSum(cellAt(0, 0).style.color ?? "");
    const boundary = channelSum(cellAt(5, 0).style.color ?? "");
    const empty = channelSum(cellAt(9, 0).style.color ?? "");
    expect(boundary).toBeGreaterThan(empty);
    expect(boundary).toBeLessThan(full);
  });

  test("shows percent readout when requested", async () => {
    const { text } = await mountApp(
      <HBox>
        <ProgressBar value={42} showPercent style={{ width: 20 }} />
      </HBox>,
      {
        cols: 30,
        rows: 3,
      },
    );
    expect(text()).toContain("42%");
  });
});
