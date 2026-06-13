/**
 * Hardware-accelerated canvas renderer for the web backend.
 *
 * The DOM/text renderer (`renderBufferToHTML`) fights the browser's line box:
 * box-drawing glyphs tile at one em but text wants more, so no single
 * line-height satisfies both. A canvas sidesteps this entirely — there is no
 * line box. Each cell is painted at exact pixel coordinates: backgrounds and
 * block elements as rectangles, **box-drawing as vector strokes** (so borders
 * are pixel-perfect and font-independent), and text glyphs centered in their
 * cell. The 2-D context is requested with `desynchronized` so the browser uses
 * its low-latency GPU-composited path; the same draw calls also work on an
 * OffscreenCanvas in a worker.
 *
 * This module is fully browser-safe — it has no Node/`sharp`/registry imports,
 * so it bundles cleanly for the canvas client. Flattening a `ScreenBuffer` into
 * `CanvasCell[][]` (which *does* need the icon registry) lives server-side in
 * `canvas-serialize.ts`.
 */

/** A cell flattened to the data a canvas needs — JSON-serializable for the wire. */
export interface CanvasCell {
  c: string;
  /** Foreground CSS color (already normalized), or undefined for the default. */
  fg?: string;
  /** Background CSS color (already normalized), or undefined for the default. */
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Underline shape; absent means single. */
  uStyle?: "double" | "curly" | "dotted" | "dashed";
  /** Underline CSS color, independent of fg. */
  uColor?: string;
  strike?: boolean;
  /** Continuation cell of a wide glyph to its left — skipped when drawing. */
  cont?: boolean;
  /** Seti file-icon glyph — centered vertically rather than sitting on the baseline. */
  icon?: boolean;
  /**
   * Raw SVG markup for a vector icon (heroicon, Seti file icon, …). When present
   * the canvas draws the SVG natively — the browser rasterizes it crisply at the
   * device pixel ratio — instead of the `c` text fallback. `currentColor` in the
   * markup is tinted to the cell's `fg` at draw time.
   */
  svg?: string;
  /**
   * A ready-to-draw image source (a `data:` URI for an `Image`/`SvgImage` widget,
   * either an encoded PNG or an SVG). Drawn as-is (not tinted) across the cell
   * span {@link gw}×{@link gh}. The lead cell of a multi-cell graphic.
   */
  img?: string;
  /** Graphic cell span in cells (width / height), for {@link img}. */
  gw?: number;
  gh?: number;
}

export interface CanvasMetrics {
  cellWidth: number;
  cellHeight: number;
  /**
   * Baseline offset from the cell top, in px. Measured from the full-block glyph
   * `█` (which fills the cell), so text sits on the font's true baseline rather
   * than a guessed line-height ratio. See {@link measureCellFromBlock}.
   */
  baseline: number;
}

/**
 * Derive the cell box and text baseline from the font itself by measuring the
 * full-block glyph `█` (it fills the em, so its ink bounds *are* the cell). Use
 * this to drive all render coordinates instead of a fixed line-height ratio.
 */
export function measureCellFromBlock(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  fontSize: number,
  fontFamily: string,
): CanvasMetrics {
  ctx.font = `${fontSize}px ${fontFamily}`;
  const m = ctx.measureText("█");
  const ascent = m.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = m.actualBoundingBoxDescent || fontSize * 0.2;
  return {
    cellWidth: m.width || fontSize * 0.6,
    cellHeight: Math.round(ascent + descent) || Math.round(fontSize * 1.2),
    baseline: ascent,
  };
}

export interface CanvasRenderOptions {
  /** Font size in px (glyphs are drawn at this size, centered in the cell). */
  fontSize: number;
  /** CSS font-family stack. */
  fontFamily: string;
  /** Default foreground/background when a cell doesn't override them. */
  defaultFg?: string;
  defaultBg?: string;
  /** Device pixel ratio the context is already scaled by (for crisp strokes). */
  dpr?: number;
  /**
   * Called when an async-loaded vector icon finishes decoding, so the caller can
   * repaint the last frame (the SVG wasn't ready on the first draw). Omit on
   * non-browser callers (tests) — SVG cells are simply skipped there.
   */
  requestRepaint?: () => void;
}

// Decoded vector-icon cache, keyed by the tinted SVG markup. Lives module-level
// so it survives across frames; entries are cheap (one <img> per distinct icon).
const svgImageCache = new Map<string, HTMLImageElement>();

/**
 * Draw a vector icon into a cell box, rasterized natively by the browser. The
 * SVG is tinted (`currentColor` → `color`) and decoded once, cached by markup.
 * If it isn't decoded yet, kick off the load and ask the caller to repaint when
 * it lands. No-ops in non-DOM environments (no `Image`).
 */
