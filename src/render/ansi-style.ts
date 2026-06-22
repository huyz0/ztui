import { parseColor } from "./color.ts";
import { colorMode } from "./color-mode.ts";
import type { Style, UnderlineStyle } from "./style.ts";

/**
 * Terminal serialization for {@link Style}. This is the *terminal-specific* half
 * of the style system — it turns the backend-agnostic style data model into SGR
 * escape sequences. It lives apart from `style.ts` so non-terminal backends
 * (web/canvas, WASM) reuse `Style` as a pure data model without ever pulling in
 * ANSI generation. Consumed by the terminal render path (`buffer.renderDiff`).
 */

// SGR 4 sub-parameter values per the Kitty underline spec.
const UNDERLINE_SGR: Record<UnderlineStyle, number> = {
  single: 1,
  double: 2,
  curly: 3,
  dotted: 4,
  dashed: 5,
};

/** Colour-depth the connected terminal supports; set by the driver on startup. */
export interface RenderCapabilities {
  truecolor: boolean;
  color256: boolean;
}

// Mutable global so the driver can publish terminal capabilities without the
// render layer importing `core`/`driver` (which would invert the dependency).
export const renderCapabilities: RenderCapabilities = {
  truecolor: true,
  color256: true,
};

// Per-Style memo of the serialized escape pair. A `Style` is immutable, and the
// same themed instances are shared across thousands of cells every frame, so the
// diff serializes the same handful of styles over and over — a WeakMap turns that
// into a pointer-keyed hit (and lets the entries be GC'd with the styles). The
// output also depends on the colour toggle and terminal colour depth, so the
// cache is tagged with a generation built from those; when it changes the whole
// map is dropped. (`parseColorToAnsi` keeps its own string→SGR cache underneath.)
let escapeCache = new WeakMap<Style, { start: string; end: string }>();
let escapeCacheGen = -1;

function serializationGen(): number {
  return (
    (colorMode.enabled ? 1 : 0) |
    (renderCapabilities.truecolor ? 2 : 0) |
    (renderCapabilities.color256 ? 4 : 0)
  );
}

/** SGR start/end escape pair that renders `style`, for use around cell text. */
export function styleToEscapeCodes(style: Style): { start: string; end: string } {
  const gen = serializationGen();
  if (gen !== escapeCacheGen) {
    escapeCache = new WeakMap();
    escapeCacheGen = gen;
  }
  const hit = escapeCache.get(style);
  if (hit !== undefined) return hit;
  const codes = computeEscapeCodes(style);
  escapeCache.set(style, codes);
  return codes;
}

function computeEscapeCodes(style: Style): { start: string; end: string } {
  let start = "";
  let end = "";

  // Honour NO_COLOR / the colour toggle: emit only the monochrome attributes
  // below and skip every fg/bg/underline-colour escape.
  const useColor = colorMode.enabled;

  if (style.bold) {
    start += "\x1b[1m";
    end += "\x1b[22m";
  }
  if (style.dim) {
    start += "\x1b[2m";
    end += "\x1b[22m";
  }
  if (style.italic) {
    start += "\x1b[3m";
    end += "\x1b[23m";
  }
  if (style.underline) {
    // Colon sub-parameter form (Kitty/Ghostty/iTerm2/WezTerm). `4:1` is plain
    // single and degrades to bare `4` on terminals that ignore the sub-param.
    const sub = UNDERLINE_SGR[style.underlineStyle ?? "single"];
    start += `\x1b[4:${sub}m`;
    end += "\x1b[24m";
    if (useColor && style.underlineColor) {
      const c = parseColor(style.underlineColor)?.rgb;
      if (c) {
        start += `\x1b[58:2::${c.r}:${c.g}:${c.b}m`;
        end += "\x1b[59m";
      }
    }
  }
  if (style.strikethrough) {
    start += "\x1b[9m";
    end += "\x1b[29m";
  }
  if (style.reverse) {
    start += "\x1b[7m";
    end += "\x1b[27m";
  }

  if (useColor && style.color) {
    const fgCode = parseColorToAnsi(style.color, false);
    if (fgCode) {
      start += fgCode;
      end += "\x1b[39m";
    }
  }

  if (useColor && style.background) {
    const bgCode = parseColorToAnsi(style.background, true);
    if (bgCode) {
      start += bgCode;
      end += "\x1b[49m";
    }
  }

  if (style.link) {
    start = `\x1b]8;;${style.link}\x1b\\${start}`;
    end = `${end}\x1b]8;;\x1b\\`;
  }

  return { start, end };
}

