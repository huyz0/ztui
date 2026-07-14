import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { Screen } from "../../../dom/screen.ts";
import type { Widget } from "../../../dom/widget.ts";
import type { MenuItem } from "../../../widgets/controls/menu.ts";
import { Button } from "../controls/button.tsx";
import { ButtonGroup } from "../controls/button-group.tsx";
import { Input } from "../controls/input.tsx";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { ContextMenu, useContextMenu } from "../overlay/context-menu.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";

/** Visual emphasis of an action button, mapped to a theme colour. */
export type ApprovalTone = "default" | "primary" | "success" | "danger";

const TONE_COLOR: Record<ApprovalTone, string | undefined> = {
  default: undefined,
  primary: "$primary",
  success: "$success",
  danger: "$error",
};

/**
 * One action in an approval prompt — a button, an inline dropdown (`menu`), or a
 * free-text entry (`input`). Generic by design: `id` is whatever string you want
 * reported back, so prompts aren't limited to allow/deny.
 */
export interface ApprovalAction {
  /** Reported to `onAction` when chosen. */
  id: string;
  /** Button / menu-row text. */
  label: string;
  /** Leading glyph (e.g. `"✓"`, `"✗"`). Part of the label. */
  icon?: string;
  /** Single-character keyboard shortcut (case-insensitive). */
  key?: string;
  /** Colour emphasis. Defaults to `"default"`. */
  tone?: ApprovalTone;
  /** Sub-actions; when present this action renders as a dropdown (`▾`). */
  menu?: ApprovalAction[];
  /**
   * When set, choosing this action opens an inline text field instead of firing
   * immediately — for "let me type my own pattern". On submit, the typed value
   * is delivered (single mode: `onAction(id, value)`; batch "custom match": the
   * value is treated as a glob and `onMatch(value)` fires). Pass an object to set
   * the field's placeholder.
   */
  input?: boolean | { placeholder?: string };
}

/** A single tool call in a batch approval. */
export interface ApprovalCall {
  /** Stable id, reported back in the decision map. */
  id: string;
  /** Tool name, e.g. `"Bash"`. */
  name: string;
  /** One-line argument preview. */
  args?: string;
  /** Initial decision for this call. Defaults to `"allow"`. */
  defaultDecision?: "allow" | "deny";
  /**
   * Patterns this call satisfies — the choices the "Allow matching" dropdown
   * offers. The library is shell-agnostic on purpose: the host derives these
   * however it likes and the gate just groups/applies them. For a shell tool a
   * call running `rm -rf build` might carry `["Bash", "rm", "rm -rf *"]`; one
   * running `cat README` might carry `["Bash", "cat", "read-only"]` — so the
   * dropdown can offer "all rm", "all cat", a glob, or a semantic group, and
   * selecting one allows every call that lists it. Falls back to `[name]`. A
   * free-text "custom…" entry is also offered, glob-matched against `args`.
   */
  matches?: string[];
}

/** Default single-call actions: Allow / Deny / Always (a scope/pattern dropdown). */
export const DEFAULT_APPROVAL_ACTIONS: ApprovalAction[] = [
  { id: "allow", label: "Allow", icon: "✓", key: "a", tone: "success" },
  { id: "deny", label: "Deny", icon: "✗", key: "d", tone: "danger" },
  {
    id: "always",
    label: "Always",
    icon: "⧉",
    key: "s",
    tone: "primary",
    menu: [
      { id: "always-command", label: "this exact command", icon: "✓" },
      { id: "always-tool", label: "always this tool", icon: "✓" },
      {
        id: "always-pattern",
        label: "custom pattern…",
        icon: "≈",
        input: { placeholder: "e.g. ls *" },
      },
      { id: "always-session", label: "for this session", icon: "⏱" },
    ],
  },
];

/** Build the flat button label: `icon label (k) ▾`. */
function actionLabel(a: ApprovalAction): string {
  const icon = a.icon ? `${a.icon} ` : "";
  const key = a.key && a.key.length === 1 ? ` (${a.key})` : "";
  const caret = a.menu ? " ▾" : "";
  return `${icon}${a.label}${key}${caret}`;
}