function drawSvgCell(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  svg: string,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
  requestRepaint?: () => void,
): void {
  if (typeof Image === "undefined") return;
  const tinted = svg.replace(/currentColor/g, color);
  let img = svgImageCache.get(tinted);
  if (!img) {
    img = new Image();
    img.onload = () => requestRepaint?.();
    img.src = `data:image/svg+xml,${encodeURIComponent(tinted)}`;
    svgImageCache.set(tinted, img);
  }
  if (img.complete && img.naturalWidth > 0) {
    // Center a square (icons are square) within the cell box.
    const size = Math.min(w, h);
    (ctx as CanvasRenderingContext2D).drawImage(
      img,
      x + (w - size) / 2,
      y + (h - size) / 2,
      size,
      size,
    );
  }
}

/**
 * Draw an `Image`/`SvgImage` graphic to fill its cell-span box (decoded natively
 * by the browser). Unlike {@link drawSvgCell} the source is used as-is — no
 * tint — and it fills the box rather than centering a square. Cached by URI.
 */
function drawImageCell(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  src: string,
  x: number,
  y: number,
  w: number,
  h: number,
  requestRepaint?: () => void,
): void {
  if (typeof Image === "undefined") return;
  let img = svgImageCache.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => requestRepaint?.();
    img.src = src;
    svgImageCache.set(src, img);
  }
  if (img.complete && img.naturalWidth > 0) {
    const c = ctx as CanvasRenderingContext2D;
    const prevSmoothing = c.imageSmoothingEnabled;
    c.imageSmoothingEnabled = true; // smooth scaling for photos/illustrations
    c.drawImage(img, x, y, w, h);
    c.imageSmoothingEnabled = prevSmoothing;
  }
}

const DEFAULT_FG = "#cdd6f4";
const DEFAULT_BG = "#1e1e2e";

// --- block elements (U+2580–U+259F) as fractional rectangles -----------------

interface BlockRect {
  /** x, y, w, h as fractions of the cell (0..1). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fill alpha (shades). */
  a?: number;
}
const BLOCK_RECTS: Record<string, BlockRect> = {
  "█": { x: 0, y: 0, w: 1, h: 1 },
  "▓": { x: 0, y: 0, w: 1, h: 1, a: 0.75 },
  "▒": { x: 0, y: 0, w: 1, h: 1, a: 0.5 },
  "░": { x: 0, y: 0, w: 1, h: 1, a: 0.35 },
  "▀": { x: 0, y: 0, w: 1, h: 0.5 },
  "▄": { x: 0, y: 0.5, w: 1, h: 0.5 },
  "▌": { x: 0, y: 0, w: 0.5, h: 1 },
  "▐": { x: 0.5, y: 0, w: 0.5, h: 1 },
};
"▁▂▃▄▅▆▇".split("").forEach((ch, i) => {
  const h = (i + 1) / 8;
  BLOCK_RECTS[ch] = { x: 0, y: 1 - h, w: 1, h };
});
"▏▎▍▋▊▉".split("").forEach((ch, i) => {
  const w = [1, 2, 3, 5, 6, 7][i] / 8;
  BLOCK_RECTS[ch] = { x: 0, y: 0, w, h: 1 };
});

// --- box-drawing (U+2500–U+257F) as vector arms ------------------------------

interface BoxDef {
  /** Arms from the cell center: north/east/south/west. */
  n?: boolean;
  e?: boolean;
  s?: boolean;
  w?: boolean;
  rounded?: boolean;
  double?: boolean;
  dash?: "dashed" | "dotted";
}
const BOX: Record<string, BoxDef> = {
  "─": { e: true, w: true },
  "│": { n: true, s: true },
  "┌": { e: true, s: true },
  "┐": { w: true, s: true },
  "└": { e: true, n: true },
  "┘": { w: true, n: true },
  "├": { n: true, s: true, e: true },
  "┤": { n: true, s: true, w: true },
  "┬": { e: true, w: true, s: true },
  "┴": { e: true, w: true, n: true },
  "┼": { n: true, e: true, s: true, w: true },
  "╭": { e: true, s: true, rounded: true },
  "╮": { w: true, s: true, rounded: true },
  "╰": { e: true, n: true, rounded: true },
  "╯": { w: true, n: true, rounded: true },
  "═": { e: true, w: true, double: true },
  "║": { n: true, s: true, double: true },
  "╔": { e: true, s: true, double: true },
  "╗": { w: true, s: true, double: true },
  "╚": { e: true, n: true, double: true },
  "╝": { w: true, n: true, double: true },
  "╌": { e: true, w: true, dash: "dashed" },
  "╍": { e: true, w: true, dash: "dashed" },
  "┄": { e: true, w: true, dash: "dashed" },
  "┈": { e: true, w: true, dash: "dotted" },
  "┆": { n: true, s: true, dash: "dashed" },
  "┊": { n: true, s: true, dash: "dotted" },
  "╎": { n: true, s: true, dash: "dotted" },
};

