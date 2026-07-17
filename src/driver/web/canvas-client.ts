import { type CanvasCell, measureCellFromBlock, renderBufferToCanvas } from "./canvas-renderer.ts";

/**
 * Browser entry for the canvas backend, bundled for the page by
 * {@link canvasClientScript}. It exposes `window.ztuiCanvas.create(...)`, which
 * builds a hardware-accelerated `<canvas>` (the 2-D context is requested with
 * `desynchronized: true` for the low-latency GPU-composited path) and returns a
 * handle with the measured cell metrics, a `resize`, and a `render(cells)`.
 *
 * Input wiring is left to the caller (the live demo posts events to its server;
 * the inspector dispatches in-process), so this entry only owns pixels.
 */

export interface CanvasHandle {
  canvas: HTMLCanvasElement;
  cellWidth: number;
  cellHeight: number;
  resize: (cols: number, rows: number) => void;
  render: (cells: CanvasCell[][]) => void;
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
  create(host, fontSize, fontFamily, padding, defaultBg = "#1e1e2e") {
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
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
    let cols = 0;

    const resize = (c: number, r: number) => {
      cols = c;
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
    let lastCells: CanvasCell[][] = [];
    const render = (cells: CanvasCell[][]) => {
      lastCells = cells;
      // Re-check the shape on every call, not just when the canvas has never
      // been sized — a `resize()` call racing an in-flight `render(cells)`
      // carrying the old grid shape would otherwise paint through a
      // transform sized for stale dimensions.
      const r = cells.length;
      const c = cells[0]?.length ?? 0;
      if (r > 0 && (r !== rows || c !== cols)) resize(c, r);
      renderBufferToCanvas(cells, ctx, metrics, {
        fontSize,
        fontFamily,
        dpr,
        defaultBg,
        requestRepaint: () =>
          renderBufferToCanvas(lastCells, ctx, metrics, { fontSize, fontFamily, dpr, defaultBg }),
      });
    };

    return { canvas, cellWidth, cellHeight, resize, render };
  },
};
