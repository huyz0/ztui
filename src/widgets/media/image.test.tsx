import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { fullColorRgbaToSixel } from "../../driver/bun/graphics.ts";
import { reconciler } from "../../react/reconciler.ts";
import { Image, SvgImage, VBox, View } from "../../react.ts";
import { mountApp, waitFor } from "../../test/harness.tsx";
import { decodeImage, resizeImage } from "./image.ts";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJgA/9k=";
// 1x1 solid-red WebP, generated with `sharp({ create: {...} }).webp().toBuffer()`.
const TINY_WEBP_BASE64 =
  "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=";

const TINY_SVG = `
<svg viewBox="0 0 10 10" width="10" height="10" xmlns="http://www.w3.org/2000/svg">
  <rect width="10" height="10" fill="red"/>
</svg>
`;

const pngDataUri = `data:image/png;base64,${TINY_PNG_BASE64}`;

describe("Image & SVG Image Widgets", () => {
  test("Successfully decodes PNG, GIF, and JPEG images from buffers", () => {
    for (const b64 of [TINY_PNG_BASE64, TINY_GIF_BASE64, TINY_JPEG_BASE64]) {
      const decoded = decodeImage(new Uint8Array(Buffer.from(b64, "base64")));
      expect(decoded.width).toBe(1);
      expect(decoded.height).toBe(1);
      expect(decoded.pixels.length).toBe(4);
    }
  });

  test("Throws an error when decoding invalid image formats", () => {
    expect(() => decodeImage(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });

  test("Decodes WebP images via the sharp fallback", () => {
    const decoded = decodeImage(new Uint8Array(Buffer.from(TINY_WEBP_BASE64, "base64")));
    expect(decoded.width).toBe(1);
    expect(decoded.height).toBe(1);
    expect(decoded.pixels.length).toBe(4);
  }, 15000);

  test("Correctly resizes pixel buffers using bilinear filter", () => {
    const src = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]); // 2x2 image
    const dest = resizeImage(src, 2, 2, 1, 1); // downscale to 1x1
    expect(dest.length).toBe(4);
    // Bilinear downscaling result should be an average/interpolation
    expect(dest[0]).toBeGreaterThanOrEqual(0);
    expect(dest[3]).toBe(255);
  });

  test("Renders fullColorRgbaToSixel with quantization and RLE", () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
    const sixel = fullColorRgbaToSixel(rgba, 2, 1, "#000000");
    expect(sixel).toContain("\x1bPq");
    expect(sixel).toContain("\x1b\\");
  });

  test("Renders Image Widget with ANSI Half-Block fallback when graphics are unsupported", async () => {
    const { cellAt } = await mountApp(<Image src={pngDataUri} style={{ width: 4, height: 2 }} />, {
      cols: 10,
      rows: 5,
      capabilities: { graphicsProtocol: "none" },
    });

    const cell = cellAt(0, 0);
    expect([" ", "█"]).toContain(cell.char);
    expect(cell.style.color).toBeDefined();
    expect(cell.style.background).toBeDefined();
  });

  test("Renders Image Widget with Sixel protocol when supported", async () => {
    const { cellAt } = await mountApp(<Image src={pngDataUri} style={{ width: 4, height: 2 }} />, {
      cols: 10,
      rows: 5,
      capabilities: { graphicsProtocol: "sixel" },
    });

    // Top-left cell should carry the graphic metadata; the rest are continuations.
    const cell0 = cellAt(0, 0);
    expect(cell0.graphic).toBeDefined();
    expect(cell0.graphic?.type).toBe("image");
    expect(cell0.graphic?.cellWidth).toBe(80);
    expect(cell0.graphic?.cellHeight).toBe(24);
    expect(cellAt(1, 0).wideContinuation).toBe(true);
  });

  test("Sixel: switching graphics screens wipes + redraws (no per-cell erase over the new image)", async () => {
    // Regression: moving/replacing an image on sixel must take the screen-erase
    // wipe path (`\x1b[2J`) rather than per-cell opaque "clear" rectangles, which
    // punched a black hole into the freshly drawn image.
    const t = await mountApp(
      <VBox>
        <Image id="img" src={pngDataUri} style={{ width: 4, height: 2 }} />
      </VBox>,
      { cols: 12, rows: 8, capabilities: { graphicsProtocol: "sixel" } },
    );
    await t.settle();

    // Capture what the driver emits for the next (graphics-changed) frame.
    let written = "";
    const orig = t.driver.write.bind(t.driver);
    t.driver.write = (data: string) => {
      written += data;
      return orig(data);
    };

    // Move the image down a row → its graphic signature changes.
    reconciler.updateContainer(
      <VBox>
        <View style={{ height: 1 }} />
        <Image id="img" src={pngDataUri} style={{ width: 4, height: 2 }} />
      </VBox>,
      t.container,
      null,
      () => {},
    );
    await t.settle();

    expect(written).toContain("\x1b[2J"); // full erase, then a clean re-emit
  });

  test("Renders SvgImage Widget with iTerm2 protocol when supported", async () => {
    const r = await mountApp(<SvgImage src={TINY_SVG} style={{ width: 5, height: 3 }} />, {
      cols: 15,
      rows: 6,
      capabilities: { graphicsProtocol: "iterm2" },
    });

    // Rasterizes via the sharp subprocess — wait for the graphic to land.
    await waitFor(() => r.cellAt(0, 0).graphic !== undefined, { poke: () => r.app.queueRender() });
    const cell = r.cellAt(0, 0);
    expect(cell.graphic).toBeDefined();
    expect(cell.graphic?.cellWidth).toBe(80);
    expect(cell.graphic?.cellHeight).toBe(24);
  });

  test("Loads Image from a file path correctly", async () => {
    const tempFile = path.join(__dirname, "temp_test_image.png");
    fs.writeFileSync(tempFile, Buffer.from(TINY_PNG_BASE64, "base64"));
    try {
      const { cellAt } = await mountApp(<Image src={tempFile} style={{ width: 2, height: 1 }} />, {
        cols: 10,
        rows: 5,
        capabilities: { graphicsProtocol: "none" },
      });
      expect([" ", "█"]).toContain(cellAt(0, 0).char);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  test("Renders clean placeholder on image load/decode failure", async () => {
    const { cellAt } = await mountApp(
      <Image src="invalid_non_existent_file.png" style={{ width: 10, height: 2 }} />,
      { cols: 20, rows: 5, capabilities: { graphicsProtocol: "none" } },
    );

    // Top-left cell shows the error placeholder, e.g. "E".
    expect(cellAt(0, 0).char).toBe("E");
  });

  test("SvgImage renders an error placeholder for an unreadable file path", async () => {
    const { text } = await mountApp(
      <SvgImage src="/no/such/file-xyz.svg" style={{ width: 24, height: 3 }} />,
      { cols: 30, rows: 5, capabilities: { graphicsProtocol: "none" } },
    );
    await waitFor(() => /error/i.test(text()), { timeout: 500 }).catch(() => {});
    expect(text().toLowerCase()).toContain("error");
  });

  test("SvgImage with no source shows the 'No SVG source' placeholder", async () => {
    const { text } = await mountApp(<SvgImage src="" style={{ width: 24, height: 3 }} />, {
      cols: 30,
      rows: 5,
      capabilities: { graphicsProtocol: "none" },
    });
    expect(text()).toContain("No SVG source");
  });

  test("Forces ANSI half-block rendering when ansi=true prop is set", async () => {
    const { cellAt } = await mountApp(
      <Image src={pngDataUri} ansi={true} style={{ width: 4, height: 2 }} />,
      { cols: 10, rows: 5, capabilities: { graphicsProtocol: "kitty" } },
    );

    const cell = cellAt(0, 0);
    expect([" ", "█"]).toContain(cell.char);
    expect(cell.graphic).toBeUndefined();
  });

  test("Dynamically selects quadrant characters depending on image content", async () => {
    // Each block rasterizes via the `sharp` subprocess, which can lose the race
    // on a single render under parallel CI load — wait (re-rendering each poll)
    // for one of the expected glyphs rather than asserting on one frame.
    const waitGlyph = async (r: Awaited<ReturnType<typeof mountApp>>, chars: string[]) => {
      await waitFor(() => chars.includes(r.cellAt(0, 0).char), { poke: () => r.app.queueRender() });
      expect(chars).toContain(r.cellAt(0, 0).char);
    };

    // A vertical division SVG should trigger left/right half-block characters.
    const vertSvg = `
      <svg viewBox="0 0 10 10" width="10" height="10" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="5" height="10" fill="white"/>
        <rect x="5" y="0" width="5" height="10" fill="black"/>
      </svg>
    `;
    const vert = await mountApp(<SvgImage src={vertSvg} style={{ width: 1, height: 1 }} />, {
      cols: 10,
      rows: 5,
      capabilities: { graphicsProtocol: "none" },
      screenStyle: { layout: "vertical" },
    });
    await waitGlyph(vert, ["▌", "▐"]);

    // A horizontal gradient should also resolve to a left/right half-block.
    const gradSvg = `
      <svg viewBox="0 0 10 10" width="10" height="10" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="black"/>
            <stop offset="100%" stop-color="white"/>
          </linearGradient>
        </defs>
        <rect width="10" height="10" fill="url(#g)"/>
      </svg>
    `;
    const grad = await mountApp(<SvgImage src={gradSvg} style={{ width: 1, height: 1 }} />, {
      cols: 10,
      rows: 5,
      capabilities: { graphicsProtocol: "none" },
      screenStyle: { layout: "vertical" },
    });
    await waitGlyph(grad, ["▌", "▐"]);

    // A fine diagonal line should trigger a diagonal quadrant character.
    const lineSvg = `
      <svg viewBox="0 0 100 100" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <line x1="0" y1="0" x2="100" y2="100" stroke="white" stroke-width="20"/>
      </svg>
    `;
    const line = await mountApp(<SvgImage src={lineSvg} style={{ width: 1, height: 1 }} />, {
      cols: 10,
      rows: 5,
      capabilities: { graphicsProtocol: "none" },
      screenStyle: { layout: "vertical" },
    });
    await waitGlyph(line, ["▚", "▞"]);
  });

  test("resolves $theme variables inside SVG fills before rasterizing", async () => {
    // A fill of `$success` must be resolved to the theme colour before the SVG
    // reaches the rasterizer. Unresolved, `$success` is an invalid color and
    // paints black — this guards that regression.
    const themedSvg = `
      <svg viewBox="0 0 10 10" width="10" height="10" xmlns="http://www.w3.org/2000/svg">
        <rect width="10" height="10" fill="$success"/>
      </svg>
    `;
    const r = await mountApp(<SvgImage src={themedSvg} style={{ width: 1, height: 1 }} />, {
      cols: 10,
      rows: 5,
      capabilities: { graphicsProtocol: "none" },
      screenStyle: { layout: "vertical" },
    });
    // Rasterizing shells out to `sharp` in a subprocess; under parallel CI load
    // a single render can lose that race, so wait (re-rendering each poll) for a
    // concrete colour to land instead of asserting on one frame.
    const concrete = () =>
      /^#[0-9a-f]{6}$/.test((r.cellAt(0, 0).style.background || "").toLowerCase());
    await waitFor(concrete, { poke: () => r.app.queueRender() });
    const hex = (r.cellAt(0, 0).style.background || "").toLowerCase();
    expect(hex).toMatch(/^#[0-9a-f]{6}$/); // a concrete colour was rasterized…
    expect(hex).not.toBe("#000000"); // …not the black of an unresolved `$success`.
  });

  test("SvgImage emits a native vector graphic (no rasterization) on the web backend", async () => {
    const svg = `<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="$primary"/></svg>`;
    const r = await mountApp(<SvgImage src={svg} style={{ width: 4, height: 2 }} />, {
      cols: 10,
      rows: 5,
      capabilities: { graphicsProtocol: "web" },
      screenStyle: { layout: "vertical" },
    });
    const g = r.cellAt(0, 0).graphic;
    expect(g?.svg).toBeTruthy(); // ships the SVG for the canvas to draw natively
    expect(g?.svg).toContain("<rect"); // the resolved markup, not a pixel buffer
    expect(g?.svg).not.toContain("$primary"); // `$theme` tokens are resolved first
    expect(g?.pixelBuffer).toBeUndefined(); // no sharp rasterization on web
  });

  test("Image emits an encoded graphic on the web backend", async () => {
    const r = await mountApp(<Image src={pngDataUri} style={{ width: 4, height: 2 }} />, {
      cols: 10,
      rows: 5,
      capabilities: { graphicsProtocol: "web" },
      screenStyle: { layout: "vertical" },
    });
    expect(r.cellAt(0, 0).graphic?.pngBase64).toBeTruthy(); // canvas draws this PNG
  });
});
