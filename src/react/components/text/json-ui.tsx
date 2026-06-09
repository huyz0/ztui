import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface JSONUIProps extends ComponentProps {
  onAction?: (actionName: string, eventData: any) => void;
}

export const JSONUI = hostComponent<JSONUIProps>("ztui-jsonui");