function strokeArms(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  d: BoxDef,
  x0: number,
  y0: number,
  cw: number,
  ch: number,
  t: number,
  offset: number,
): void {
  // Snap the center line to a crisp half-pixel for 1px strokes.
  const cx = Math.round(x0 + cw / 2) + offset + (t % 2 ? 0.5 : 0);
  const cy = Math.round(y0 + ch / 2) + offset + (t % 2 ? 0.5 : 0);
  const r = Math.min(cw, ch) / 2;
  ctx.beginPath();
  if (d.rounded && !d.n && d.e && d.s) {
    // ╭ : east + south, rounded
    ctx.moveTo(x0 + cw, cy);
    ctx.arcTo(cx, cy, cx, y0 + ch, r);
    ctx.lineTo(cx, y0 + ch);
  } else if (d.rounded && !d.n && d.w && d.s) {
    // ╮ : west + south
    ctx.moveTo(x0, cy);
    ctx.arcTo(cx, cy, cx, y0 + ch, r);
    ctx.lineTo(cx, y0 + ch);
  } else if (d.rounded && d.n && d.e && !d.s) {
    // ╰ : east + north
    ctx.moveTo(x0 + cw, cy);
    ctx.arcTo(cx, cy, cx, y0, r);
    ctx.lineTo(cx, y0);
  } else if (d.rounded && d.n && d.w && !d.s) {
    // ╯ : west + north
    ctx.moveTo(x0, cy);
    ctx.arcTo(cx, cy, cx, y0, r);
    ctx.lineTo(cx, y0);
  } else {
    if (d.n) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, y0);
    }
    if (d.s) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, y0 + ch);
    }
    if (d.e) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(x0 + cw, cy);
    }
    if (d.w) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(x0, cy);
    }
  }
  ctx.stroke();
}

/**
 * Paint a buffer (already flattened via {@link serializeForCanvas}) into a 2-D
 * canvas context, assuming the context is scaled to CSS pixels.
 */
