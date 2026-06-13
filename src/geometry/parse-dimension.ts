/**
 * Parse a CSS-like dimension (`number`, `"50%"`, `"3fr"`, `"10w"`/`"5h"`, or
 * `"auto"`) into a concrete cell count or an `fr` weight. Pure and dependency-
 * free, so it lives in the geometry layer where both the DOM (`Widget.measure`)
 * and the layout solvers can use it without an upward import.
 *
 * All paths clamp to `>= 0` and never return `NaN`, so a malformed value can't
 * poison fr distribution or push a region off-grid (see architecture §1.8).
 */
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
    if (Number.isNaN(percent)) return defaultValue;
    return Math.max(0, Math.floor((percent / 100) * maxAvailable));
  }
  if (str.endsWith("fr")) {
    const fr = Number.parseFloat(str.slice(0, -2));
    // A malformed/negative fr must not poison fr distribution with NaN.
    return { fr: Number.isNaN(fr) ? 0 : Math.max(0, fr) };
  }
  if (str.endsWith("h") || str.endsWith("w")) {
    const num = Number.parseFloat(str.slice(0, -1));
    return Number.isNaN(num) ? defaultValue : Math.max(0, num);
  }

  const num = Number.parseFloat(str);
  return Number.isNaN(num) ? defaultValue : Math.max(0, num);
}
