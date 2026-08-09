import { charWidth, stringWidth } from "../../render/segment.ts";

/** Pads or trims `text` to exactly `width` display cells, respecting alignment. */
export function fitCell(
  text: string,
  width: number,
  align: "left" | "center" | "right" = "left",
): string {
  if (width <= 0) return "";
  const w = stringWidth(text);
  if (w === width) return text;
  if (w < width) {
    const pad = width - w;
    if (align === "right") return " ".repeat(pad) + text;
    if (align === "center") {
      const l = Math.floor(pad / 2);
      return " ".repeat(l) + text + " ".repeat(pad - l);
    }
    return text + " ".repeat(pad);
  }
  // Clip to width without an ellipsis — callers apply fadeClippedRight for the
  // visual affordance. Hard-clip by grapheme, then pad if a wide char forced an
  // early break that left a gap.
  let out = "";
  let acc = 0;
  for (const ch of text) {
    const cw = charWidth(ch);
    if (acc + cw > width) break;
    out += ch;
    acc += cw;
  }
  if (acc < width) out += " ".repeat(width - acc);
  return out;
}

/** Returns true when `text` would be clipped (is wider than `width` columns). */
export function cellOverflows(text: string, width: number): boolean {
  return stringWidth(text) > width;
}
