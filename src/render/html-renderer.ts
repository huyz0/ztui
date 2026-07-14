import type { ScreenBuffer } from "./buffer.ts";

/**
 * Shared metrics for the HTML backend (web driver + inspector). Keeping these
 * in one place lets the DOM binding measure cells and the page load the font
 * with values that always match what {@link renderBufferToHTML} emits.
 *
 * The stack leads with Cascadia Mono — the *complete* webfont bundled in
 * `resources/fonts/` (see {@link bundledFontPath}) and loaded with an
 * `@font-face` by the host page — because, as a purpose-built terminal font,
 * its box-drawing (U+2500+) and block-element glyphs fill the full cell box, so
 * borders, rounded corners, and scrollbars join cleanly. The rest are graceful
 * fallbacks if the font is absent; a Latin-subset build is *not* enough (it
 * omits those glyphs, so the browser substitutes a system font whose glyphs
 * leave dashed seams).
 */
export const BUNDLED_FONT_FAMILY = "Cascadia Mono";
// 'Seti' (last before the generic) only supplies the private-use file-icon
// glyphs Cascadia lacks; it never affects normal text.
export const HTML_FONT_FAMILY = `'${BUNDLED_FONT_FAMILY}', 'JetBrains Mono', 'DejaVu Sans Mono', 'Menlo', 'Consolas', 'Seti', monospace`;
/** Cell font size in px. */
export const HTML_FONT_SIZE = 12;
/** Line height as a multiple of the font size; sets the cell/row height. */
export const HTML_LINE_HEIGHT = 1.2;
/** Cell height in px (`font-size × line-height`), for grid sizing/measurement. */
export const HTML_CELL_HEIGHT = Math.round(HTML_FONT_SIZE * HTML_LINE_HEIGHT);
/** Padding in px between the grid and the container edge. */
export const HTML_PADDING = 10;

/**
 * Render the screen buffer as a plain-text grid — a "screenshot" of exactly the
 * characters currently on screen. Style/color is dropped (use renderBufferToHTML
 * for that); this is the fastest way for a human or LLM to see the layout.
 * Wide-character continuation cells are skipped and trailing whitespace trimmed.
 */
export function renderBufferToText(buffer: ScreenBuffer): string {
  const lines: string[] = [];
  for (let y = 0; y < buffer.height; y++) {
    let row = "";
    for (let x = 0; x < buffer.width; x++) {
      const cell = buffer.cells[y][x];
      if (cell.wideContinuation) continue;
      row += cell.char === "" ? " " : cell.char;
    }
    lines.push(row.replace(/\s+$/, ""));
  }
  return lines.join("\n");
}

