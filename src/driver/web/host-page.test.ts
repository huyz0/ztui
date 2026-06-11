import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { BUNDLED_FONT_FAMILY } from "../../render/html-renderer.ts";
import {
  bundledFontFaces,
  bundledFontPath,
  renderWebHostDocument,
  setiFontFace,
  setiFontPath,
  webHostStyles,
} from "./host-page.ts";

describe("web host page", () => {
  test("bundledFontFaces pairs the bundled family at weight 400 and 700", () => {
    const faces = bundledFontFaces("/r.woff2", "/b.woff2");
    expect(faces).toEqual([
      { family: BUNDLED_FONT_FAMILY, weight: 400, url: "/r.woff2" },
      { family: BUNDLED_FONT_FAMILY, weight: 700, url: "/b.woff2" },
    ]);
  });

  test("bundledFontPath resolves to real, weight-specific woff2 files", () => {
    const reg = bundledFontPath(400);
    const bold = bundledFontPath(700);
    expect(reg).not.toBe(bold);
    expect(reg.endsWith(".woff2")).toBe(true);
    // The vendored fonts must actually exist (they back every web render).
    expect(existsSync(reg)).toBe(true);
    expect(existsSync(bold)).toBe(true);
  });

  test("webHostStyles emits @font-face rules and terminal-like behavior", () => {
    const css = webHostStyles(bundledFontFaces("/r.woff2", "/b.woff2"));
    expect(css).toContain("@font-face");
    expect(css).toContain(`font-family:'${BUNDLED_FONT_FAMILY}'`);
    expect(css).toContain("/r.woff2");
    expect(css).toContain("/b.woff2");
    expect(css).toContain("overflow:hidden"); // no window scroll
    expect(css).toContain("user-select:none"); // not a document
  });

  test("the Seti icon font is bundled and emitted as a woff @font-face", () => {
    expect(existsSync(setiFontPath())).toBe(true);
    const face = setiFontFace("/fonts/seti.woff");
    expect(face).toMatchObject({ family: "Seti", format: "woff" });
    // webHostStyles must honor the per-face format (woff vs the default woff2).
    const css = webHostStyles([face]);
    expect(css).toContain("format('woff')");
  });

  test("renderWebHostDocument wraps grid HTML in a focusable #screen host", () => {
    const doc = renderWebHostDocument("<div>GRID</div>", bundledFontFaces("/r", "/b"));
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain('id="screen"');
    expect(doc).toContain('tabindex="0"');
    expect(doc).toContain("<div>GRID</div>");
  });
});
