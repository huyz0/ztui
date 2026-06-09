import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface TextAreaProps extends ComponentProps {
  onKey?: (ev: any) => void;
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  lineNumbers?: boolean;
  language?: string;
}

export const TextArea = hostComponent<TextAreaProps>("ztui-textarea");
