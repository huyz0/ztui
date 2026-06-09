import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface IconProps extends ComponentProps {
  name: string;
}

export const Icon = hostComponent<IconProps>("ztui-icon");
