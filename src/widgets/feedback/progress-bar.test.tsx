import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { HBox, ProgressBar } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { mountApp } from "../../test/harness.tsx";
import { ProgressBarWidget } from "./progress-bar.ts";

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
    // Mid-flight: the painted fill has grown off empty but not yet filled the
    // bar. The tween's follow-up frames are paint-only, batched onto the
    // shared ~100ms cosmetic-repaint clock (see COSMETIC_REPAINT_MS), so wait
    // past at least one batch before sampling.
    await settle(150);
    const mid = litCells(cellAt);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(10);

    // Well past the 300ms default: every cell is lit (landed exactly on 100).
    await settle(360);
    expect(litCells(cellAt)).toBe(10);
  });

  test("indeterminate mode paints an animated sweep across the track", async () => {
    const { cellAt, findById } = await mountApp(
      <HBox>
        <ProgressBar id="pb" indeterminate style={{ width: 12 }} />
      </HBox>,
      { cols: 20, rows: 3 },
    );
    expect(findById("pb")).toBeDefined();
    const colors = new Set<string>();
    for (let x = 0; x < 12; x++) {
      expect(cellAt(x, 0).char).toBe("█"); // solid band
      colors.add(cellAt(x, 0).style.color ?? "");
    }
    // The crest fades into the track, so the row holds more than one shade.
    expect(colors.size).toBeGreaterThan(1);
  });

  test("auto-sizes to an intrinsic width, reserving room for the percent readout", async () => {
    const { findById } = await mountApp(
      <HBox>
        <ProgressBar id="pb" value={10} showPercent />
      </HBox>,
      { cols: 40, rows: 3 },
    );
    // Intrinsic 20-cell track + 5 for " 100%" when no explicit width is set.
    expect(findById("pb")!.getClientRect().width).toBe(25);
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

  test("an animated value tween's own follow-up frames are paint-only, not full relayouts", async () => {
    // Regression: animate() booked requestAnimationTick(this, 16) with no
    // paint-only flag, so every frame of the tween (only ever a fill color,
    // never geometry) forced a full re-measure/re-layout of the whole tree —
    // unlike every other feedback widget's cosmetic ticks.
    let setV: ((n: number) => void) | undefined;
    function Probe() {
      const [v, setVal] = useState(10);
      setV = setVal;
      return (
        <HBox>
          <ProgressBar id="pb" value={v} animate={300} style={{ width: 10 }} />
        </HBox>
      );
    }
    const { app, settle } = await mountApp(<Probe />, { cols: 20, rows: 3 });
    await settle();
    setV?.(90); // this React commit is a real prop change -> a full frame is fine
    await settle(10);
    // The tween is now mid-flight; its own follow-up tick (booked by
    // animate() with no further prop change) must be paint-only. It's
    // batched onto the shared ~100ms cosmetic-repaint clock.
    await settle(150);
    const frame = app.getLastFrame();
    expect(frame?.full).toBe(false);
  });

  test("measure() falls back to intrinsic sizing when width/height style is unset or fr-based", () => {
    const noStyle = new ProgressBarWidget();
    // No style.width/height at all -> both computedStyle values are undefined.
    noStyle.measure(80, 24);
    expect(noStyle.measuredWidth).toBe(20);
    expect(noStyle.measuredHeight).toBe(1);

    const frStyle = new ProgressBarWidget();
    frStyle.style.width = "1fr"; // parseDimension returns {fr}, not a number
    frStyle.style.height = "1fr";
    frStyle.measure(80, 24);
    expect(frStyle.measuredWidth).toBe(20);
    expect(frStyle.measuredHeight).toBe(1);
  });

  test("render() bails out on a non-positive content width", () => {
    const w = new ProgressBarWidget();
    w.value = 50;
    w.region = new Region(Offset.ORIGIN, new Size(0, 1));
    const buffer = new ScreenBuffer(4, 1);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("falls back to the literal 'cyan' fill (and its FALLBACK_RGB shade) with no colour and no App", () => {
    const w = new ProgressBarWidget();
    w.value = 50;
    // Unattached: no computedStyle.color, and no App.instance running, so the
    // primary-colour chain falls all the way to the "cyan" literal, which
    // parseRgb() can't parse (named colour, not hex) -> FALLBACK_RGB is mixed in.
    w.region = new Region(Offset.ORIGIN, new Size(10, 1));
    const buffer = new ScreenBuffer(10, 1);
    w.render(buffer);
    // FALLBACK_RGB = {r:0,g:255,b:255}; the fully-lit leading cell should be
    // exactly that colour (rgbStr formatting), not the theme's default blue.
    expect(buffer.cells[0][0].style.color).toBe("rgb(0, 255, 255)");
  });

  test("a zero range (min === max) shows a 0% readout without dividing by zero", () => {
    const w = new ProgressBarWidget();
    w.value = 5;
    w.min = 5;
    w.max = 5;
    w.showPercent = true;
    w.region = new Region(Offset.ORIGIN, new Size(20, 1));
    const buffer = new ScreenBuffer(20, 1);
    expect(() => w.render(buffer)).not.toThrow();
    const row = Array.from({ length: 20 }, (_, x) => buffer.cells[0][x].char).join("");
    expect(row).toContain("0%");
  });

  test("indeterminate sweep travels forward, then folds back once past the far edge", () => {
    const w = new ProgressBarWidget();
    w.indeterminate = true;
    w.region = new Region(Offset.ORIGIN, new Size(12, 1));
    const buffer = new ScreenBuffer(12, 1);
    // span = trackWidth - 1 = 11; pick Date.now() values so t = (now/60) %
    // (span*2) lands on each side of `span`, forcing both the forward (t) and
    // reflected (span*2 - t) branches deterministically instead of relying on
    // whatever the wall clock happens to be at test time.
    const spy = vi.spyOn(Date, "now");
    try {
      spy.mockReturnValue(60 * 5); // t = 5 <= span (11): forward branch
      expect(() => w.render(buffer)).not.toThrow();
      spy.mockReturnValue(60 * 20); // t = 20 > span (11): reflected branch
      expect(() => w.render(buffer)).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
