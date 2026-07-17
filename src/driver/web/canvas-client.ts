import {
  measureCellFromBlock,
  renderBufferToCanvas,
  type SerializedFrame,
} from "./canvas-renderer.ts";

/**
 * Browser entry for the canvas backend, bundled for the page by
 * {@link canvasClientScript}. It exposes `window.ztuiCanvas.create(...)`, which
 * builds a hardware-accelerated `<canvas>` (the 2-D context is requested with
 * `desynchronized: true` for the low-latency GPU-composited path) and returns a
 * handle with the measured cell metrics, a `resize`, and a `render(frame)`.
 *
 * Input wiring is left to the caller (the live demo posts events to its server;
 * the inspector dispatches in-process), so this entry only owns pixels.
 */

export interface CanvasHandle {
  canvas: HTMLCanvasElement;
  cellWidth: number;
  cellHeight: number;
  resize: (cols: number, rows: number) => void;
  render: (frame: SerializedFrame) => void;
}

declare global {
  interface Window {
    ztuiCanvas: {
      create(
        host: HTMLElement,
        fontSize: number,
        fontFamily: string,
        padding: number,
        defaultBg?: string,
      ): CanvasHandle;
    };
  }
}

window.ztuiCanvas = {
  create(host, fontSize, fontFamily, padding, defaultBg = "#202020") {
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    // Initial guess before the first real frame (which always carries the
    // active theme's true background via `render()`) arrives — the caller
    // may pass the theme's actual background computed at page-serve time to
    // avoid a flash of the wrong color.
    canvas.style.background = defaultBg;
    host.appendChild(canvas);

    const ctx = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    }) as CanvasRenderingContext2D;
    const font = (px: number) => `${px}px ${fontFamily}`;

    // Derive the cell box and baseline from the full-block glyph `█`.
    const metrics = measureCellFromBlock(ctx, fontSize, fontFamily);
    const { cellWidth, cellHeight } = metrics;
    // Re-read on every resize (not just captured once at create()) so
    // dragging the window to a different-DPI monitor, or a browser zoom
    // change, doesn't leave the backing store rendering at a stale ratio.
    let dpr = window.devicePixelRatio || 1;
    let rows = 0;

    const resize = (c: number, r: number) => {
      rows = r;
      dpr = window.devicePixelRatio || 1;
      const wpx = c * cellWidth + 2 * padding;
      const hpx = r * cellHeight + 2 * padding;
      canvas.style.width = `${wpx}px`;
      canvas.style.height = `${hpx}px`;
      canvas.width = Math.round(wpx * dpr);
      canvas.height = Math.round(hpx * dpr);
      // Map drawing units to CSS px, offset into the padding, and crisp text.
      ctx.setTransform(dpr, 0, 0, dpr, padding * dpr, padding * dpr);
      ctx.font = font(fontSize);
      ctx.imageSmoothingEnabled = false;
    };

    // Keep the last frame so a vector icon that finishes decoding after the
    // initial paint can be redrawn (drawImage no-ops until the SVG is ready).
    // Null until the first `render()` call — an icon can only start decoding
    // (and so call requestRepaint) after a real frame has already shipped it.
    let lastFrame: SerializedFrame | null = null;
    const render = (frame: SerializedFrame) => {
      lastFrame = frame;
      const { cells } = frame;
      // Bootstrap only: size the canvas from the first frame if the caller
      // never called `resize()` explicitly. Once sized, `resize()` is the
      // sole authority — re-deriving dimensions from every `cells` shape
      // here would fight a caller's own explicit resize (e.g. ahead of a
      // frame that hasn't caught up to the new size yet), causing a
      // visible resize-then-resize-back flash instead of one clean change.
      if (rows === 0 && cells.length) resize(cells[0]?.length ?? 0, cells.length);
      // The theme (and so its background) can change at runtime — keep the
      // canvas's own CSS background in sync, not just its drawn cells, so
      // the padding/letterboxed edges match too.
      if (frame.defaultBg !== canvas.style.background) canvas.style.background = frame.defaultBg;
      renderBufferToCanvas(cells, ctx, metrics, {
        fontSize,
        fontFamily,
        dpr,
        defaultFg: frame.defaultFg,
        defaultBg: frame.defaultBg,
        requestRepaint: () => {
          if (!lastFrame) return;
          renderBufferToCanvas(lastFrame.cells, ctx, metrics, {
            fontSize,
            fontFamily,
            dpr,
            defaultFg: lastFrame.defaultFg,
            defaultBg: lastFrame.defaultBg,
          });
        },
      });
    };

    return { canvas, cellWidth, cellHeight, resize, render };
  },
};
