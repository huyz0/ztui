import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

/** Props for {@link Icon}. */
export interface IconProps extends ComponentProps {
  /** Registered icon name (see {@link IconRegistry}). */
  name: string;
}

/** Render a registered icon by name. */
export const Icon = hostComponent<IconProps>("ztui-icon");