export function renderBufferToCanvas(
  cells: CanvasCell[][],
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  metrics: CanvasMetrics,
  opts: CanvasRenderOptions,
): void {
  const { cellWidth: cw, cellHeight: ch } = metrics;
  const rows = cells.length;
  const cols = rows > 0 ? cells[0].length : 0;
  const defaultFg = opts.defaultFg ?? DEFAULT_FG;
  const defaultBg = opts.defaultBg ?? DEFAULT_BG;
  const t = Math.max(1, Math.round(opts.fontSize / 14));

  // Snap every column/row boundary to a device pixel so adjacent fills share an
  // exact edge. Without this, a fractional cell width (e.g. 7.225px) leaves the
  // abutting rects' anti-aliased edges short of full coverage, and the
  // background bleeds through as a ~1px seam (visible between progress-bar/
  // scrollbar blocks). Shared snapped boundaries make the fills tile perfectly.
  const dpr = opts.dpr ?? 1;
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  const colX: number[] = new Array(cols + 1);
  for (let x = 0; x <= cols; x++) colX[x] = snap(x * cw);
  const rowY: number[] = new Array(rows + 1);
  for (let y = 0; y <= rows; y++) rowY[y] = snap(y * ch);

  // Clear to the default background.
  ctx.fillStyle = defaultBg;
  ctx.fillRect(0, 0, colX[cols], rowY[rows]);

  // Pass 1: background fills (runs of equal color collapse into one rect).
  for (let y = 0; y < rows; y++) {
    let runBg = "";
    let runStart = 0;
    const flush = (end: number) => {
      if (runBg && end > runStart) {
        ctx.fillStyle = runBg;
        ctx.fillRect(colX[runStart], rowY[y], colX[end] - colX[runStart], rowY[y + 1] - rowY[y]);
      }
    };
    for (let x = 0; x < cols; x++) {
      const bg = cells[y][x].bg ?? "";
      if (bg !== runBg) {
        flush(x);
        runBg = bg;
        runStart = x;
      }
    }
    flush(cols);
  }

  // Pass 2: glyphs, box-drawing, block elements. Text sits on the font baseline
  // measured from the block glyph, so every cell lands on the same baseline.
  const baseline = metrics.baseline;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  for (let y = 0; y < rows; y++) {
    const cy = y * ch;
    for (let x = 0; x < cols; x++) {
      const cell = cells[y][x];
      if (cell.cont) continue;

      // Image/SvgImage graphic: fill its cell-span box. Checked before the
      // empty-cell skip because the lead cell's glyph is a space.
      if (cell.img) {
        const gw = cell.gw ?? 1;
        const gh = cell.gh ?? 1;
        drawImageCell(
          ctx,
          cell.img,
          colX[x],
          rowY[y],
          colX[Math.min(cols, x + gw)] - colX[x],
          rowY[Math.min(rows, y + gh)] - rowY[y],
          opts.requestRepaint,
        );
        continue;
      }

      if (cell.c === "" || cell.c === " ") continue;
      const color = cell.fg ?? defaultFg;
      const x0 = x * cw;

      const block = BLOCK_RECTS[cell.c];
      if (block) {
        // Fill within the snapped cell box so abutting blocks tile seamlessly.
        const cl = colX[x];
        const cwS = colX[x + 1] - cl;
        const ct = rowY[y];
        const chS = rowY[y + 1] - ct;
        ctx.globalAlpha = block.a ?? 1;
        ctx.fillStyle = color;
        ctx.fillRect(cl + block.x * cwS, ct + block.y * chS, block.w * cwS, block.h * chS);
        ctx.globalAlpha = 1;
        continue;
      }

      const box = BOX[cell.c];
      if (box) {
        ctx.strokeStyle = color;
        ctx.lineWidth = t;
        ctx.setLineDash(
          box.dash === "dotted" ? [t, t] : box.dash === "dashed" ? [t * 3, t * 2] : [],
        );
        if (box.double) {
          // Two parallel strokes for double-line glyphs.
          strokeArms(ctx, box, x0, cy, cw, ch, t, -t);
          strokeArms(ctx, box, x0, cy, cw, ch, t, t);
        } else {
          strokeArms(ctx, box, x0, cy, cw, ch, t, 0);
        }
        ctx.setLineDash([]);
        continue;
      }

      // A wide glyph spans this cell plus the continuation to its right.
      const wide = x + 1 < cols && cells[y][x + 1]?.cont;
      const span = wide ? 2 : 1;

      // Vector icons render natively from their SVG (crisp at DPR), tinted to fg.
      if (cell.svg) {
        drawSvgCell(
          ctx,
          cell.svg,
          color,
          colX[x],
          rowY[y],
          colX[x + span] - colX[x],
          rowY[y + 1] - rowY[y],
          opts.requestRepaint,
        );
        continue;
      }

      ctx.font = `${cell.italic ? "italic " : ""}${cell.bold ? "bold " : ""}${opts.fontSize}px ${opts.fontFamily}`;
      ctx.fillStyle = color;
      if (cell.icon) {
        // Seti glyphs are pictographs that sit high in an oversized em, so the
        // baseline (and even the em's middle) floats them to the cell's top.
        // Measure the real ink box and center *that* in the cell instead.
        const m = ctx.measureText(cell.c);
        const inkAscent = m.actualBoundingBoxAscent || 0;
        const inkDescent = m.actualBoundingBoxDescent || 0;
        const yBaseline = cy + ch / 2 + (inkAscent - inkDescent) / 2;
        ctx.fillText(cell.c, x0 + (span * cw) / 2, yBaseline);
      } else {
        ctx.fillText(cell.c, x0 + (span * cw) / 2, cy + baseline);
      }
      if (cell.strike) {
        ctx.strokeStyle = color;
        ctx.lineWidth = t;
        const yy = cy + Math.round(baseline * 0.7);
        ctx.beginPath();
        ctx.moveTo(x0, yy + 0.5);
        ctx.lineTo(x0 + span * cw, yy + 0.5);
        ctx.stroke();
      }
      if (cell.underline) {
        const x1 = x0 + span * cw;
        const yy = cy + ch - t;
        ctx.strokeStyle = cell.uColor ?? color;
        ctx.lineWidth = t;
        ctx.setLineDash([]);
        ctx.beginPath();
        if (cell.uStyle === "curly") {
          // Undercurl: a half-cell-period sine ridge, the conventional squiggle.
          const amp = Math.max(1, t);
          const period = Math.max(4, cw / 2);
          const mid = yy - amp / 2;
          for (let px = x0; px <= x1; px++) {
            const yv = mid + (amp / 2) * Math.sin(((px - x0) / period) * Math.PI * 2);
            if (px === x0) ctx.moveTo(px, yv);
            else ctx.lineTo(px, yv);
          }
        } else if (cell.uStyle === "double") {
          ctx.moveTo(x0, yy - t);
          ctx.lineTo(x1, yy - t);
          ctx.moveTo(x0, yy + t + 0.5);
          ctx.lineTo(x1, yy + t + 0.5);
        } else {
          if (cell.uStyle === "dotted") ctx.setLineDash([t, t]);
          else if (cell.uStyle === "dashed") ctx.setLineDash([cw / 3, cw / 4]);
          ctx.moveTo(x0, yy + 0.5);
          ctx.lineTo(x1, yy + 0.5);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}
