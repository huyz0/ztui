import { describe, expect, test } from "vitest";
import { ScreenBuffer } from "../../render/buffer.ts";
import { iconRegistry } from "../../render/icon-registry.ts";
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

  test("carries underline style/color, an icon's SVG, and inline graphics", () => {
    const buf = new ScreenBuffer(4, 1);
    iconRegistry.registerIcon({ name: "test-dot", svg: "<svg/>", textFallback: "•" });

    buf.cells[0][0] = {
      char: "u",
      style: new Style({ underlineStyle: "curly", underlineColor: "red", strikethrough: true }),
      wideContinuation: false,
    };
    buf.cells[0][1] = { char: "•", style: new Style(), wideContinuation: false, icon: "test-dot" };
    buf.cells[0][2] = {
      char: " ",
      style: new Style(),
      wideContinuation: false,
      graphic: { svg: "<svg></svg>", cellWidth: 2, cellHeight: 1 } as any,
    };
    buf.cells[0][3] = {
      char: " ",
      style: new Style(),
      wideContinuation: false,
      graphic: { pngBase64: "AAAA", cellWidth: 1, cellHeight: 1 } as any,
    };

    const cells = serializeForCanvas(buf);
    expect(cells[0][0]).toMatchObject({ underline: true, uStyle: "curly", strike: true });
    expect(cells[0][0].uColor).toMatch(/^#/);
    expect(cells[0][1]).toMatchObject({ icon: true, svg: "<svg/>" });
    expect(cells[0][2].img).toMatch(/^data:image\/svg\+xml,/);
    expect(cells[0][2]).toMatchObject({ gw: 2, gh: 1 });
    expect(cells[0][3].img).toMatch(/^data:image\/png;base64,/);
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

  test("strokes every rounded corner, straight arm, and double-line glyph", () => {
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(12, 1);
    // ╮ ╰ ╯ exercise the remaining rounded-corner branches; │ ─ the straight
    // arms; ═ ║ ╔ the double-line two-stroke path; ┈ the dashed dash pattern.
    const glyphs = ["╮", "╰", "╯", "│", "─", "═", "║", "╔", "┈", "┊"];
    glyphs.forEach((g, i) => {
      buf.setCell(i, 0, g, new Style({ color: "white" }));
    });
    renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, OPTS);
    expect(calls.arcTo).toBeGreaterThan(0); // ╮ ╰ ╯ corners
    expect(calls.stroke).toBeGreaterThan(glyphs.length); // double glyphs stroke twice
  });

  test("draws strikethrough and every underline style", () => {
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(8, 1);
    buf.setCell(0, 0, "a", new Style({ color: "white", strikethrough: true }));
    buf.setCell(1, 0, "b", new Style({ color: "white", underline: true }));
    buf.setCell(2, 0, "c", new Style({ underlineStyle: "curly", underlineColor: "red" }));
    buf.setCell(3, 0, "d", new Style({ underlineStyle: "double" }));
    buf.setCell(4, 0, "e", new Style({ underlineStyle: "dotted" }));
    buf.setCell(5, 0, "f", new Style({ underlineStyle: "dashed" }));
    renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, OPTS);
    expect(calls.stroke).toBeGreaterThan(0);
    expect(calls.fillText.length).toBeGreaterThanOrEqual(6); // each glyph painted
  });

  test("italic + bold compose into the font string", () => {
    const { ctx } = mockCtx();
    const buf = new ScreenBuffer(2, 1);
    buf.setCell(0, 0, "Z", new Style({ italic: true, bold: true }));
    // Capture the font in effect at fillText time.
    let fontAtDraw = "";
    const origFillText = ctx.fillText;
    ctx.fillText = (...a: any[]) => {
      fontAtDraw = ctx.font;
      return origFillText(...a);
    };
    renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, OPTS);
    expect(fontAtDraw).toContain("italic");
    expect(fontAtDraw).toContain("bold");
  });

  test("draws SVG-icon and inline-image cells when an Image impl is available", () => {
    // No jsdom in this env, so stub a minimal, already-"loaded" Image so the
    // drawSvgCell / drawImageCell paths run their drawImage branch.
    class FakeImage {
      onload: (() => void) | null = null;
      complete = true;
      naturalWidth = 16;
      set src(_v: string) {}
    }
    const prevImage = (globalThis as any).Image;
    (globalThis as any).Image = FakeImage;
    try {
      const { ctx } = mockCtx();
      let drawImageCalls = 0;
      ctx.drawImage = () => {
        drawImageCalls++;
      };
      ctx.imageSmoothingEnabled = false;
      iconRegistry.registerIcon({ name: "draw-dot", svg: "<svg/>", textFallback: "•" });
      const buf = new ScreenBuffer(4, 1);
      buf.cells[0][0] = {
        char: "•",
        style: new Style({ color: "white" }),
        wideContinuation: false,
        icon: "draw-dot",
      };
      buf.cells[0][1] = {
        char: " ",
        style: new Style(),
        wideContinuation: false,
        graphic: { pngBase64: "AAAA", cellWidth: 1, cellHeight: 1 } as any,
      };
      renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, OPTS);
      expect(drawImageCalls).toBeGreaterThanOrEqual(2); // icon SVG + inline image
    } finally {
      (globalThis as any).Image = prevImage;
    }
  });

  test("SVG-icon and inline-image caches don't collide on an equal cache key", () => {
    // Regression: drawSvgCell cached by tinted SVG markup and drawImageCell
    // cached by raw `src` used to share one Map — a tinted markup string equal
    // to an unrelated image `src` would incorrectly reuse the other's cached
    // <img> element instead of loading its own source.
    class FakeImage {
      onload: (() => void) | null = null;
      complete = true;
      naturalWidth = 16;
      _src = "";
      set src(v: string) {
        this._src = v;
        srcAssignments.push(v);
      }
      get src() {
        return this._src;
      }
    }
    const srcAssignments: string[] = [];
    const prevImage = (globalThis as any).Image;
    (globalThis as any).Image = FakeImage;
    try {
      const { ctx } = mockCtx();
      ctx.drawImage = () => {};
      // No `currentColor` token, so drawSvgCell's tint is a no-op — the cache
      // key candidate before namespacing would be this literal string.
      const COLLIDING = "<svg>same-string</svg>";
      const cells: any[][] = [
        [
          { c: "•", svg: COLLIDING, fg: "red" },
          { c: " ", img: COLLIDING, gw: 1, gh: 1 },
        ],
      ];
      renderBufferToCanvas(cells, ctx, METRICS, OPTS);
      // Each path must have created (and assigned .src to) its own Image —
      // the svg path gets a data:image/svg+xml URI, the image path gets the
      // raw string as-is. Two distinct assignments, not one shared/skipped.
      expect(srcAssignments).toHaveLength(2);
      expect(srcAssignments[0]).toContain("data:image/svg+xml");
      expect(srcAssignments[1]).toBe(COLLIDING);
    } finally {
      (globalThis as any).Image = prevImage;
    }
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
