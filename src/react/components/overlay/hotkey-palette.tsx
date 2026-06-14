import {
  createElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  formatKeyLabel,
  type Hotkey,
  type HotkeyOptions,
  HotkeyRegistry,
  normalizeKey,
} from "../../../core/hotkeys.ts";
import type { KeyEvent } from "../../../driver/driver.ts";
import { Input } from "../controls/input.tsx";
import { Box } from "../layout/box.tsx";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { Label } from "../text/label.tsx";
import { useLayer } from "./use-layer.ts";

/**
 * Register a hotkey for the lifetime of the component. The handler is read
 * through a ref, so it can close over fresh state without re-registering.
 *
 * ```tsx
 * useHotkey({ key: "ctrl+s", name: "Save", group: "File", handler: save });
 * ```
 */
export function useHotkey(opts: HotkeyOptions): void {
  const handlerRef = useRef(opts.handler);
  handlerRef.current = opts.handler;
  const enabledRef = useRef(opts.enabled);
  enabledRef.current = opts.enabled;

  const contextKey = typeof opts.context === "string" ? opts.context : opts.context?.join("\0");
  // biome-ignore lint/correctness/useExhaustiveDependencies: contextKey stands in for opts.context
  useEffect(() => {
    return HotkeyRegistry.getInstance().register({
      ...opts,
      context: opts.context,
      enabled: opts.enabled ? () => enabledRef.current?.() ?? true : undefined,
      handler: (ev) => handlerRef.current(ev),
    });
  }, [opts.key, opts.name, opts.description, opts.group, contextKey, opts.hidden]);
}

/** Props for the HotkeyPalette overlay. */
export interface HotkeyPaletteProps {
  /**
   * Key that toggles the palette. Defaults to `"ctrl+space"` — recognized on
   * both legacy (NUL byte) and Kitty-protocol terminals, and rarely bound by
   * terminal emulators themselves. Pick another (e.g. `"f1"`, `"ctrl+k"`) if
   * your users live in tmux/emacs/IME setups where Ctrl+Space is taken.
   */
  toggleKey?: string;
  /** Heading shown in the palette title bar. Defaults to `"Commands"`. */
  title?: string;
  /** Panel width in columns. Defaults to 64. */
  width?: number;
  /** Maximum rows (group headers + commands) listed at once. Defaults to 14. */
  maxVisible?: number;
  /** Filter input placeholder. */
  placeholder?: string;
}

/** One flattened list row: a group header or a command. */
type Row = { kind: "header"; group: string } | { kind: "item"; hotkey: Hotkey; itemIndex: number };

function flattenRows(registry: HotkeyRegistry, query: string): { rows: Row[]; items: Hotkey[] } {
  const rows: Row[] = [];
  const items: Hotkey[] = [];
  for (const { group, hotkeys } of registry.groups({ query })) {
    rows.push({ kind: "header", group });
    for (const hotkey of hotkeys) {
      rows.push({ kind: "item", hotkey, itemIndex: items.length });
      items.push(hotkey);
    }
  }
  return { rows, items };
}

