import { hostComponent } from "../factory.tsx";
import type { ComponentProps, FieldValidationProps } from "../types.ts";

/** Props for {@link TextArea} — a multi-line editor. */
export interface TextAreaProps extends ComponentProps, FieldValidationProps {
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
}

/** A multi-line text editor with an optional gutter and validation. */
export const TextArea = hostComponent<TextAreaProps>("ztui-textarea");
