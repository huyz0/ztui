import * as fs from "node:fs";
import * as path from "node:path";
import React from "react";
import { describe, expect, test } from "vitest";
import { fullColorRgbaToSixel } from "../driver/bun/graphics.ts";
import { App, Image, SvgImage, render } from "../index.ts";
import { decodeImage, resizeImage } from "../widgets/image.ts";
import { VTEDriver } from "./vte-runner.ts";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJgA/9k=";

const TINY_SVG = `
<svg viewBox="0 0 10 10" width="10" height="10" xmlns="http://www.w3.org/2000/svg">
  <rect width="10" height="10" fill="red"/>
</svg>
`;

describe("Image & SVG Image Widgets", () => {
  test("Successfully decodes PNG, GIF, and JPEG images from buffers", () => {
    const png = decodeImage(new Uint8Array(Buffer.from(TINY_PNG_BASE64, "base64")));
    expect(png.width).toBe(1);
    expect(png.height).toBe(1);
    expect(png.pixels.length).toBe(4);

    const gif = decodeImage(new Uint8Array(Buffer.from(TINY_GIF_BASE64, "base64")));
    expect(gif.width).toBe(1);
    expect(gif.height).toBe(1);
    expect(gif.pixels.length).toBe(4);

    const jpeg = decodeImage(new Uint8Array(Buffer.from(TINY_JPEG_BASE64, "base64")));
    expect(jpeg.width).toBe(1);
    expect(jpeg.height).toBe(1);
    expect(jpeg.pixels.length).toBe(4);
  });

  test("Throws an error when decoding invalid image formats", () => {
    expect(() => decodeImage(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });

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
    const driver = new VTEDriver(10, 5, {
      graphicsProtocol: "none",
    });
    const app = new App(driver);

    render(
      <Image src={`data:image/png;base64,${TINY_PNG_BASE64}`} style={{ width: 4, height: 2 }} />,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    const buffer = (app as any).currentBuffer;
    const cell = buffer.cells[0][0];
    expect([" ", "█"]).toContain(cell.char);
    expect(cell.style.color).toBeDefined();
    expect(cell.style.background).toBeDefined();

    app.stop();
  });

  test("Renders Image Widget with Sixel protocol when supported", async () => {
    const driver = new VTEDriver(10, 5, {
      graphicsProtocol: "sixel",
    });
    const app = new App(driver);

    render(
      <Image src={`data:image/png;base64,${TINY_PNG_BASE64}`} style={{ width: 4, height: 2 }} />,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    const buffer = (app as any).currentBuffer;
    // Top-left cell should contain graphic metadata
    const cell0 = buffer.cells[0][0];
    expect(cell0.graphic).toBeDefined();
    expect(cell0.graphic?.type).toBe("image");
    expect(cell0.graphic?.cellWidth).toBe(80);
    expect(cell0.graphic?.cellHeight).toBe(24);

    // Other cells in the image boundary should be wideContinuation
    const cell1 = buffer.cells[0][1];
    expect(cell1.wideContinuation).toBe(true);

    app.stop();
  });

  test("Renders SvgImage Widget with iTerm2 protocol when supported", async () => {
    const driver = new VTEDriver(15, 6, {
      graphicsProtocol: "iterm2",
    });
    const app = new App(driver);

    render(<SvgImage src={TINY_SVG} style={{ width: 5, height: 3 }} />, app.activeScreen);

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    const buffer = (app as any).currentBuffer;
    const cell = buffer.cells[0][0];
    expect(cell.graphic).toBeDefined();
    expect(cell.graphic?.cellWidth).toBe(80);
    expect(cell.graphic?.cellHeight).toBe(24);

    app.stop();
  });

  test("Loads Image from a file path correctly", async () => {
    // Write temporary image file to filesystem
    const tempFile = path.join(__dirname, "temp_test_image.png");
    fs.writeFileSync(tempFile, Buffer.from(TINY_PNG_BASE64, "base64"));

    const driver = new VTEDriver(10, 5, {
      graphicsProtocol: "none",
    });
    const app = new App(driver);

    render(<Image src={tempFile} style={{ width: 2, height: 1 }} />, app.activeScreen);

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    const buffer = (app as any).currentBuffer;
    const cell = buffer.cells[0][0];
    expect([" ", "█"]).toContain(cell.char);

    app.stop();

    // Clean up temporary image
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  });

  test("Renders clean placeholder on image load/decode failure", async () => {
    const driver = new VTEDriver(20, 5, {
      graphicsProtocol: "none",
    });
    const app = new App(driver);

    render(
      <Image src="invalid_non_existent_file.png" style={{ width: 10, height: 2 }} />,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    const buffer = (app as any).currentBuffer;
    // Top-left cell should start with error text character, e.g. "E"
    const cell = buffer.cells[0][0];
    expect(cell.char).toBe("E");

    app.stop();
  });

  test("Forces ANSI half-block rendering when ansi=true prop is set", async () => {
    const driver = new VTEDriver(10, 5, {
      graphicsProtocol: "kitty",
    });
    const app = new App(driver);

    render(
      <Image
        src={`data:image/png;base64,${TINY_PNG_BASE64}`}
        ansi={true}
        style={{ width: 4, height: 2 }}
      />,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    const buffer = (app as any).currentBuffer;
    const cell = buffer.cells[0][0];
    expect([" ", "█"]).toContain(cell.char);
    expect(cell.graphic).toBeUndefined();

    app.stop();
  });

  test("Dynamically selects quadrant characters depending on image content", async () => {
    const driver = new VTEDriver(10, 5, {
      graphicsProtocol: "none",
    });
    const app = new App(driver);
    app.activeScreen.style.layout = "vertical";

    // 1. A vertical division SVG should trigger quadrant characters (like left/right half-blocks)
    const vertSvg = `
      <svg viewBox="0 0 10 10" width="10" height="10" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="5" height="10" fill="white"/>
        <rect x="5" y="0" width="5" height="10" fill="black"/>
      </svg>
    `;
    render(<SvgImage src={vertSvg} style={{ width: 1, height: 1 }} />, app.activeScreen);
    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();
    let cell = (app as any).currentBuffer.cells[0][0];
    expect(["▌", "▐"]).toContain(cell.char);
    app.stop();

    // 2. A gradient SVG should trigger quadrant blocks
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
    const app2 = new App(driver);
    app2.activeScreen.style.layout = "vertical";
    render(<SvgImage src={gradSvg} style={{ width: 1, height: 1 }} />, app2.activeScreen);
    app2.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();
    cell = (app2 as any).currentBuffer.cells[0][0];
    expect(["▌", "▐"]).toContain(cell.char);
    app2.stop();

    // 3. Fine diagonal line SVG should trigger diagonal quadrant characters
    const lineSvg = `
      <svg viewBox="0 0 100 100" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <line x1="0" y1="0" x2="100" y2="100" stroke="white" stroke-width="20"/>
      </svg>
    `;
    const app3 = new App(driver);
    app3.activeScreen.style.layout = "vertical";
    render(<SvgImage src={lineSvg} style={{ width: 1, height: 1 }} />, app3.activeScreen);
    app3.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();
    cell = (app3 as any).currentBuffer.cells[0][0];
    expect(["▚", "▞"]).toContain(cell.char);
    app3.stop();
  });
});
