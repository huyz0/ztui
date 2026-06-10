import { createElement, useEffect, useSyncExternalStore } from "react";
import { type Toast, type ToastLevel, ToastManager, toast } from "../../../core/toast.ts";
import type { WidgetStyles } from "../../../dom/widget.ts";
import { Box } from "../layout/box.tsx";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { Label } from "../text/label.tsx";
import { useLayer } from "./use-layer.ts";

/** Screen corner the toast stack is pinned to. */
export type ToastPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";

/** Glyph style for the per-level icon, matching the status widgets' sets. */
export type ToastGlyphSet = "unicode" | "ascii" | "emoji";

export interface ToastHostProps {
  /** Corner to stack toasts in. Defaults to `top-right`. */
  position?: ToastPosition;
  /** Maximum toasts shown at once; the rest collapse into a "+N more" row. */
  max?: number;
  /** Width of each toast box (columns). Defaults to 36. */
  width?: number;
  /** Icon glyph set. Defaults to `unicode`. */
  glyphSet?: ToastGlyphSet;
}

const GLYPHS: Record<ToastGlyphSet, Record<ToastLevel, string>> = {
  unicode: { info: "ℹ", success: "✔", warn: "⚠", error: "✖", generic: "•" },
  ascii: { info: "i", success: "+", warn: "!", error: "x", generic: "*" },
  emoji: { info: "ℹ️", success: "✅", warn: "⚠️", error: "❌", generic: "🔔" },
};

/** Close affordance glyph per set. */
const CLOSE: Record<ToastGlyphSet, string> = { unicode: "✕", ascii: "x", emoji: "✕" };

/** Theme token per level, used for the border and title color. */
const LEVEL_COLOR: Record<ToastLevel, string> = {
  info: "$primary",
  success: "$success",
  warn: "$warning",
  error: "$error",
  generic: "$accent",
};

const isTop = (p: ToastPosition) => p === "top-right" || p === "top-left";
const isRight = (p: ToastPosition) => p === "top-right" || p === "bottom-right";

/** Pin the stack to a corner via the offsets OverlayRootWidget reads when unanchored. */
function cornerStyle(position: ToastPosition): WidgetStyles {
  return {
    ...(isTop(position) ? { top: 0 } : { bottom: 0 }),
    ...(isRight(position) ? { right: 1 } : { left: 1 }),
  };
}

function ToastItem({
  toast: t,
  width,
  glyphSet,
}: {
  toast: Toast;
  width: number;
  glyphSet: ToastGlyphSet;
}) {
  // Auto-dismiss timer lives with the item so it's cleaned up on unmount.
  useEffect(() => {
    if (t.duration <= 0) return;
    const handle = setTimeout(() => ToastManager.getInstance().dismiss(t.id), t.duration);
    return () => clearTimeout(handle);
  }, [t.id, t.duration]);

  // Neutral panel background (no border) keeps the stack calm; the level color
  // lives only in the icon. The icon sits in a fixed 2-cell column so a wide
  // glyph can't crowd the text, and an ✕ on the top-right dismisses this toast.
  const color = LEVEL_COLOR[t.level];
  return (
    <Box
      style={{
        width,
        background: "$panel",
        color: "$foreground",
        padding: { left: 1, right: 1 },
        margin: { bottom: 1 },
      }}
    >
      <HBox>
        <Label style={{ bold: true, width: 2, color }}>{GLYPHS[glyphSet][t.level]}</Label>
        <VBox style={{ flexGrow: 1, margin: { left: 1 } }}>
          {t.title ? <Label style={{ bold: true }}>{t.title}</Label> : null}
          <Label>{t.message}</Label>
        </VBox>
        <Label
          onClick={() => toast.dismiss(t.id)}
          style={{ color: "$placeholder", margin: { left: 1 } }}
        >
          {CLOSE[glyphSet]}
        </Label>
      </HBox>
    </Box>
  );
}

/**
 * Renders the active toasts as a stacked, non-modal overlay pinned to a screen
 * corner. Mount it once near the root of your app; raise toasts from anywhere
 * with the {@link toast} façade (or {@link useToast}).
 *
 * It never steals focus and lets clicks pass through to the UI beneath, except
 * on a toast itself — clicking a toast dismisses it. Toasts auto-dismiss after
 * their duration (errors stay until dismissed).
 *
 * ```tsx
 * <ToastHost position="top-right" />
 * // elsewhere:
 * toast.success("Saved");
 * ```
 */
export function ToastHost({
  position = "top-right",
  max = 5,
  width = 36,
  glyphSet = "unicode",
}: ToastHostProps) {
  const mgr = ToastManager.getInstance();
  const toasts = useSyncExternalStore(
    (cb) => mgr.subscribe(cb),
    () => mgr.getToasts(),
    () => mgr.getToasts(),
  );

  const rootRef = useLayer({
    open: toasts.length > 0,
    modal: false,
    centered: false,
    dim: false,
    passThrough: true,
    closeOnEscape: false,
    closeOnOutsideClick: false,
  });

  if (toasts.length === 0) return null;

  const overflow = Math.max(0, toasts.length - max);
  // Newest nearest the anchored edge: prepend for top corners, append for bottom.
  const recent = toasts.slice(toasts.length - max);
  const ordered = isTop(position) ? [...recent].reverse() : recent;

  // One footer row: "+N more" on the left, a "clear all" link on the right.
  // Shown once there's more than one toast (the only time clearing all helps).
  const footer =
    toasts.length > 1 ? (
      <HBox key="footer" style={{ width }}>
        {overflow > 0 ? <Label style={{ dim: true }}>{`+${overflow} more`}</Label> : null}
        <VBox style={{ flexGrow: 1 }} />
        <Label onClick={() => toast.clear()} style={{ underline: true, color: "$placeholder" }}>
          {`${CLOSE[glyphSet]} clear all`}
        </Label>
      </HBox>
    ) : null;

  return createElement(
    "ztui-overlay-root",
    { ref: rootRef },
    <VBox style={cornerStyle(position)}>
      {isTop(position) ? null : footer}
      {ordered.map((t) => (
        <ToastItem key={t.id} toast={t} width={width} glyphSet={glyphSet} />
      ))}
      {isTop(position) ? footer : null}
    </VBox>,
  );
}

/** Hook returning the imperative {@link toast} façade for use inside components. */
export function useToast() {
  return toast;
}
