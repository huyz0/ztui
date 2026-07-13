import type { SelectOption } from "../../../widgets/controls/select.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps, FieldValidationProps } from "../types.ts";

/** Props for {@link Combobox}. */
export interface ComboboxProps extends ComponentProps, FieldValidationProps {
  /** Choices — plain strings or `{ value, label }` objects. */
  options: (string | SelectOption)[];
  /** Current text (typed or picked from a suggestion). */
  value?: string;
  /** Called with the new text on every edit and on picking a suggestion. */
  onChange?: (val: string) => void;
  /** Called specifically when a suggestion is picked (click or Enter). */
  onSelect?: (option: SelectOption) => void;
  /** Hint text shown when the field is empty. */
  placeholder?: string;
  /** Whether text matching no option is kept as-is when the dropdown closes. Default `true`. */
  allowCustomValue?: boolean;
}

/** A filterable text field with suggestions — typing narrows `options` to matches, shown in a popover. */
export const Combobox = hostComponent<ComboboxProps>("ztui-combobox");
