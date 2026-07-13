import { presetBox } from "../factory.tsx";

/**
 * Container that tiles children into equal cells, 2 columns by default. Set
 * `style={{ gridColumns: N }}` to change the column count.
 */
export const Grid = presetBox({ display: "grid" }, "Grid");
