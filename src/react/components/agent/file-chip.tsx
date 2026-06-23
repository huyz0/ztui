import type { ReactElement } from "react";
import { Chip, type ChipVariant } from "../feedback/chip.tsx";
import type { ComponentProps } from "../types.ts";

export interface FileChipProps extends ComponentProps {
  /** File path. The basename is shown; the full path is reported to `onOpen`. */
  path: string;
  /** Optional line number, appended as `:42`. */
  line?: number;
  /** Chip style. Defaults to `"bracket"`. */
  variant?: ChipVariant;
  /** Accent colour. Defaults to `"$accent"`. */
  color?: string;
  /** Fired when the chip is clicked — wire it to open the file at `line`. */
  onOpen?: (path: string, line?: number) => void;
}

/**
 * A clickable file-reference chip for citing sources in an assistant message —
 * `📄 app.ts:42`. Shows the basename (full path goes to `onOpen`), so a model
 * can point at exactly where it read or changed something.
 *
 * ```tsx
 * <FileChip path="src/core/app.ts" line={42} onOpen={openInEditor} />
 * ```
 */
export function FileChip({
  path,
  line,
  variant = "bracket",
  color = "$accent",
  onOpen,
  ...rest
}: FileChipProps): ReactElement {
  const name = path.split("/").pop() || path;
  return (
    <Chip
      {...rest}
      variant={variant}
      color={color}
      icon="📄"
      onClick={onOpen ? () => onOpen(path, line) : undefined}
    >
      {line != null ? `${name}:${line}` : name}
    </Chip>
  );
}
FileChip.displayName = "FileChip";
