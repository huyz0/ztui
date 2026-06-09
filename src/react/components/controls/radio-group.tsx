import type { RadioOption } from "../../../widgets/controls/radio-group.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface RadioGroupProps extends ComponentProps {
  options: (string | RadioOption)[];
  value?: string;
  orientation?: "horizontal" | "vertical";
  onChange?: (val: string) => void;
}

export const RadioGroup = hostComponent<RadioGroupProps>("ztui-radio-group");
