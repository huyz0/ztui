import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { App } from "../core/app.ts";
import type { KeyEvent, MouseEvent } from "../driver/driver.ts";
import { canvasClientScript } from "../driver/web/canvas-bundle.ts";
import { serializeForCanvas } from "../driver/web/canvas-serialize.ts";
import {
  bundledFontFaces,
  bundledFontPath,
  setiFontFace,
  setiFontPath,
  type WebFontFace,
  webHostStyles,
} from "../driver/web/host-page.ts";
import { WebDriver } from "../driver/web/index.ts";
import { render, unmount } from "../react/reconciler.ts";
import {
  BUNDLED_FONT_FAMILY,
  HTML_FONT_FAMILY,
  HTML_FONT_SIZE,
  HTML_PADDING,
} from "../render/html-renderer.ts";
import { ThemeManager } from "../theme.ts";

/**
 * Headless-browser debug harness for the web backend.
 *
 * It runs a ztui app on a {@link WebDriver}, paints each frame into a real
 * Chromium page (same chrome as the live demo, fonts inlined so no server is
 * needed), and exposes screenshots, pixel-accurate geometry reports, and
 * input injection. This is the built-in way for *any* coding agent — in this
 * session or a future one — to see and verify what the web backend renders
 * without a human at a browser.
 *
 *   const insp = await WebInspector.launch(<MyApp />);
 *   await insp.screenshot("/tmp/frame.png");
 *   console.log(await insp.report());   // gaps, overflow, font-loaded, ...
 *   await insp.click(10, 4);            // cell coords
 *   await insp.close();
 *
 * Playwright is a devDependency and imported lazily, so importing this module
 * never forces a Playwright dependency on normal framework use.
 */

export interface WebInspectorOptions {
  /** Grid size in cells. Defaults to the WebDriver minimum (120×50). */
  cols?: number;
  rows?: number;
  /** Chromium executable. Defaults to env ZTUI_CHROME, then common system paths. */
  executablePath?: string;
  /** Run with a visible window (default headless). */
  headed?: boolean;
  /** Screenshot pixel density (default 2 for crisp glyph seams; use 1 for smaller PNGs). */
  deviceScaleFactor?: number;
  /** Override the bundled JetBrains Mono faces (e.g. to test another font). */
  fonts?: WebFontFace[];
}

/** Diagnostics for the rendered canvas. */
export interface GridReport {
  /** Canvas backing-store size in device pixels. */
  canvasWidth: number;
  canvasHeight: number;
  /** Measured cell size in CSS px (from the font). */
  cellWidth: number;
  cellHeight: number;
  /** Whether the bundled terminal font actually loaded (not a fallback). */
  fontLoaded: boolean;
  /** Whether the document overflows its window (an unwanted scrollbar). */
  pageScrolls: boolean;
}

const SYSTEM_CHROME = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function resolveBundledFonts(): WebFontFace[] {
  const dataUrl = (weight: 400 | 700): string =>
    `data:font/woff2;base64,${readFileSync(bundledFontPath(weight)).toString("base64")}`;
  const seti = `data:font/woff;base64,${readFileSync(setiFontPath()).toString("base64")}`;
  return [...bundledFontFaces(dataUrl(400), dataUrl(700)), setiFontFace(seti)];
}

export class WebInspector {
  readonly driver: WebDriver;
  readonly app: App;
  private readonly fonts: WebFontFace[];
  // Typed as `any` to avoid a hard Playwright type dependency in framework code.
  // `page` is public so advanced agents can script Playwright directly.
  private browser: any;
  public page: any;
  private container: unknown;
  private viewReady = false;

  private constructor(driver: WebDriver, app: App, fonts: WebFontFace[]) {
    this.driver = driver;
    this.app = app;
    this.fonts = fonts;
  }

  /** Boot a ztui app, open it in headless Chromium, and return the inspector. */
  static async launch(ui: ReactNode, opts: WebInspectorOptions = {}): Promise<WebInspector> {
    const driver = new WebDriver(opts.cols, opts.rows);
    const app = new App(driver);
    const container = render(ui, app.activeScreen);
    app.run();

    const fonts = opts.fonts ?? resolveBundledFonts();
    const insp = new WebInspector(driver, app, fonts);
    insp.container = container;
    await insp.openBrowser(opts);
    await insp.render();
    return insp;
  }

  private async openBrowser(opts: WebInspectorOptions): Promise<void> {
    const { chromium } = await import("playwright");
    const executablePath =
      opts.executablePath ??
      process.env.ZTUI_CHROME ??
      SYSTEM_CHROME.find((p) => {
        try {
          readFileSync(p);
          return true;
        } catch {
          return false;
        }
      });
    this.browser = await chromium.launch({ headless: !opts.headed, executablePath });
    // 2× device scale by default so screenshots are crisp enough to judge seams.
    this.page = await this.browser.newPage({ deviceScaleFactor: opts.deviceScaleFactor ?? 2 });
    const size = this.driver.getSize();
    // Size the viewport so the canvas fits (cell ≈ 0.6em wide, 1.2em tall).
    await this.page.setViewportSize({
      width: Math.ceil(size.width * HTML_FONT_SIZE * 0.65 + 2 * HTML_PADDING) + 40,
      height: Math.ceil(size.height * HTML_FONT_SIZE * 1.2 + 2 * HTML_PADDING) + 40,
    });
  }

