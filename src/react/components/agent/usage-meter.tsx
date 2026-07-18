import { type ReactElement, type ReactNode, useRef, useState } from "react";
import type { Widget } from "../../../dom/widget.ts";
import { Box } from "../layout/box.tsx";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { useHotkey } from "../overlay/hotkey-palette.tsx";
import { Popover } from "../overlay/popover.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";

/** Token counts for a turn or a whole session. */
export interface TokenUsage {
  /** Input (prompt) tokens. */
  input: number;
  /** Output (completion) tokens. */
  output: number;
  /** Input tokens served from the prompt cache (a cache *hit*). */
  cacheRead?: number;
  /** Input tokens written to the prompt cache (cache *creation*). */
  cacheWrite?: number;
}

export interface UsageMeterProps extends ComponentProps {
  /** Last turn's token usage. */
  turn?: TokenUsage;
  /** Cumulative session token usage. */
  session?: TokenUsage;
  /** Context-window capacity, in tokens (e.g. 200_000). */
  contextSize?: number;
  /** Current context-window fill, in tokens. */
  contextUsed?: number;
  /** Session cost in USD. Omit when cost can't be computed — it's then hidden. */
  cost?: number;
  /** `"full"` = three tight rows (default); `"compact"` = a single dense line. */
  variant?: "full" | "compact";
  /**
   * In `compact` mode, clicking the line (or pressing {@link expandKey}) opens
   * the full meter in a popover (Esc / outside-click closes). Defaults to `true`.
   */
  expandable?: boolean;
  /** Optional hotkey to open the full popover from `compact` mode (e.g. `"ctrl+u"`). */
  expandKey?: string;
}