/**
 * The minimal SGR needed to move the terminal pen from `from` to `to`, assuming
 * the pen currently reflects `from` exactly. Emits only the attributes that
 * actually differ — turning one off (e.g. `\x1b[22m`), flipping a colour, adding
 * an underline — instead of the full `\x1b[0m` + complete re-set the sticky path
 * used between every differing run. Style codes were 43–55% of a full repaint's
 * bytes, mostly that redundant reset/re-set churn; a delta collapses an attribute
 * toggle to a couple of bytes. The resulting pen is identical to what
 * `\x1b[0m` + `styleToEscapeCodes(to).start` would produce (minus the OSC-8 link,
 * which the diff transitions separately) — the replay backstop asserts this.
 *
 * Only valid when the caller *knows* the current pen (it tracked `from`); when the
 * pen is unknown (frame start, after an inline graphic/icon) the diff still emits
 * a full reset instead.
 */
export function styleTransition(from: Style, to: Style): string {
  const useColor = colorMode.enabled;
  let out = "";

  // Bold and dim share the single reset SGR 22, so turning either off clears
  // both — re-add whichever must stay on. (A plain add needs no reset.)
  const boldDimOff = (from.bold && !to.bold) || (from.dim && !to.dim);
  if (boldDimOff) {
    out += "\x1b[22m";
    if (to.bold) out += "\x1b[1m";
    if (to.dim) out += "\x1b[2m";
  } else {
    if (to.bold && !from.bold) out += "\x1b[1m";
    if (to.dim && !from.dim) out += "\x1b[2m";
  }

  if (from.italic && !to.italic) out += "\x1b[23m";
  else if (to.italic && !from.italic) out += "\x1b[3m";

  // Underline carries a sub-style (4:n) and an independent colour (58/59); both
  // are scoped to underline being on, and SGR 24 (off) clears all of it.
  if (from.underline && !to.underline) {
    out += "\x1b[24m";
    if (useColor && from.underlineColor) out += "\x1b[59m";
  } else if (to.underline) {
    const fromSub = from.underline ? (from.underlineStyle ?? "single") : undefined;
    const toSub = to.underlineStyle ?? "single";
    if (fromSub !== toSub) out += `\x1b[4:${UNDERLINE_SGR[toSub]}m`;
    if (useColor) {
      const fromUc = from.underline ? from.underlineColor : undefined;
      if (to.underlineColor !== fromUc) {
        const c = to.underlineColor ? parseColor(to.underlineColor)?.rgb : undefined;
        if (c) out += `\x1b[58:2::${c.r}:${c.g}:${c.b}m`;
        else if (fromUc) out += "\x1b[59m";
      }
    }
  }

  if (from.strikethrough && !to.strikethrough) out += "\x1b[29m";
  else if (to.strikethrough && !from.strikethrough) out += "\x1b[9m";

  if (from.reverse && !to.reverse) out += "\x1b[27m";
  else if (to.reverse && !from.reverse) out += "\x1b[7m";

  // Compare colours by their *emitted* SGR (depth-aware, NO_COLOR-aware) so an
  // unparseable or default colour transitions to the right pen: a differing
  // target emits its code, and dropping to no colour emits the default (39/49).
  if (useColor) {
    const fromFg = from.color ? parseColorToAnsi(from.color, false) : null;
    const toFg = to.color ? parseColorToAnsi(to.color, false) : null;
    if (fromFg !== toFg) out += toFg ?? "\x1b[39m";

    const fromBg = from.background ? parseColorToAnsi(from.background, true) : null;
    const toBg = to.background ? parseColorToAnsi(to.background, true) : null;
    if (fromBg !== toBg) out += toBg ?? "\x1b[49m";
  }

  return out;
}

