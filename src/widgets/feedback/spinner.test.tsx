import { describe, expect, test, vi } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { HBox, Spinner, WaitingGrid, WaitingPanel } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { mountApp } from "../../test/harness.tsx";
import { SpinnerWidget } from "./spinner.ts";

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

  test("falls back to the mode's built-in frames when frames is unset or an empty array", () => {
    const noFrames = new SpinnerWidget();
    noFrames.mode = "hex";
    noFrames.frames = undefined;
    noFrames.region = new Region(Offset.ORIGIN, new Size(1, 1));
    const buf1 = new ScreenBuffer(1, 1);
    noFrames.render(buf1);
    expect(["⬡", "⬢"]).toContain(buf1.cells[0][0].char);

    const emptyFrames = new SpinnerWidget();
    emptyFrames.mode = "hex";
    emptyFrames.frames = [];
    emptyFrames.region = new Region(Offset.ORIGIN, new Size(1, 1));
    const buf2 = new ScreenBuffer(1, 1);
    emptyFrames.render(buf2);
    expect(["⬡", "⬢"]).toContain(buf2.cells[0][0].char);
  });

  test("skips rendering while invisible, past the content edge, or off the buffer", () => {
    const invisible = new SpinnerWidget();
    invisible.visible = false;
    invisible.region = new Region(Offset.ORIGIN, new Size(1, 1));
    const buf1 = new ScreenBuffer(1, 1);
    expect(() => invisible.render(buf1)).not.toThrow();
    expect(buf1.cells[0][0].char).toBe(" ");

    const zeroRect = new SpinnerWidget();
    zeroRect.region = new Region(Offset.ORIGIN, new Size(0, 0));
    const buf2 = new ScreenBuffer(1, 1);
    expect(() => zeroRect.render(buf2)).not.toThrow();

    const offBuffer = new SpinnerWidget();
    // Region sits entirely past the (tiny) buffer's bounds.
    offBuffer.region = new Region(new Offset(5, 5), new Size(1, 1));
    const buf3 = new ScreenBuffer(2, 2);
    expect(() => offBuffer.render(buf3)).not.toThrow();
  });

  test("without a CSS resolver, falls back to the literal 'cyan' colour", () => {
    const w = new SpinnerWidget();
    w.mode = "rotate";
    w.region = new Region(Offset.ORIGIN, new Size(1, 1));
    const buffer = new ScreenBuffer(1, 1);
    // Unattached: no computedStyle.color, no App.instance running.
    w.render(buffer);
    expect(buffer.cells[0][0].style.color).toBe("cyan");
  });

  test("blink mode falls back to FALLBACK_RGB when its colour can't be parsed", () => {
    const w = new SpinnerWidget();
    w.mode = "blink";
    // A named colour "cyan" (the unattached fallback) doesn't parse as RGB,
    // so blink's brightness mix must fall back to FALLBACK_RGB rather than
    // throwing or leaving the cell uncoloured.
    const spy = vi.spyOn(Date, "now").mockReturnValue(0);
    try {
      w.region = new Region(Offset.ORIGIN, new Size(1, 1));
      const buffer = new ScreenBuffer(1, 1);
      w.render(buffer);
      expect(buffer.cells[0][0].style.color).toMatch(/^rgb\(/);
    } finally {
      spy.mockRestore();
    }
  });

  test("an unrecognised mode falls back to the rotate frames and default interval scale", () => {
    const w = new SpinnerWidget();
    // Cast past the SpinnerMode union: FRAMES/INTERVAL_SCALE lookups for an
    // unknown mode are undefined, so both must fall back via `??`.
    w.mode = "bogus" as unknown as SpinnerWidget["mode"];
    w.region = new Region(Offset.ORIGIN, new Size(1, 1));
    const buffer = new ScreenBuffer(1, 1);
    w.render(buffer);
    expect("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏").toContain(buffer.cells[0][0].char);
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