export interface ApprovalPromptProps extends ComponentProps {
  /** The question, e.g. ``Allow Bash to run `npm test`?`` or `"Run 3 tools?"`. */
  prompt: string;
  /** Detail body for a single-call prompt (a command preview or diff). */
  children?: ReactNode;
  /** Action buttons. Defaults to {@link DEFAULT_APPROVAL_ACTIONS}. */
  actions?: ApprovalAction[];
  /** Fired with an action's `id`; `value` is the typed text for an `input` action. */
  onAction?: (id: string, value?: string) => void;
  /**
   * Batch mode: the tool calls to approve. When set, the prompt lists each call
   * with a per-row allow/deny toggle and a batch action row.
   */
  calls?: ApprovalCall[];
  /** Fired in batch mode with the final per-call decision map (on Apply / all). */
  onResolve?: (decisions: Record<string, "allow" | "deny">) => void;
  /**
   * Fired in batch mode when an "Allow matching" pattern is chosen (a listed
   * pattern or a typed custom one), so the host can persist a standing rule. The
   * matching calls are also flipped to allow in the list.
   */
  onMatch?: (pattern: string) => void;
  /** Whether `Esc` denies (single: the `deny` action; batch: deny all). Default true. */
  denyOnEscape?: boolean;
  /** Draw a border around the prompt. Defaults to `true`. */
  bordered?: boolean;
  /**
   * Focus the action row as soon as the gate appears, so the keyboard is ready
   * (arrow between actions, Enter to choose) without Tabbing to it first.
   * Defaults to `true` — a permission gate is modal. Set `false` to leave focus
   * where it was (e.g. several gates on screen at once).
   */
  autoFocus?: boolean;
}

/** Walk up from a widget to its `Screen` and focus it there. */
function focusInScreen(w: Widget | null | undefined): void {
  if (!w) return;
  let p: Widget | null = w;
  while (p && !(p instanceof Screen)) p = p.parent as Widget | null;
  if (p instanceof Screen) p.focusWidget(w);
}

/**
 * An approval gate for agent tool calls. Single mode shows a prompt, an optional
 * detail body, and a row of action buttons (each with an icon + hotkey; an
 * action with sub-actions becomes an inline `▾` dropdown, and an `input` action
 * opens a field so the user can type their own pattern). Batch mode — pass
 * `calls` — lists every requested call with a clickable allow/deny toggle, plus
 * Allow-all / Deny-all / Allow-matching (incl. a custom glob) / Apply.
 *
 * Buttons are click- and Tab-focusable (Enter/Space activates); single-key
 * shortcuts and `Esc` fire while focus is anywhere in the prompt (a modal gate:
 * it captures keys so they don't leak to the app behind it). Layout is tight —
 * no blank rows — so it stays cheap on terminal real estate.
 */
