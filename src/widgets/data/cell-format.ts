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
  // Truncate with an ellipsis.
  if (width === 1) return "…";
  const limit = width - 1;
  let out = "";
  let acc = 0;
  for (const ch of text) {
    const cw = charWidth(ch);
    if (acc + cw > limit) break;
    out += ch;
    acc += cw;
  }
  out += "…";
  const ow = stringWidth(out);
  if (ow < width) out += " ".repeat(width - ow);
  return out;
}
