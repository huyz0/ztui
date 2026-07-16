import { useState } from "react";

export interface UseDisclosureOptions {
  /** Controlled open state. Omit to let the hook manage it internally. */
  open?: boolean;
  /** Initial open state when uncontrolled. Defaults to `false`. */
  defaultOpen?: boolean;
  /** Fired with the next open state on {@link UseDisclosureResult.toggle}/`setOpen`. */
  onToggle?: (open: boolean) => void;
}

export interface UseDisclosureResult {
  isOpen: boolean;
  /** Whether `open` was passed — the caller owns the state, this hook just mirrors it. */
  isControlled: boolean;
  /** Sets the state explicitly and fires `onToggle` — for callers that already
   * know the next value (e.g. a widget event carrying its own next-open flag). */
  setOpen: (next: boolean) => void;
  /** Flips the current state and fires `onToggle` — for a plain click handler. */
  toggle: () => void;
  /** Sets the state without firing `onToggle` — for internal effects (e.g.
   * auto-expand-while-active) that shouldn't read as a user-driven toggle. */
  setOpenSilently: (next: boolean) => void;
}

/**
 * The controlled/uncontrolled open-state pattern shared by every
 * disclosure-style component (Collapsible, ToolCall, Reasoning): tracks an
 * internal boolean, but defers to a caller-supplied `open` when present, so
 * the component works either way without the state logic duplicated per file.
 */
export function useDisclosure({
  open,
  defaultOpen = false,
  onToggle,
}: UseDisclosureOptions): UseDisclosureResult {
  const [internal, setInternal] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? (open as boolean) : internal;

  const setOpenSilently = (next: boolean) => {
    if (!isControlled) setInternal(next);
  };

  const setOpen = (next: boolean) => {
    setOpenSilently(next);
    onToggle?.(next);
  };

  const toggle = () => setOpen(!isOpen);

  return { isOpen, isControlled, setOpen, toggle, setOpenSilently };
}
