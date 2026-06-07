import type { Widget } from "../dom/widget.ts";

export abstract class Layout {
  abstract resolve(parent: Widget): void;
}

export function parseDimension(
  value: string | number | undefined,
  maxAvailable: number,
  defaultValue = 1,
): number | { fr: number } {
  if (value === undefined || value === "auto") {
    return defaultValue;
  }
  if (typeof value === "number") {
    return value;
  }

  const str = value.trim();
  if (str.endsWith("%")) {
    const percent = Number.parseFloat(str.slice(0, -1));
    return Math.floor((percent / 100) * maxAvailable);
  }
  if (str.endsWith("fr")) {
    const fr = Number.parseFloat(str.slice(0, -2));
    return { fr };
  }
  if (str.endsWith("h") || str.endsWith("w")) {
    return Number.parseFloat(str.slice(0, -1));
  }

  const num = Number.parseFloat(str);
  return Number.isNaN(num) ? defaultValue : num;
}
