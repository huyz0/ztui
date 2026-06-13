import { describe, expect, test } from "vitest";
import { ScreenBuffer } from "../../render/buffer.ts";
import { Segment } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import {
  type CanvasMetrics,
  measureCellFromBlock,
  renderBufferToCanvas,
} from "./canvas-renderer.ts";
import { serializeForCanvas } from "./canvas-serialize.ts";

/** A minimal CanvasRenderingContext2D stand-in that records draw calls. */
function mockCtx() {
  const calls = { fillRect: [] as any[], fillText: [] as any[], stroke: 0, arcTo: 0, lineTo: 0 };
  const ctx: any = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textBaseline: "",
    textAlign: "",
    globalAlpha: 1,
    fillRect: (...a: any[]) => calls.fillRect.push(a),
    fillText: (...a: any[]) => calls.fillText.push(a),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {
      calls.lineTo++;
    },
    arcTo: () => {
      calls.arcTo++;
    },
    stroke: () => {
      calls.stroke++;
    },
    setLineDash: () => {},
    measureText: (s: string) => ({
      width: s.length * 9,
      actualBoundingBoxAscent: 11,
      actualBoundingBoxDescent: 3,
    }),
  };
  return { ctx, calls };
}

const OPTS = { fontSize: 12, fontFamily: "Mono", dpr: 2 };
const METRICS: CanvasMetrics = { cellWidth: 9, cellHeight: 14, baseline: 11 };

describe("serializeForCanvas", () => {
  test("flattens cells, resolving colors and skipping wide continuations", () => {
    const buf = new ScreenBuffer(6, 1);
    buf.drawSegment(0, 0, new Segment("Hi", new Style({ color: "cyan", bold: true })));
    buf.drawSegment(3, 0, new Segment("📁")); // wide glyph + continuation
    const cells = serializeForCanvas(buf);
    expect(cells[0][0]).toMatchObject({ c: "H", bold: true });
    expect(cells[0][0].fg).toMatch(/^#/); // "cyan" resolved to a hex color
    expect(cells[0][4]).toMatchObject({ c: "", cont: true }); // continuation cell
  });

  test("reverse swaps fg/bg", () => {
    const buf = new ScreenBuffer(3, 1);
    buf.drawSegment(0, 0, new Segment("x", new Style({ color: "red", reverse: true })));
    const cell = serializeForCanvas(buf)[0][0];
    expect(cell.bg).toMatch(/^#/); // the fg became the background
  });
});

describe("measureCellFromBlock", () => {
  test("derives cell box and baseline from the █ glyph metrics", () => {
    const { ctx } = mockCtx();
    const m = measureCellFromBlock(ctx, 12, "Mono");
    expect(m.cellWidth).toBe(9); // measureText("█").width
    expect(m.cellHeight).toBe(14); // round(ascent 11 + descent 3)
    expect(m.baseline).toBe(11); // ascent
  });
});

describe("renderBufferToCanvas", () => {
  test("fills backgrounds and the clear rect", () => {
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(4, 1);
    buf.drawSegment(0, 0, new Segment("ab", new Style({ background: "blue" })));
    renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, OPTS);
    expect(calls.fillRect.length).toBeGreaterThanOrEqual(2); // clear + bg run
  });

  test("draws box-drawing as strokes (arc for a rounded corner) and text via fillText", () => {
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(4, 1);
    buf.setCell(0, 0, "╭", new Style({ color: "white" }));
    buf.setCell(1, 0, "─", new Style({ color: "white" }));
    buf.setCell(2, 0, "A", new Style());
    renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, OPTS);
    expect(calls.arcTo).toBeGreaterThan(0); // ╭ rounded corner
    expect(calls.stroke).toBeGreaterThan(0);
    expect(calls.fillText.some((c) => c[0] === "A")).toBe(true);
  });

  test("draws block elements as rectangles (full block and shade)", () => {
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(4, 1);
    buf.setCell(0, 0, "█", new Style({ color: "cyan" }));
    buf.setCell(1, 0, "░", new Style({ color: "cyan" }));
    renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, OPTS);
    // clear + two block fills, at least.
    expect(calls.fillRect.length).toBeGreaterThanOrEqual(3);
  });

  test("snaps cell boundaries so a filled run has no sub-pixel gap", () => {
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(3, 1);
    for (let x = 0; x < 3; x++) buf.setCell(x, 0, "█", new Style({ color: "cyan" }));
    renderBufferToCanvas(serializeForCanvas(buf), ctx, { ...METRICS, cellWidth: 7.225 }, OPTS);
    // Each block's right edge equals the next block's left edge (snapped to 1/dpr).
    const blocks = calls.fillRect.filter((r) => r[2] > 0).slice(1); // drop the clear rect
    for (let i = 1; i < blocks.length; i++) {
      const prevRight = blocks[i - 1][0] + blocks[i - 1][2];
      expect(blocks[i][0]).toBeCloseTo(prevRight, 5);
    }
  });
});