/** Clip to `max` columns with an ellipsis so rows can't cross the border. */
function truncate(text: string, max: number): string {
  if (max <= 0) return "";
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

function PaletteRow({
  row,
  selected,
  keyColWidth,
  innerWidth,
  onRun,
}: {
  row: Row;
  selected: boolean;
  keyColWidth: number;
  innerWidth: number;
  onRun: (hotkey: Hotkey) => void;
}) {
  if (row.kind === "header") {
    return (
      <Label style={{ bold: true, dim: true }}>
        {truncate(row.group.toUpperCase(), innerWidth)}
      </Label>
    );
  }
  const h = row.hotkey;
  // Color (not background) separates the columns: the key is bold accent text,
  // the name bold foreground, the description dim. Only the selected row gets a
  // quiet panel background as the cursor. Both text columns are truncated so a
  // long entry can never overflow the dialog border.
  const chipWidth = keyColWidth + 2;
  const name = truncate(h.name, innerWidth - chipWidth - 1);
  const descBudget = innerWidth - chipWidth - 1 - name.length - 1;
  const desc = h.description && descBudget > 4 ? truncate(`— ${h.description}`, descBudget) : null;
  return (
    <HBox onClick={() => onRun(h)} style={selected ? { background: "$panel" } : undefined}>
      <Label style={{ bold: true, width: chipWidth, color: "$accent" }}>
        {` ${h.keyLabel.padEnd(keyColWidth)} `}
      </Label>
      <Label style={{ bold: true, margin: { left: 1 } }}>{name}</Label>
      {desc ? <Label style={{ margin: { left: 1 }, dim: true }}>{desc}</Label> : null}
    </HBox>
  );
}

/**
 * A global command palette listing every registered hotkey by group, filterable
 * by name/description/group/key. Mount it once near the root; it registers its
 * own toggle binding (default Ctrl+Space) and opens as a modal dialog over the
 * UI. Arrow keys move the selection, Enter runs the selected command, Esc (or
 * an outside click) closes.
 *
 * ```tsx
 * <HotkeyPalette />            // Ctrl+Space
 * <HotkeyPalette toggleKey="f1" title="Shortcuts" />
 * ```
 */
export function HotkeyPalette({
  toggleKey = "ctrl+space",
  title = "Commands",
  width = 64,
  maxVisible = 14,
  placeholder = "Type to filter by name, description, or group…",
}: HotkeyPaletteProps) {
  const registry = HotkeyRegistry.getInstance();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  useSyncExternalStore(
    (cb) => registry.subscribe(cb),
    () => registry.version,
    () => registry.version,
  );

  useHotkey({
    key: toggleKey,
    name: "Command palette",
    description: "Show or hide this command list",
    group: "Help",
    // Keep the binding active but out of its own list — it's self-referential
    // noise, and the footer already shows the toggle key. This also means the
    // first real command is the default selection, so Enter on a fresh open
    // runs something useful instead of just closing the palette.
    hidden: true,
    handler: () => {
      setQuery("");
      setSelected(0);
      setOpen((v) => !v);
    },
  });

  const { rows, items } = useMemo(
    () => flattenRows(registry, query),
    // registry.version (read above) invalidates this via re-render
    [registry, query, registry.version],
  );
  const sel = Math.min(selected, Math.max(0, items.length - 1));

  const runHotkey = (hotkey: Hotkey) => {
    setOpen(false);
    // Run after the palette layer unmounts so a handler opening its own
    // dialog/layer stacks cleanly above the restored focus.
    const ev: KeyEvent = {
      key: hotkey.key,
      name: hotkey.key,
      ctrl: false,
      meta: false,
      shift: false,
    };
    queueMicrotask(() => hotkey.handler(ev));
  };

  const rootRef = useLayer({
    open,
    modal: true,
    centered: true,
    dim: true,
    passThrough: false,
    closeOnEscape: true,
    closeOnOutsideClick: true,
    onClose: () => setOpen(false),
    keyInterceptor: (ev) => {
      const last = Math.max(0, items.length - 1);
      // Clamp every move against the *current* item count via a functional
      // update, so navigation stays valid even if the list shrank (filter) or
      // grew since the last render, and never points past the end.
      const move = (to: (cur: number) => number) => {
        setSelected((cur) => Math.max(0, Math.min(last, to(Math.min(cur, last)))));
        ev.handled = true;
      };
      switch (ev.key) {
        case "up":
          move((c) => c - 1);
          break;
        case "down":
          move((c) => c + 1);
          break;
        case "pageup":
          move((c) => c - maxVisible);
          break;
        case "pagedown":
          move((c) => c + maxVisible);
          break;
        // Home/End are intentionally NOT intercepted: they move the filter
        // Input's text caret, which the focused field needs.
        case "enter":
          if (items[sel]) {
            runHotkey(items[sel]);
            ev.handled = true;
          }
          break;
      }
    },
  });

  if (!open) return null;

  const innerWidth = width - 4; // border (2) + horizontal padding (2)
  const keyColWidth = Math.max(...items.map((h) => h.keyLabel.length), 3);

  // Window the flat rows around the selected command so long catalogs scroll
  // inside a constant-height body: exactly `maxVisible` row slots are rendered
  // every frame (blank fillers when there are fewer rows), so the dialog never
  // resizes as the filter narrows and content can't overflow its border.
  const selRowIdx = rows.findIndex((r) => r.kind === "item" && r.itemIndex === sel);
  let start = 0;
  if (rows.length > maxVisible && selRowIdx >= 0) {
    start = Math.max(0, Math.min(selRowIdx - Math.floor(maxVisible / 2), rows.length - maxVisible));
  }
  const visible = rows.slice(start, start + maxVisible);
  const above = start;
  const below = rows.length - (start + visible.length);

  const slots: ReactNode[] = visible.map((row) => (
    <PaletteRow
      key={row.kind === "header" ? `g:${row.group}` : `h:${row.hotkey.id}`}
      row={row}
      selected={row.kind === "item" && row.itemIndex === sel}
      keyColWidth={keyColWidth}
      innerWidth={innerWidth}
      onRun={runHotkey}
    />
  ));
  if (items.length === 0) {
    slots.push(
      <Label key="empty" style={{ dim: true }}>
        No commands match your filter.
      </Label>,
    );
  }
  for (let i = slots.length; i < maxVisible; i++) {
    slots.push(<Label key={`pad-${i}`}> </Label>);
  }

  const context = registry.context;

  return createElement(
    "ztui-overlay-root",
    { ref: rootRef },
    <Box
      style={{
        border: "rounded",
        background: "$surface",
        color: "$foreground",
        padding: { left: 1, right: 1 },
        width,
      }}
    >
      <VBox>
        <HBox>
          <Label style={{ bold: true }}>{title}</Label>
          {context ? (
            <Label style={{ margin: { left: 1 }, dim: true }}>{`[${context}]`}</Label>
          ) : null}
          <VBox style={{ flexGrow: 1 }} />
          <Label style={{ dim: true }}>↑↓ select · ⏎ run · Esc close</Label>
        </HBox>
        <Input
          id="hotkey-palette-filter"
          placeholder={placeholder}
          value={query}
          onChange={(v) => {
            setQuery(v);
            setSelected(0);
          }}
        />
        <Label style={{ dim: true }}>{above > 0 ? `  ↑ ${above} more` : " "}</Label>
        {slots}
        <Label style={{ dim: true }}>
          {below > 0
            ? `  ↓ ${below} more`
            : `  toggle with ${formatKeyLabel(normalizeKey(toggleKey))}`}
        </Label>
      </VBox>
    </Box>,
  );
}
