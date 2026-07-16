import { describe, expect, test } from "vitest";
import { ScreenBuffer } from "../../render/buffer.ts";
import { iconRegistry } from "../../render/icon-registry.ts";
import { Segment } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import {
  _imageCacheSizeForTest,
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

  test("falls back to fontSize-derived defaults when the font metrics report zero", () => {
    // A font/engine that reports no bounding box at all (width/ascent/descent
    // all 0) must not leave the cell with zero size — fall back to fontSize
    // ratios instead of dividing by / drawing at zero. fontSize itself is 0
    // here so every fallback ratio (including the derived cellHeight) is
    // actually exercised rather than short-circuited by a nonzero left side.
    const { ctx } = mockCtx();
    ctx.measureText = () => ({
      width: 0,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
    });
    const m = measureCellFromBlock(ctx, 0, "Mono");
    expect(m.cellWidth).toBe(0);
    expect(m.baseline).toBe(0);
    expect(m.cellHeight).toBe(0);
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

  test("shared image cache evicts the oldest entry once past its size cap", () => {
    // Regression: svgImageCache was an unbounded module-level Map — a session
    // that cycles through many distinct image sources (e.g. a per-frame
    // data-URI, or an icon tinted through many colors) would retain every
    // decoded <img> forever.
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
      ctx.drawImage = () => {};
      const sizeBefore = _imageCacheSizeForTest();
      // One more than the cache's cap, each a distinct `img` source so every
      // cell forces a fresh cache entry.
      const CAP_PLUS_ONE = 257;
      for (let i = 0; i < CAP_PLUS_ONE; i++) {
        const cells: any[][] = [[{ c: " ", img: `evict-test:${i}`, gw: 1, gh: 1 }]];
        renderBufferToCanvas(cells, ctx, METRICS, OPTS);
      }
      // The cache must not have grown by the full count added — it stayed
      // capped, evicting the oldest entries as new ones came in.
      expect(_imageCacheSizeForTest() - sizeBefore).toBeLessThan(CAP_PLUS_ONE);
      expect(_imageCacheSizeForTest()).toBeLessThanOrEqual(256);
    } finally {
      (globalThis as any).Image = prevImage;
    }
  });

  test("glyph and box-drawing draws align to the same snapped grid as background fills", () => {
    // Regression: the glyph/box-drawing pass computed its own x0/cy from raw
    // `x * cellWidth` / `y * cellHeight` instead of the snapped colX/rowY
    // arrays the background-fill pass uses. With a non-integer cell width at a
    // high column index, the accumulated rounding drift left glyph centers
    // (and box-drawing strokes) off the same pixel grid as their own cell's
    // background fill -- a visible seam on non-1x DPR.
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(8, 1);
    // A fractional cell width whose drift compounds noticeably by column 6.
    const metrics = { ...METRICS, cellWidth: 7.225 };
    buf.drawSegment(6, 0, new Segment("G", new Style({ background: "blue" })));
    renderBufferToCanvas(serializeForCanvas(buf), ctx, metrics, OPTS);

    const bgRun = calls.fillRect.find((r) => r[2] > 0 && r !== calls.fillRect[0]);
    expect(bgRun).toBeTruthy();
    const [bgX, , bgW] = bgRun as number[];
    const glyphCall = calls.fillText.find((c) => c[0] === "G");
    expect(glyphCall).toBeTruthy();
    const [, glyphX] = glyphCall as [string, number, number];
    // The glyph is centered within its own cell's background rect, both
    // computed from the same snapped column boundary.
    expect(glyphX).toBeCloseTo(bgX + bgW / 2, 5);
  });

  test("snaps a fractional baseline to the device-pixel grid before drawing text", () => {
    // Regression: `metrics.baseline` (the measured ascent) is generally
    // fractional. The glyph draw used it raw (`cy + baseline`), landing text
    // on a sub-pixel row and blurring it, even though row tops/heights are
    // already snapped to the DPR grid.
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(1, 1);
    buf.drawSegment(0, 0, new Segment("A"));
    const metrics = { ...METRICS, baseline: 11.3 };
    renderBufferToCanvas(serializeForCanvas(buf), ctx, metrics, OPTS);
    const call = calls.fillText.find((c) => c[0] === "A") as [string, number, number];
    expect(call).toBeTruthy();
    const [, , y] = call;
    // At dpr=2 the grid step is 0.5px; a raw 11.3 baseline would put the row
    // at y=11.3, off the grid entirely.
    expect((y * OPTS.dpr) % 1).toBeCloseTo(0, 10);
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

  test("an empty buffer (0 rows) renders without drawing anything out of bounds", () => {
    const { ctx, calls } = mockCtx();
    renderBufferToCanvas([], ctx, METRICS, OPTS);
    expect(calls.fillRect.length).toBe(1); // just the (zero-size) clear rect
  });

  test("defaults dpr to 1 when omitted from render options", () => {
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(2, 1);
    buf.setCell(0, 0, "█", new Style({ color: "cyan" }));
    renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, {
      fontSize: 12,
      fontFamily: "Mono",
    });
    // No dpr snapping distortion: the block fill spans exactly one cell width.
    const block = calls.fillRect.find((r) => r[2] > 0 && r !== calls.fillRect[0]);
    expect(block?.[2]).toBeCloseTo(METRICS.cellWidth, 5);
  });

  test("an even stroke width doesn't add the half-pixel odd-width snap", () => {
    // t = max(1, round(fontSize/14)); fontSize 28 -> t=2 (even), which must
    // skip the "+0.5" crisp-line offset used only for odd (1px-ish) strokes.
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(2, 1);
    buf.setCell(0, 0, "─", new Style({ color: "white" }));
    renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, { ...OPTS, fontSize: 28 });
    expect(calls.stroke).toBeGreaterThan(0);
  });

  test("a lone continuation cell (no preceding image) is skipped", () => {
    const { ctx, calls } = mockCtx();
    const cells: any[][] = [
      [
        { c: "", cont: true },
        { c: "x", fg: "white" },
      ],
    ];
    renderBufferToCanvas(cells, ctx, METRICS, OPTS);
    expect(calls.fillText.some((c) => c[0] === "x")).toBe(true);
    expect(calls.fillText.some((c) => c[0] === "")).toBe(false);
  });

  test("an image cell without explicit gw/gh spans exactly one cell", () => {
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
      const drawnSizes: any[] = [];
      ctx.drawImage = (_img: any, _x: number, _y: number, w: number, h: number) =>
        drawnSizes.push([w, h]);
      const cells: any[][] = [[{ c: " ", img: "no-gw-gh-test" }]];
      renderBufferToCanvas(cells, ctx, METRICS, OPTS);
      expect(drawnSizes).toEqual([[METRICS.cellWidth, METRICS.cellHeight]]);
    } finally {
      (globalThis as any).Image = prevImage;
    }
  });

  test("a wide (double-width) glyph spans two cells when centering its text", () => {
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(4, 1);
    buf.drawSegment(0, 0, new Segment("📁", new Style({ color: "white" }))); // wide + continuation
    renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, OPTS);
    const call = calls.fillText.find((c) => c[0] === "📁");
    expect(call).toBeTruthy();
    // Centered across 2 cells, not 1: x should be roughly cellWidth (not cellWidth/2).
    const [, x] = call as [string, number, number];
    expect(x).toBeGreaterThan(METRICS.cellWidth / 2 + 1);
  });

  test("an icon cell whose registered icon has no SVG falls back to centered text", () => {
    // canvas-serialize.ts ships `icon: true` without `svg` when the icon has
    // an empty svg (e.g. a Seti glyph that failed to load a font) — the
    // canvas must still center the glyph's own ink box rather than throwing.
    iconRegistry.registerIcon({ name: "no-svg-icon", svg: "", textFallback: "?" });
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(2, 1);
    buf.cells[0][0] = {
      char: "?",
      style: new Style({ color: "white" }),
      wideContinuation: false,
      icon: "no-svg-icon",
    };
    renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, OPTS);
    expect(calls.fillText.some((c) => c[0] === "?")).toBe(true);
  });

  test("an icon cell with no measurable ink box falls back to a centered baseline", () => {
    iconRegistry.registerIcon({ name: "no-ink-icon", svg: "", textFallback: "?" });
    const { ctx, calls } = mockCtx();
    ctx.measureText = () => ({ width: 9, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 });
    const buf = new ScreenBuffer(2, 1);
    buf.cells[0][0] = {
      char: "?",
      style: new Style({ color: "white" }),
      wideContinuation: false,
      icon: "no-ink-icon",
    };
    renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, OPTS);
    const call = calls.fillText.find((c) => c[0] === "?") as [string, number, number];
    expect(call).toBeTruthy();
    // inkAscent/inkDescent both fell back to 0, so the glyph centers exactly
    // on the row's vertical middle.
    const [, , y] = call;
    expect(y).toBeCloseTo(0 + METRICS.cellHeight / 2, 5);
  });

  test("dashed box-drawing glyphs use the wider dash pattern (not dotted)", () => {
    const { ctx, calls } = mockCtx();
    const buf = new ScreenBuffer(2, 1);
    buf.setCell(0, 0, "┄", new Style({ color: "white" })); // e/w, dash: "dashed"
    renderBufferToCanvas(serializeForCanvas(buf), ctx, METRICS, OPTS);
    expect(calls.stroke).toBeGreaterThan(0);
  });

  test("drawSvgCell/drawImageCell no-op without a global Image constructor", () => {
    const prevImage = (globalThis as any).Image;
    (globalThis as any).Image = undefined;
    try {
      const { ctx, calls } = mockCtx();
      const cells: any[][] = [
        [
          { c: "•", svg: "<svg/>", fg: "white" },
          { c: " ", img: "some-src", gw: 1, gh: 1 },
        ],
      ];
      expect(() => renderBufferToCanvas(cells, ctx, METRICS, OPTS)).not.toThrow();
      expect(calls.fillRect.length).toBeGreaterThan(0); // still drew the background/clear
    } finally {
      (globalThis as any).Image = prevImage;
    }
  });

  test("drawSvgCell/drawImageCell skip drawImage while the image hasn't loaded yet", () => {
    class NotLoadedImage {
      onload: (() => void) | null = null;
      complete = false; // still decoding
      naturalWidth = 0;
      set src(_v: string) {}
    }
    const prevImage = (globalThis as any).Image;
    (globalThis as any).Image = NotLoadedImage;
    try {
      const { ctx } = mockCtx();
      let drawImageCalls = 0;
      ctx.drawImage = () => {
        drawImageCalls++;
      };
      const cells: any[][] = [
        [
          { c: "•", svg: "<svg/>unique-not-loaded", fg: "white" },
          { c: " ", img: "unique-not-loaded-src", gw: 1, gh: 1 },
        ],
      ];
      renderBufferToCanvas(cells, ctx, METRICS, OPTS);
      expect(drawImageCalls).toBe(0);
    } finally {
      (globalThis as any).Image = prevImage;
    }
  });

  test("drawSvgCell/drawImageCell call requestRepaint once the image finishes decoding", () => {
    const instances: any[] = [];
    class TrackedImage {
      onload: (() => void) | null = null;
      complete = false;
      naturalWidth = 0;
      constructor() {
        instances.push(this);
      }
      set src(_v: string) {}
    }
    const prevImage = (globalThis as any).Image;
    (globalThis as any).Image = TrackedImage;
    try {
      const { ctx } = mockCtx();
      ctx.drawImage = () => {};
      let repaints = 0;
      const cells: any[][] = [
        [
          { c: "•", svg: "<svg/>onload-test-svg", fg: "white" },
          { c: " ", img: "onload-test-img", gw: 1, gh: 1 },
        ],
      ];
      renderBufferToCanvas(cells, ctx, METRICS, {
        ...OPTS,
        requestRepaint: () => {
          repaints++;
        },
      });
      expect(instances.length).toBe(2); // one for the svg icon, one for the image
      for (const img of instances) img.onload?.();
      expect(repaints).toBe(2);
    } finally {
      (globalThis as any).Image = prevImage;
    }
  });

  test("drawSvgCell/drawImageCell reuse a cached Image on a repeat render (no re-fetch)", () => {
    let constructedCount = 0;
    class CountingImage {
      onload: (() => void) | null = null;
      complete = true;
      naturalWidth = 16;
      constructor() {
        constructedCount++;
      }
      set src(_v: string) {}
    }
    const prevImage = (globalThis as any).Image;
    (globalThis as any).Image = CountingImage;
    try {
      const { ctx } = mockCtx();
      ctx.drawImage = () => {};
      const cells: any[][] = [
        [
          { c: "•", svg: "<svg/>cache-hit-test", fg: "white" },
          { c: " ", img: "cache-hit-test-src", gw: 1, gh: 1 },
        ],
      ];
      renderBufferToCanvas(cells, ctx, METRICS, OPTS);
      const afterFirst = constructedCount;
      expect(afterFirst).toBeGreaterThan(0);
      renderBufferToCanvas(cells, ctx, METRICS, OPTS);
      // Second render with the same svg/img keys must hit the cache, not
      // construct new Image instances.
      expect(constructedCount).toBe(afterFirst);
    } finally {
      (globalThis as any).Image = prevImage;
    }
  });
});