/**
 * Shortest escape sequence to move the terminal cursor from `(fromX, fromY)` to
 * `(toX, toY)`, all zero-based. The diff positions every run with this; emitting
 * the *minimal* move (a relative `CUU/CUD/CUF/CUB`, a bare `\r`, or nothing when
 * already there) instead of an absolute `CUP` (`\x1b[y;xH`) trims the per-run
 * positioning bytes that dominate a scattered (non-contiguous) repaint.
 *
 * It is guaranteed never longer than the absolute `CUP` it replaces: the CUP
 * form is always a candidate and the shortest candidate wins. `width` is the
 * grid width — when the source cursor sits at the right margin it is in the
 * terminal's ambiguous "pending wrap" state, where relative moves are unreliable,
 * so we fall back to the unambiguous absolute `CUP`.
 */
export function cursorMove(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  width: number,
): string {
  if (fromX === toX && fromY === toY) return "";

  const cup = `\x1b[${toY + 1};${toX + 1}H`;
  // Pending-wrap (cursor parked past the last column): only CUP is reliable.
  if (fromX >= width) return cup;

  const dx = toX - fromX;
  const dy = toY - fromY;
  // A relative step of n: "n" when n > 1, "" when n === 1 (the CSI default).
  const n = (v: number) => (v === 1 ? "" : String(v));

  const candidates = [cup];

  // Horizontal-only (same row): CUF/CUB keep the row.
  if (dy === 0) candidates.push(`\x1b[${n(Math.abs(dx))}${dx > 0 ? "C" : "D"}`);
  // Vertical-only (same column): CUU/CUD keep the column.
  else if (dx === 0) candidates.push(`\x1b[${n(Math.abs(dy))}${dy > 0 ? "B" : "A"}`);

  // Carriage-return form: `\r` snaps to column 0 (reliable regardless of wrap),
  // then an optional vertical step, then a forward step to the target column.
  let cr = "\r";
  if (dy !== 0) cr += `\x1b[${n(Math.abs(dy))}${dy > 0 ? "B" : "A"}`;
  if (toX > 0) cr += `\x1b[${n(toX)}C`;
  candidates.push(cr);

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].length < best.length) best = candidates[i];
  }
  return best;
}

/**
 * Escape sequence that scrolls a horizontal band of rows in place using the
 * terminal's own scroll region, so the diff need not re-emit every shifted row —
 * only the freshly revealed ones. `top`/`bottom` are zero-based, inclusive rows;
 * `delta > 0` scrolls the band *up* by `delta` (content rises, blank rows open at
 * the bottom), `delta < 0` scrolls it *down* (blank rows open at the top).
 *
 * Sets the scroll region (DECSTBM), issues SU/SD, then resets the region to the
 * full screen (which also homes the cursor — harmless, the diff repositions every
 * run from a cleared cursor). VT100-universal; gated on `scrollRegion` capability.
 */
export function scrollRegionSeq(top: number, bottom: number, delta: number): string {
  if (delta === 0 || bottom < top) return "";
  const region = `\x1b[${top + 1};${bottom + 1}r`;
  const op = delta > 0 ? `\x1b[${delta}S` : `\x1b[${-delta}T`;
  return `${region}${op}\x1b[r`;
}

// Map RGB values to the closest basic 16-colour index by Euclidean distance.
function getClosestBasicColor(r: number, g: number, b: number): number {
  const ansiRGBs = [
    { r: 0, g: 0, b: 0 }, // 0: black
    { r: 128, g: 0, b: 0 }, // 1: red
    { r: 0, g: 128, b: 0 }, // 2: green
    { r: 128, g: 128, b: 0 }, // 3: yellow
    { r: 0, g: 0, b: 128 }, // 4: blue
    { r: 128, g: 0, b: 128 }, // 5: magenta
    { r: 0, g: 128, b: 128 }, // 6: cyan
    { r: 192, g: 192, b: 192 }, // 7: white
    { r: 128, g: 128, b: 128 }, // 8: bright-black / gray
    { r: 255, g: 0, b: 0 }, // 9: bright-red
    { r: 0, g: 255, b: 0 }, // 10: bright-green
    { r: 255, g: 255, b: 0 }, // 11: bright-yellow
    { r: 0, g: 0, b: 255 }, // 12: bright-blue
    { r: 255, g: 0, b: 255 }, // 13: bright-magenta
    { r: 0, g: 255, b: 255 }, // 14: bright-cyan
    { r: 255, g: 255, b: 255 }, // 15: bright-white
  ];

  let minDistance = Number.MAX_VALUE;
  let closestIndex = 0;

  for (let i = 0; i < ansiRGBs.length; i++) {
    const dr = r - ansiRGBs[i].r;
    const dg = g - ansiRGBs[i].g;
    const db = b - ansiRGBs[i].b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = i;
    }
  }

  return closestIndex;
}