  /** One-time: build the canvas host page and the renderer view. */
  private async setupPage(): Promise<void> {
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${webHostStyles(this.fonts)}</style></head><body><div id="screen" tabindex="0"></div></body></html>`;
    await this.page.setContent(doc, { waitUntil: "load" });
    await this.page.evaluate(() => (document as any).fonts.ready);
    await this.page.addScriptTag({ content: await canvasClientScript() });
    // The real theme background, so the canvas's initial CSS background
    // (before the first render() call lands) matches instead of flashing a
    // hardcoded dark color first — most visible on a light theme.
    const initialBg = ThemeManager.getInstance().getActiveTheme().colors.background;
    await this.page.evaluate(
      ({
        fontSize,
        family,
        padding,
        bg,
      }: { fontSize: number; family: string; padding: number; bg: string }) => {
        (window as any).__ztuiView = (window as any).ztuiCanvas.create(
          document.getElementById("screen"),
          fontSize,
          family,
          padding,
          bg,
        );
      },
      { fontSize: HTML_FONT_SIZE, family: HTML_FONT_FAMILY, padding: HTML_PADDING, bg: initialBg },
    );
    this.viewReady = true;
  }

  /** Paint the current frame onto the page's canvas. */
  async render(): Promise<void> {
    if (!this.viewReady) await this.setupPage();
    const cells = serializeForCanvas(this.app.buffer);
    await this.page.evaluate((c: unknown) => (window as any).__ztuiView.render(c), cells);
  }

  /**
   * Save a PNG of the current frame; returns the path. Pass a `clip` (CSS px,
   * relative to the grid's top-left) to capture just a region — useful for
   * inspecting a border seam or corner up close.
   */
  async screenshot(
    path: string,
    clip?: { x: number; y: number; width: number; height: number },
  ): Promise<string> {
    const target = this.page.locator("#screen");
    if (clip) {
      const box = await target.boundingBox();
      await this.page.screenshot({
        path,
        clip: { x: box.x + clip.x, y: box.y + clip.y, width: clip.width, height: clip.height },
      });
    } else {
      await target.screenshot({ path });
    }
    return path;
  }

  /** Inspect the rendered canvas in the real browser. */
  async report(): Promise<GridReport> {
    return this.page.evaluate((fontFamily: string) => {
      const c = document.querySelector("canvas") as HTMLCanvasElement | null;
      const view = (window as any).__ztuiView;
      const de = document.documentElement;
      return {
        canvasWidth: c?.width ?? 0,
        canvasHeight: c?.height ?? 0,
        cellWidth: view ? Number(view.cellWidth.toFixed(3)) : 0,
        cellHeight: view ? Number(view.cellHeight.toFixed(3)) : 0,
        fontLoaded: (document as any).fonts.check(`14px '${fontFamily}'`),
        pageScrolls: de.scrollHeight > window.innerHeight || de.scrollWidth > window.innerWidth,
      };
    }, BUNDLED_FONT_FAMILY);
  }

  // ---- input injection (drives the app, then repaints) ----------------------

  async key(name: string, mods: Partial<KeyEvent> = {}): Promise<void> {
    this.driver.dispatchKey({ key: name, name, ctrl: false, meta: false, shift: false, ...mods });
    await this.settle();
  }

  async click(cellX: number, cellY: number, button: MouseEvent["button"] = "left"): Promise<void> {
    this.driver.dispatchMouse({ x: cellX, y: cellY, type: "press", button });
    this.driver.dispatchMouse({ x: cellX, y: cellY, type: "release", button });
    await this.settle();
  }

  async wheel(dir: "up" | "down", cellX = 0, cellY = 0): Promise<void> {
    this.driver.dispatchMouse({
      x: cellX,
      y: cellY,
      type: dir === "up" ? "scroll_up" : "scroll_down",
      button: "none",
    });
    await this.settle();
  }

  /** Plain text of the current frame (the cell grid as rows of characters). */
  text(): string {
    return this.driver.toText();
  }

  private async settle(): Promise<void> {
    // Let the App's microtask render queue flush, then repaint the page.
    await new Promise((r) => setTimeout(r, 10));
    await this.render();
  }

  async close(): Promise<void> {
    try {
      if (this.container) unmount(this.container);
      this.app.stop();
    } catch {
      /* ignore */
    }
    await this.browser?.close();
  }
}
