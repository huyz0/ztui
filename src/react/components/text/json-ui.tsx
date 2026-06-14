import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface JSONUIProps extends ComponentProps {
  onAction?: (actionName: string, eventData: any) => void;
}

/** Render a UI tree described by JSON (optionally streamed). */
export const JSONUI = hostComponent<JSONUIProps>("ztui-jsonui");
