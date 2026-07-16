import { createElement, type ReactElement } from "react";
import type { CollapsibleGlyphSet } from "../../../widgets/layout/collapsible.ts";
import { useDisclosure } from "../../use-disclosure.ts";
import type { ComponentProps } from "../types.ts";

export interface CollapsibleProps extends ComponentProps {
  /** Title shown next to the disclosure triangle. */
  title: string;
  /** Controlled open state. Omit to let the component manage it internally. */
  open?: boolean;
  /** Initial open state when uncontrolled. Defaults to false. */
  defaultOpen?: boolean;
  /** Fired with the next open state when the user toggles. */
  onToggle?: (open: boolean) => void;
  /** Disclosure glyph set. Defaults to `unicode`. */
  glyphSet?: CollapsibleGlyphSet;
}

/**
 * A foldable section: a clickable title row that shows/hides its children.
 * Works controlled (pass `open` + `onToggle`) or uncontrolled (`defaultOpen`).
 * Children stay mounted while collapsed, so their state survives a toggle.
 *
 * ```tsx
 * <Collapsible title="Tool call" defaultOpen={false}>
 *   <Label>…details…</Label>
 * </Collapsible>
 * ```
 */
export function Collapsible({
  open,
  defaultOpen = false,
  onToggle,
  children,
  ...rest
}: CollapsibleProps): ReactElement {
  const { isOpen, setOpen } = useDisclosure({ open, defaultOpen, onToggle });

  return createElement("ztui-collapsible", { ...rest, open: isOpen, onToggle: setOpen }, children);
}
Collapsible.displayName = "Collapsible";
