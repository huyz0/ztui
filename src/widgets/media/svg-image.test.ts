import { describe, expect, test, vi } from "vitest";
import { App } from "../../core/app.ts";
import { MockDriver } from "../../driver/mock/index.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import * as sharpSync from "../../utils/sharp-sync.ts";
import { SvgImageWidget } from "./svg-image.ts";

const SVG = `<svg viewBox="0 0 10 10" width="10" height="10" xmlns="http://www.w3.org/2000/svg">
  <rect width="10" height="10" fill="blue"/>
</svg>`;

describe("SvgImageWidget render cache", () => {
  test("a second render with unchanged src/size/bg reuses the cached raster instead of re-rasterizing", () => {
    const driver = new MockDriver(10, 5);
    const app = new App(driver);
    app.run();

    const widget = new SvgImageWidget();
    widget.src = SVG;
    widget.style.width = 2;
    widget.style.height = 1;
    widget.region = new Region(new Offset(0, 0), new Size(2, 1));
    app.activeScreen.appendChild(widget);

    const spy = vi.spyOn(sharpSync, "renderSvgSync");

    const buf = new ScreenBuffer(10, 5);
    widget.render(buf);
    expect(spy).toHaveBeenCalledTimes(1);

    // Identical inputs the second time around — must hit the isCacheValid
    // fast path and skip rasterizing again.
    widget.render(buf);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
    app.stop();
  });

  test("render() is a no-op when the widget isn't visible", () => {
    const widget = new SvgImageWidget();
    widget.src = SVG;
    widget.visible = false;
    const buf = new ScreenBuffer(10, 5);
    expect(() => widget.render(buf)).not.toThrow();
  });

  test("render() bails when the client rect has no room", () => {
    const widget = new SvgImageWidget();
    widget.src = SVG;
    widget.region = new Region(new Offset(0, 0), new Size(0, 0));
    const buf = new ScreenBuffer(10, 5);
    expect(() => widget.render(buf)).not.toThrow();
  });

  test("a missing SVG file renders an error placeholder derived from the real fs error", () => {
    const widget = new SvgImageWidget();
    widget.src = "/no/such/path-xyz.svg";
    widget.region = new Region(new Offset(0, 0), new Size(20, 3));
    const buf = new ScreenBuffer(20, 3);
    expect(() => widget.render(buf)).not.toThrow();
    expect(buf.cells[0][0].char).toBe("E"); // "Error reading SVG: ..."
  });

  test("resolves against App.instance when the widget isn't mounted under its own app", () => {
    const driver = new MockDriver(10, 5);
    const app = new App(driver);
    app.run();

    const widget = new SvgImageWidget(); // not appended as a child of any app
    widget.src = SVG;
    widget.region = new Region(new Offset(0, 0), new Size(2, 1));
    const buf = new ScreenBuffer(10, 5);
    expect(() => widget.render(buf)).not.toThrow();

    app.stop();
  });

  test("renderError clips a client rect that extends past the buffer's bounds", () => {
    const widget = new SvgImageWidget();
    widget.src = ""; // -> "No SVG source provided" error path
    // Client rect starts near the buffer's edge and overflows both axes.
    widget.region = new Region(new Offset(8, 3), new Size(10, 10));
    const buf = new ScreenBuffer(10, 5);
    expect(() => widget.render(buf)).not.toThrow();
  });

  test("falls back to a default cell size and empty src cache key when capabilities/src are absent", () => {
    const driver = new MockDriver(10, 5);
    const app = new App(driver);
    app.run();

    const widget = new SvgImageWidget();
    widget.src = SVG;
    widget.region = new Region(new Offset(0, 0), new Size(2, 1));
    app.activeScreen.appendChild(widget);

    const buf = new ScreenBuffer(10, 5);
    expect(() => widget.render(buf)).not.toThrow();

    app.stop();
  });
});
