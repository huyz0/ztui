import { Box } from "./box.tsx";
import type { ComponentProps } from "./types.ts";

export function HBox({ id, className, style, children, ...rest }: ComponentProps) {
  return (
    <Box id={id} className={className} style={{ flexDirection: "row", ...style }} {...rest}>
      {children}
    </Box>
  );
}
