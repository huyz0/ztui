import { createElement, type ReactElement, useState } from "react";
import type { ListItem } from "../../../widgets/data/list-view.ts";
import type { SelectionGlyphSet } from "../../../widgets/data/selection-list.ts";
import type { ComponentProps } from "../types.ts";

/** Props for {@link SelectionList}. */
export interface SelectionListProps extends Omit<ComponentProps, "children"> {
  /** The rows to choose from. */
  items: ListItem[];
  /** Controlled checked ids. Omit to let the component manage selection. */
  value?: string[];
  /** Initial checked ids when uncontrolled. Defaults to none. */
  defaultValue?: string[];
  /** Fired with the next checked-id array when the selection changes. */
  onChange?: (selectedIds: string[]) => void;
  /** Checkbox glyph set. Defaults to "unicode". */
  glyphSet?: SelectionGlyphSet;
}

/**
 * A virtualized multi-select checkbox list — "pick which of these to apply".
 * Arrows move the cursor, Space/Enter (or click) toggles a row, `a` toggles
 * all. Works controlled (`value` + `onChange`) or uncontrolled (`defaultValue`).
 *
 * ```tsx
 * <SelectionList items={files} defaultValue={["a.ts"]} onChange={setPicked} />
 * ```
 */
export function SelectionList({
  value,
  defaultValue = [],
  onChange,
  ...rest
}: SelectionListProps): ReactElement {
  const [internal, setInternal] = useState<string[]>(defaultValue);
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;

  const handleChange = (next: string[]) => {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };

  return createElement("ztui-selection-list", { ...rest, value: current, onChange: handleChange });
}
SelectionList.displayName = "SelectionList";