function escapeHTML(char: string): string {
  if (char === " ") return " ";
  return char
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** HTML-escape an arbitrary attribute value (no single-char fast path). */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Make a cell's hyperlink (from untrusted markdown/markup) safe to put in an
 * `href`. Only http/https/mailto survive; anything else — notably `javascript:`
 * and `data:` — is dropped so the rendered HTML can't execute script when viewed
 * in a browser (e.g. via the inspector's `/render` endpoint).
 */
function safeHref(link: string): string | null {
  const trimmed = link.trim();
  // Strip control chars/whitespace that browsers ignore inside the scheme
  // (e.g. "java\tscript:") before testing the scheme.
  const scheme = trimmed.replace(/[\u0000-\u0020]+/g, "").toLowerCase();
  if (/^(https?:|mailto:)/.test(scheme)) return escapeAttr(trimmed);
  // Protocol-relative or path/anchor links are safe (no executable scheme).
  if (/^(\/|#|\.)/.test(trimmed)) return escapeAttr(trimmed);
  return null;
}

/** Effective background color (after reverse), or "" for the default. */
function effectiveBg(style: any): string {
  const bg = style.reverse ? style.color : style.background;
  return bg && bg !== "default" ? normalizeColorForCSS(bg) : "";
}

/** Inline CSS for a foreground (text-only) run: color + weight/decoration. */
function fgCSS(style: any): string {
  const css: string[] = [];
  const fg = style.reverse ? style.background : style.color;
  if (fg && fg !== "default") css.push(`color: ${normalizeColorForCSS(fg)}`);
  if (style.bold) css.push("font-weight: bold");
  if (style.dim) css.push("opacity: 0.6");
  if (style.italic) css.push("font-style: italic");
  const lines: string[] = [];
  if (style.underline) lines.push("underline");
  if (style.strikethrough) lines.push("line-through");
  if (lines.length) {
    css.push(`text-decoration-line: ${lines.join(" ")}`);
    if (style.underline) {
      const shape = style.underlineStyle === "curly" ? "wavy" : style.underlineStyle;
      if (shape && shape !== "single") css.push(`text-decoration-style: ${shape}`);
      if (style.underlineColor)
        css.push(`text-decoration-color: ${normalizeColorForCSS(style.underlineColor)}`);
    }
  }
  return css.join("; ");
}

/**
 * Render the screen buffer as styled HTML, in two stacked layers:
 *
 *   1. a **background** layer (cell fills), absolutely positioned behind, and
 *   2. a **foreground** text layer on top.
 *
 * The page applies a hard CSS reset (no margins) and the grid sets
 * `line-height: HTML_LINE_HEIGHT`, so each row's height comes from the line box
 * alone (no explicit `height` on the row divs) and the cell is `HTML_CELL_HEIGHT`
 * px tall. Glyph descenders can still spill a pixel into the next row; keeping
 * every cell fill *behind* all text (the background layer) means the next row's
 * fill never paints over and clips those tails. No per-cell `inline-block` is
 * used — every cell is a plain glyph in a `white-space: pre` row.
 */
export function renderBufferToHTML(buffer: ScreenBuffer): string {
  const rowStyle = `white-space: pre;`;
  let bgLayer = "";
  let fgLayer = "";

  for (let y = 0; y < buffer.height; y++) {
    // --- background layer: runs of the same fill, drawn as spacer spans -------
    let bgRow = "";
    let runBg = "";
    let runLen = 0;
    const flushBg = () => {
      if (runLen === 0) return;
      const spaces = " ".repeat(runLen);
      bgRow += runBg ? `<span style="background-color: ${runBg}">${spaces}</span>` : spaces;
      runLen = 0;
    };
    for (let x = 0; x < buffer.width; x++) {
      const bg = effectiveBg(buffer.cells[y][x].style);
      if (bg !== runBg) {
        flushBg();
        runBg = bg;
      }
      runLen++;
    }
    flushBg();
    bgLayer += `<div style="${rowStyle}">${bgRow}</div>`;

    // --- foreground layer: text runs (no background) --------------------------
    let fgRow = "";
    let currentStyle: any = null;
    let currentText = "";
    const flushText = () => {
      if (!currentText) return;
      const css = fgCSS(currentStyle);
      const styleAttr = css ? ` style="${css}"` : "";
      let runHtml = `<span${styleAttr}>${currentText}</span>`;
      if (currentStyle.link) {
        const href = safeHref(String(currentStyle.link));
        if (href) {
          runHtml = `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow" style="text-decoration: underline; color: inherit;">${runHtml}</a>`;
        }
      }
      fgRow += runHtml;
      currentText = "";
    };

    for (let x = 0; x < buffer.width; x++) {
      const cell = buffer.cells[y][x];
      if (cell.wideContinuation) continue;
      const cellStyle = cell.style;
      const styleKey = {
        color: cellStyle.color,
        background: cellStyle.background,
        bold: cellStyle.bold,
        dim: cellStyle.dim,
        italic: cellStyle.italic,
        underline: cellStyle.underline,
        underlineStyle: cellStyle.underlineStyle,
        underlineColor: cellStyle.underlineColor,
        strikethrough: cellStyle.strikethrough,
        reverse: cellStyle.reverse,
        link: cellStyle.link,
      };

      if (!currentStyle || !stylesEqual(currentStyle, styleKey)) {
        flushText();
        currentStyle = styleKey;
      }
      currentText += escapeHTML(cell.char);
    }
    flushText();
    fgLayer += `<div style="${rowStyle}">${fgRow}</div>`;
  }

  const base = `font-family: ${HTML_FONT_FAMILY}; font-size: ${HTML_FONT_SIZE}px; line-height: ${HTML_LINE_HEIGHT};`;
  return (
    `<div style="${base} position: relative; width: fit-content; background-color: #1e1e2e; color: #cdd6f4; padding: ${HTML_PADDING}px; border-radius: 4px;">` +
    `<div style="position: absolute; top: ${HTML_PADDING}px; left: ${HTML_PADDING}px;">${bgLayer}</div>` +
    `<div style="position: relative;">${fgLayer}</div>` +
    `</div>`
  );
}

function stylesEqual(s1: any, s2: any): boolean {
  return (
    s1.color === s2.color &&
    s1.background === s2.background &&
    s1.bold === s2.bold &&
    s1.dim === s2.dim &&
    s1.italic === s2.italic &&
    s1.underline === s2.underline &&
    s1.underlineStyle === s2.underlineStyle &&
    s1.underlineColor === s2.underlineColor &&
    s1.strikethrough === s2.strikethrough &&
    s1.reverse === s2.reverse &&
    s1.link === s2.link
  );
}

export function normalizeColorForCSS(color: string): string {
  const norm = color.trim().toLowerCase();

  const standardANSI: Record<string, string> = {
    black: "#000000",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    gray: "#6272a4",
    grey: "#6272a4",
    "bright-black": "#6272a4",
    "bright-red": "#ff6e6e",
    "bright-green": "#69ff94",
    "bright-yellow": "#ffffa5",
    "bright-blue": "#d6acff",
    "bright-magenta": "#ff92df",
    "bright-cyan": "#a4ffff",
    "bright-white": "#ffffff",
  };

  if (standardANSI[norm]) {
    return standardANSI[norm];
  }
  // The result is interpolated into an inline `style="..."` attribute, so a
  // color string coming from untrusted markup (e.g. `[color=...]`) must not be
  // able to break out of the CSS value. Allow only hex and rgb()/rgba() /
  // hsl()/hsla() literals; drop anything else to a safe default.
  if (/^#[0-9a-f]{3,8}$/.test(norm) || /^(rgb|hsl)a?\([0-9.,%\s/]*\)$/.test(norm)) {
    return norm;
  }
  return "inherit";
}
