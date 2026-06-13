import type { Widget } from "../dom/widget.ts";

// `parseDimension` now lives in the geometry layer (below the DOM) so widgets
// can use it without an upward import. Re-exported here for the layout solvers
// and widgets that have always imported it from this module.
export { parseDimension } from "../geometry/parse-dimension.ts";

export abstract class Layout {
  abstract resolve(parent: Widget): void;
}