/** Abbreviate a token count: `940`, `1.2k`, `45k`, `1.3M`. */
function fmt(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  if (k < 100) return `${(k % 1 === 0 ? k : k.toFixed(1)).toString().replace(/\.0$/, "")}k`;
  if (k < 1000) return `${Math.round(k)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}

const pct = (num: number, den: number) => (den > 0 ? num / den : 0);

/** A green→amber→red colour by how full something is (context, cost pressure). */
function fillColor(ratio: number): string {
  if (ratio >= 0.85) return "$error";
  if (ratio >= 0.6) return "$warning";
  return "$success";
}

/** Higher cache hit-rate is better (cheaper/faster) → green; low → dim. */
function cacheColor(ratio: number): string {
  if (ratio >= 0.5) return "$success";
  if (ratio >= 0.2) return "$warning";
  return "$dimmed";
}

/** A tiny N-cell block bar (`████░░░░`). */
function bar(ratio: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function inOut(u: TokenUsage): ReactNode {
  const read = pct(u.cacheRead ?? 0, u.input);
  const write = pct(u.cacheWrite ?? 0, u.input);
  return (
    <>
      <Label style={{ color: "$accent" }}>↑{fmt(u.input)}</Label>
      <Label style={{ color: "$primary", padding: { left: 1 } }}>↓{fmt(u.output)}</Label>
      {/* Prompt-cache hit (read) and creation (write) ratios of the input.
          "▦"/"▨" (plain geometric-shape glyphs), not emoji like "💾"/"✍" —
          those render two cells wide and colored in many terminal fonts,
          crowding into the adjacent number with no room for a gap. */}
      {u.cacheRead != null ? (
        <Label style={{ color: cacheColor(read), padding: { left: 1 } }}>
          ▦{Math.round(read * 100)}%
        </Label>
      ) : undefined}
      {u.cacheWrite != null ? (
        <Label style={{ color: "$dimmed", padding: { left: 1 } }}>
          ▨{Math.round(write * 100)}%
        </Label>
      ) : undefined}
    </>
  );
}

/**
 * A compact token-usage meter for an agent status line: last-turn and
 * whole-session input/output tokens, prompt-cache hit rate, optional cost, and a
 * context-window fill bar — colour-coded (green→amber→red as context fills) with
 * `↑`/`↓` for in/out and `▦`/`▭` glyphs. Three tight rows by default, or a
 * single dense line with `variant="compact"`.
 *
 * ```tsx
 * <UsageMeter
 *   turn={{ input: 1234, output: 340, cacheRead: 840 }}
 *   session={{ input: 45000, output: 12000, cacheRead: 32000 }}
 *   contextSize={200_000} contextUsed={78_000} cost={0.12}
 * />
 * ```
 */
export function UsageMeter({
  turn,
  session,
  contextSize,
  contextUsed,
  cost,
  variant = "full",
  expandable = true,
  expandKey,
  ...rest
}: UsageMeterProps): ReactElement {
  const ctxRatio = contextSize ? pct(contextUsed ?? 0, contextSize) : 0;
  // "$" (plain ASCII), not the emoji "💲" — same two-cell/colored-glyph issue.
  const costLabel = cost != null ? `$${cost.toFixed(2)}` : undefined;

  const anchorRef = useRef<Widget | null>(null);
  const [open, setOpen] = useState(false);
  const canExpand = expandable && (turn != null || session != null || contextSize != null);

  useHotkey({
    key: expandKey ?? "",
    name: "Show usage details",
    group: "View",
    enabled: () => !!expandKey && canExpand,
    handler: () => setOpen((o) => !o),
  });

  if (variant === "compact") {
    return (
      <>
        <HBox
          {...rest}
          ref={anchorRef}
          onClick={canExpand ? () => setOpen(true) : undefined}
          style={{ width: "100%", height: 1, ...rest.style }}
        >
          {turn ? (
            <>
              <Label style={{ color: "$dimmed" }}>⟳ </Label>
              {inOut(turn)}
            </>
          ) : undefined}
          {session ? (
            <>
              <Label style={{ color: "$dimmed", padding: { left: 1 } }}>· Σ </Label>
              {inOut(session)}
            </>
          ) : undefined}
          {costLabel ? <Label style={{ padding: { left: 1 } }}>{costLabel}</Label> : undefined}
          {contextSize ? (
            <Label style={{ color: fillColor(ctxRatio), padding: { left: 1 } }}>
              {/* "▭" (plain rectangle), not the emoji "🪟" — same issue. */}· ▭
              {fmt(contextUsed ?? 0)}/{fmt(contextSize)} {Math.round(ctxRatio * 100)}%
            </Label>
          ) : undefined}
        </HBox>
        {canExpand ? (
          <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)}>
            <Box style={{ padding: { left: 1, right: 1 } }}>
              <UsageMeter
                variant="full"
                turn={turn}
                session={session}
                contextSize={contextSize}
                contextUsed={contextUsed}
                cost={cost}
                style={{ width: "auto" }}
              />
            </Box>
          </Popover>
        ) : undefined}
      </>
    );
  }

  return (
    <VBox {...rest} style={{ width: "100%", ...rest.style }}>
      {turn ? (
        <HBox style={{ width: "100%", height: 1 }}>
          <Label style={{ color: "$dimmed", width: 10 }}>⟳ Turn</Label>
          {inOut(turn)}
        </HBox>
      ) : undefined}
      {session ? (
        <HBox style={{ width: "100%", height: 1 }}>
          <Label style={{ color: "$dimmed", width: 10 }}>Σ Session</Label>
          {inOut(session)}
          {costLabel ? <Label style={{ padding: { left: 1 } }}>{costLabel}</Label> : undefined}
        </HBox>
      ) : undefined}
      {contextSize ? (
        <HBox style={{ width: "100%", height: 1 }}>
          <Label style={{ color: "$dimmed", width: 10 }}>▭ Ctx</Label>
          <Label style={{ color: "$foreground" }}>
            {fmt(contextUsed ?? 0)}/{fmt(contextSize)}
          </Label>
          <Label style={{ color: fillColor(ctxRatio), padding: { left: 1 } }}>
            {bar(ctxRatio)}
          </Label>
          <Label style={{ color: fillColor(ctxRatio), padding: { left: 1 } }}>
            {Math.round(ctxRatio * 100)}%
          </Label>
        </HBox>
      ) : undefined}
    </VBox>
  );
}
UsageMeter.displayName = "UsageMeter";
