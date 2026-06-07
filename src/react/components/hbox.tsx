import type React from "react";
import { Box } from "./box.tsx";
import type { ComponentProps } from "./types.ts";

export function HBox({ id, className, style, children }: ComponentProps) {
  return (
    <Box id={id} className={className} style={{ flexDirection: "row", ...style }}>
      {children}
    </Box>
  );
}
