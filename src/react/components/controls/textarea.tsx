import type {
  ValidateTrigger,
  ValidationResult,
  Validator,
} from "../../../widgets/controls/validation.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

/** Props for {@link TextArea} — a multi-line editor. */
export interface TextAreaProps extends ComponentProps {
  /** Key handler (set `ev.handled` to consume). */
  onKey?: (ev: any) => void;
  /** Current text (controlled). */
  value?: string;
  /** Called with the new text on every edit. */
  onChange?: (val: string) => void;
  /** Hint text shown when empty. */
  placeholder?: string;
  /** Show a line-number gutter. */
  lineNumbers?: boolean;
  /** Language id for syntax highlighting (e.g. `"ts"`). */
  language?: string;
  /** Validators run on the value; failures recolor the control. */
  validators?: Validator[];
  /** When the field re-validates itself (default "blur"). */
  validateOn?: ValidateTrigger;
  /** Called after each validation with the normalized result. */
  onValidate?: (result: ValidationResult) => void;
}

/** A multi-line text editor with an optional gutter and validation. */
export const TextArea = hostComponent<TextAreaProps>("ztui-textarea");