export function ApprovalPrompt({
  prompt,
  children,
  actions = DEFAULT_APPROVAL_ACTIONS,
  onAction,
  calls,
  onResolve,
  onMatch,
  denyOnEscape = true,
  bordered = true,
  autoFocus = true,
  ...rest
}: ApprovalPromptProps): ReactElement {
  const isBatch = calls != null;
  const menu = useContextMenu();
  const [openMenu, setOpenMenu] = useState<ApprovalAction | null>(null);
  // The action currently collecting free text (its inline field is shown).
  const [inputAction, setInputAction] = useState<ApprovalAction | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "allow" | "deny">>(() =>
    Object.fromEntries((calls ?? []).map((c) => [c.id, c.defaultDecision ?? "allow"])),
  );
  // The lazy initializer above only runs once, at mount. A host that keeps one
  // ApprovalPrompt mounted across a session and re-renders it with a *new*
  // batch of calls (e.g. a second round of approvals) would otherwise leave
  // every new call id missing from `decisions` — reading as denied regardless
  // of its own defaultDecision. Seed just the ids not seen yet; existing
  // decisions (including ones the user already toggled) are left alone.
  useEffect(() => {
    if (!calls) return;
    setDecisions((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const c of calls) {
        if (!(c.id in next)) {
          next[c.id] = c.defaultDecision ?? "allow";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [calls]);
  const btnRefs = useRef<Record<string, Widget | null>>({});
  const inputRef = useRef<Widget | null>(null);

  // Focus the field as soon as it appears, so the user can type immediately.
  useEffect(() => {
    if (inputAction) focusInScreen(inputRef.current);
  }, [inputAction]);

  // Grab focus for the action row when the gate mounts (and after the inline
  // field closes), so the keyboard is ready without Tabbing in. The first action
  // button is the group's initial tab stop; focusing it lets arrows take over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: focus the row on mount and when returning from input mode
  useEffect(() => {
    if (!autoFocus || inputAction) return;
    const first = (isBatch ? batchActions : actions)[0];
    if (first) focusInScreen(btnRefs.current[first.id]);
  }, [autoFocus, inputAction]);

  const resolveAll = (d: "allow" | "deny") =>
    onResolve?.(Object.fromEntries((calls ?? []).map((c) => [c.id, d])));

  const batchActions: ApprovalAction[] = isBatch
    ? [
        { id: "__allow-all", label: "Allow all", icon: "✓", key: "a", tone: "success" },
        { id: "__deny-all", label: "Deny all", icon: "✗", key: "d", tone: "danger" },
        {
          id: "__allow-matching",
          label: "Allow matching",
          icon: "≈",
          key: "m",
          menu: [
            ...distinctMatches(calls ?? []).map((pat) => ({
              id: `__match:${pat}`,
              label: pat.includes(" ") ? pat : `all ${pat}`,
              icon: "✓",
            })),
            {
              id: "__match-custom",
              label: "custom…",
              icon: "≈",
              input: { placeholder: "e.g. ls *" },
            },
          ],
        },
        { id: "__apply", label: "Apply", icon: "⏎", key: "enter", tone: "primary" },
      ]
    : [];

  const rowActions = isBatch ? batchActions : actions;

  // Allow every call that lists `pattern` exactly (a grouped match).
  const allowByMatch = (pattern: string) =>
    setDecisions((prev) => {
      const next = { ...prev };
      for (const c of calls ?? [])
        if ((c.matches ?? [c.name]).includes(pattern)) next[c.id] = "allow";
      return next;
    });

  // Allow every call whose args glob-match a user-typed pattern.
  const allowByGlob = (pattern: string) => {
    const re = globToRegExp(pattern.trim());
    setDecisions((prev) => {
      const next = { ...prev };
      for (const c of calls ?? []) if (re.test(c.args ?? "")) next[c.id] = "allow";
      return next;
    });
  };

  // Perform a chosen action (top-level button or a menu row).
  const perform = (a: ApprovalAction) => {
    if (a.input) {
      setInputAction(a);
      return;
    }
    if (isBatch) {
      if (a.id.startsWith("__match:")) {
        const pattern = a.id.slice("__match:".length);
        onMatch?.(pattern);
        allowByMatch(pattern);
      } else if (a.id === "__allow-all") resolveAll("allow");
      else if (a.id === "__deny-all") resolveAll("deny");
      else if (a.id === "__apply") onResolve?.(decisions);
    } else {
      onAction?.(a.id);
    }
  };

  // Top-level button: open its dropdown, else perform it.
  const activate = (a: ApprovalAction) => {
    if (a.menu) {
      const r = btnRefs.current[a.id]?.region;
      setOpenMenu(a);
      menu.openAt(r ? r.x : 0, r ? r.bottom : 0);
      return;
    }
    perform(a);
  };

  const selectMenu = (index: number) => {
    const item = openMenu?.menu?.[index];
    setOpenMenu(null);
    if (item) perform(item);
  };

  // Enter in the inline field. An empty value cancels (closes the field).
  const submitInput = (raw: string) => {
    const a = inputAction;
    const value = raw.trim();
    setInputAction(null);
    if (!a || !value) return;
    if (isBatch && a.id === "__match-custom") {
      onMatch?.(value);
      allowByGlob(value);
    } else {
      onAction?.(a.id, value);
    }
  };

  const onKey = (ev: any) => {
    if (ev.handled || inputAction) return;
    const pressed = String(ev.name ?? ev.key ?? "").toLowerCase();
    if (denyOnEscape && (pressed === "escape" || pressed === "esc")) {
      if (isBatch) resolveAll("deny");
      else if (actions.some((a) => a.id === "deny")) onAction?.("deny");
      ev.handled = true;
      return;
    }
    const hit = rowActions.find((a) => a.key && a.key.toLowerCase() === pressed);
    if (hit) {
      activate(hit);
      ev.handled = true;
    }
  };

  const toggleCall = (id: string) =>
    setDecisions((prev) => ({ ...prev, [id]: prev[id] === "allow" ? "deny" : "allow" }));

  const placeholder =
    typeof inputAction?.input === "object" ? inputAction.input.placeholder : undefined;

  return (
    <VBox
      {...rest}
      onKey={onKey}
      // A click anywhere in the gate (border/padding included) focuses the action
      // row, mirroring the mount autoFocus — so the keyboard is always ready.
      focusOnClick={autoFocus}
      style={{
        ...(bordered ? { border: "rounded" } : {}),
        padding: { left: 1, right: 1 },
        ...rest.style,
      }}
    >
      <Label style={{ bold: true }}>{prompt}</Label>

      {isBatch
        ? (calls ?? []).map((c) => {
            const allow = decisions[c.id] === "allow";
            return (
              <HBox
                key={c.id}
                onClick={() => toggleCall(c.id)}
                style={{ width: "100%", height: 1 }}
              >
                <Label style={{ color: allow ? "$success" : "$error", width: 2 }}>
                  {allow ? "✓" : "✗"}
                </Label>
                <Label style={{ bold: true }}>{c.name}</Label>
                {c.args ? (
                  <Label style={{ color: "$dimmed", padding: { left: 1 } }}>{c.args}</Label>
                ) : undefined}
              </HBox>
            );
          })
        : children}

      {/* Either the inline custom-pattern field, or the action button row. The
          field is borderless + single-row so it stays inline (Input otherwise
          defaults to a 3-row rounded box). */}
      {inputAction ? (
        <HBox style={{ width: "100%", height: 1 }}>
          <Label style={{ color: "$dimmed", padding: { right: 1 } }}>{inputAction.label}</Label>
          <Input
            ref={inputRef}
            onSubmit={submitInput}
            onDismiss={() => setInputAction(null)}
            placeholder={placeholder}
            style={{ width: "1fr", height: 1, border: "none" }}
          />
        </HBox>
      ) : (
        // A roving-focus toolbar: the action buttons are one Tab stop and the
        // arrow keys move between them (Enter/Space activates; single-key
        // shortcuts and Esc are still caught by the prompt's `onKey`).
        <ButtonGroup style={{ height: 1 }}>
          {rowActions.map((a) => (
            <Button
              key={a.id}
              ref={(w: Widget | null) => {
                btnRefs.current[a.id] = w;
              }}
              onClick={() => activate(a)}
              style={{ color: TONE_COLOR[a.tone ?? "default"], margin: { right: 1 } }}
            >
              {actionLabel(a)}
            </Button>
          ))}
        </ButtonGroup>
      )}

      <ContextMenu
        {...menu.props}
        items={(openMenu?.menu ?? []).map((m): MenuItem => ({ label: m.label, icon: m.icon }))}
        onSelect={(_item, index) => selectMenu(index)}
        onClose={() => {
          menu.close();
          setOpenMenu(null);
        }}
      />
    </VBox>
  );
}
ApprovalPrompt.displayName = "ApprovalPrompt";

/**
 * The union of every call's match patterns (falling back to its tool name), in
 * first-seen order — drives the "Allow matching" dropdown.
 */
function distinctMatches(calls: ApprovalCall[]): string[] {
  const seen: string[] = [];
  for (const c of calls) {
    for (const pat of c.matches ?? [c.name]) if (!seen.includes(pat)) seen.push(pat);
  }
  return seen;
}

/** A minimal glob → RegExp: `*` matches any run, `?` any single char. */
function globToRegExp(glob: string): RegExp {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}
