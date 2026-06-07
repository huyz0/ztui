import type React from "react";
import { Box } from "./box.tsx";
import type { ComponentProps } from "./types.ts";

export function Grid({ id, className, style, children }: ComponentProps) {
  return (
    <Box id={id} className={className} style={{ display: "grid", ...style }}>
      {children}
    </Box>
  );
}
