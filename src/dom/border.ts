/**
 * Border glyph sets for {@link Widget} borders. A border weight maps to the
 * box-drawing characters for its edges and corners; widgets resolve a weight per
 * side (so a single side can be a clean corner-less bar) and draw with these.
 *
 * Pure data + lookups — no widget state — so it's trivially unit-testable.
 */

/** Which side of the box a border edge sits on. */
export type BorderSide = "top" | "right" | "bottom" | "left";

interface GlyphSet {
  /** Horizontal edge (top/bottom). */
  h: string;
  /** Vertical edge (left/right). */
  v: string;
  tl: string;
  tr: string;
  br: string;
  bl: string;
}

/** Box-drawing glyphs per line weight. `bar` (solid blocks) is handled separately. */
const SETS: Record<string, GlyphSet> = {
  thin: { h: "─", v: "│", tl: "┌", tr: "┐", br: "┘", bl: "└" },
  solid: { h: "─", v: "│", tl: "┌", tr: "┐", br: "┘", bl: "└" },
  single: { h: "─", v: "│", tl: "┌", tr: "┐", br: "┘", bl: "└" },
  rounded: { h: "─", v: "│", tl: "╭", tr: "╮", br: "╯", bl: "╰" },
  heavy: { h: "━", v: "┃", tl: "┏", tr: "┓", br: "┛", bl: "┗" },
  double: { h: "═", v: "║", tl: "╔", tr: "╗", br: "╝", bl: "╚" },
  // Rounded corners with dashed edges (the corners themselves aren't dashed).
  dashed: { h: "╌", v: "┆", tl: "╭", tr: "╮", br: "╯", bl: "╰" },
};

/** Half-block edge glyphs for the `bar` weight (a prominent one-sided accent). */
const BAR_EDGE: Record<BorderSide, string> = { top: "▀", bottom: "▄", left: "▌", right: "▐" };
const BAR_CORNER = "█";

/** The `block` weight fills the whole cell on every side — the thickest bar. */
const BLOCK = "█";

/** Unrecognized weights fall back to `rounded` — the historical default. */
function setFor(weight: string): GlyphSet {
  return SETS[weight] ?? SETS.rounded;
}

/** Whether a weight value means "draw a border" (set and not `"none"`). */
export function hasBorderWeight(weight: string | undefined | null): weight is string {
  return !!weight && weight !== "none";
}

/** The edge glyph for `side` at the given weight. */
export function borderEdge(weight: string, side: BorderSide): string {
  if (weight === "block") return BLOCK;
  if (weight === "bar") return BAR_EDGE[side];
  const set = setFor(weight);
  return side === "top" || side === "bottom" ? set.h : set.v;
}

/** The corner glyph (`tl`/`tr`/`br`/`bl`) at the given weight. */
export function borderCorner(weight: string, corner: "tl" | "tr" | "br" | "bl"): string {
  if (weight === "block") return BLOCK;
  if (weight === "bar") return BAR_CORNER;
  return setFor(weight)[corner];
}
