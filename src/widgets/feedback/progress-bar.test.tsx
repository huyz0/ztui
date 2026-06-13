import { useState } from "react";
import { describe, expect, test } from "vitest";
import { HBox, ProgressBar } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";
import type { ProgressBarWidget } from "./progress-bar.ts";

// Default theme primary is #4daafc; the bar fills with that and dims
// toward black for the empty track.
const FILL = "rgb(77, 170, 252)";
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

  test("animate tweens the fill toward a new value instead of snapping", async () => {
    let setV: ((n: number) => void) | undefined;
    function Probe() {
      const [v, setVal] = useState(0);
      setV = setVal;
      return (
        <HBox>
          <ProgressBar id="pb" value={v} animate style={{ width: 10 }} />
        </HBox>
      );
    }

    // The widget tweens the *painted* fill internally; `value` stays the target.
    // Count fully-lit fill cells to observe the motion across frames.
    const litCells = (cellAt: (x: number, y: number) => { style: { color?: string } }): number => {
      let n = 0;
      for (let x = 0; x < 10; x++) if (cellAt(x, 0).style.color === FILL) n++;
      return n;
    };

    const { cellAt, settle } = await mountApp(<Probe />, { cols: 20, rows: 3 });
    expect(litCells(cellAt)).toBe(0);

    setV?.(100);
    // Mid-flight: the painted fill has grown off empty but not yet filled the bar.
    await settle(40);
    const mid = litCells(cellAt);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(10);

    // Well past the 300ms default: every cell is lit (landed exactly on 100).
    await settle(360);
    expect(litCells(cellAt)).toBe(10);
  });

  test("without animate, a value change is applied immediately", async () => {
    let setV: ((n: number) => void) | undefined;
    function Probe() {
      const [v, setVal] = useState(0);
      setV = setVal;
      return (
        <HBox>
          <ProgressBar id="pb" value={v} style={{ width: 10 }} />
        </HBox>
      );
    }
    const { findById, settle } = await mountApp(<Probe />, { cols: 20, rows: 3 });
    setV?.(80);
    await settle(10);
    expect(findById<ProgressBarWidget>("pb")?.value).toBe(80);
  });
});
