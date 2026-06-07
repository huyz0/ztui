import type React from "react";
import { Box } from "./box.tsx";
import type { ComponentProps } from "./types.ts";

export function VBox({ id, className, style, children }: ComponentProps) {
  return (
    <Box id={id} className={className} style={{ flexDirection: "column", ...style }}>
      {children}
    </Box>
  );
}