// Named 16-color table (module-level so it isn't rebuilt on every call).
const basicColors: Record<string, number> = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,
  gray: 8,
  grey: 8,
  "bright-black": 8,
  "bright-red": 9,
  "bright-green": 10,
  "bright-yellow": 11,
  "bright-blue": 12,
  "bright-magenta": 13,
  "bright-cyan": 14,
  "bright-white": 15,
};

// Memoize color → SGR escape. The conversion is pure given the color depth, and
// a frame typically reuses a small palette (e.g. a gradient), so this turns a
// per-changed-cell parse into a Map hit. The cache resets if the terminal's
// color depth changes (it flips at most once, when capabilities resolve).
const ansiColorCache = new Map<string, string | null>();
let cachedTruecolor = renderCapabilities.truecolor;
let cachedColor256 = renderCapabilities.color256;

// Parse a color name, hex, or rgb() into an SGR colour escape, honouring the
// terminal's colour depth (truecolor → 256 → basic 16).
function parseColorToAnsi(color: string, isBackground: boolean): string | null {
  if (
    cachedTruecolor !== renderCapabilities.truecolor ||
    cachedColor256 !== renderCapabilities.color256
  ) {
    ansiColorCache.clear();
    cachedTruecolor = renderCapabilities.truecolor;
    cachedColor256 = renderCapabilities.color256;
  }
  const cacheKey = isBackground ? `b${color}` : `f${color}`;
  const cached = ansiColorCache.get(cacheKey);
  if (cached !== undefined || ansiColorCache.has(cacheKey)) return cached ?? null;
  const result = computeColorToAnsi(color, isBackground);
  if (ansiColorCache.size < 4096) ansiColorCache.set(cacheKey, result);
  return result;
}

function computeColorToAnsi(color: string, isBackground: boolean): string | null {
  const norm = color.trim().toLowerCase();
  const prefix = isBackground ? 48 : 38;

  if (norm === "default") {
    return `\x1b[${isBackground ? 49 : 39}m`;
  }

  if (basicColors[norm] !== undefined) {
    const code = basicColors[norm];
    if (code < 8) {
      return `\x1b[${isBackground ? 40 + code : 30 + code}m`;
    }
    return `\x1b[${isBackground ? 100 + (code - 8) : 90 + (code - 8)}m`;
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let parsed = false;

  // Hex colors: #rgb or #rrggbb
  if (norm.startsWith("#")) {
    const hex = norm.slice(1);
    if (hex.length === 3) {
      r = Number.parseInt(hex[0] + hex[0], 16);
      g = Number.parseInt(hex[1] + hex[1], 16);
      b = Number.parseInt(hex[2] + hex[2], 16);
      parsed = true;
    } else if (hex.length === 6) {
      r = Number.parseInt(hex.slice(0, 2), 16);
      g = Number.parseInt(hex.slice(2, 4), 16);
      b = Number.parseInt(hex.slice(4, 6), 16);
      parsed = true;
    }
  } else {
    // rgb(r, g, b)
    const rgbMatch = norm.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (rgbMatch) {
      r = Number.parseInt(rgbMatch[1], 10);
      g = Number.parseInt(rgbMatch[2], 10);
      b = Number.parseInt(rgbMatch[3], 10);
      parsed = true;
    }
  }

  if (!parsed) {
    return null;
  }

  if (renderCapabilities.truecolor) {
    return `\x1b[${prefix};2;${r};${g};${b}m`;
  }

  if (renderCapabilities.color256) {
    const rIdx = Math.round((r / 255) * 5);
    const gIdx = Math.round((g / 255) * 5);
    const bIdx = Math.round((b / 255) * 5);
    const index = 16 + 36 * rIdx + 6 * gIdx + bIdx;
    return `\x1b[${prefix};5;${index}m`;
  }

  // Fallback to closest 16-color index
  const closestIndex = getClosestBasicColor(r, g, b);
  if (closestIndex < 8) {
    return `\x1b[${isBackground ? 40 + closestIndex : 30 + closestIndex}m`;
  }
  return `\x1b[${isBackground ? 100 + (closestIndex - 8) : 90 + (closestIndex - 8)}m`;
}
