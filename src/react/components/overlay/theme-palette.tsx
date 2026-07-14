import { createElement, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { App } from "../../../core/app.ts";
import { formatKeyLabel, normalizeKey } from "../../../core/hotkeys.ts";
import { Offset } from "../../../geometry/offset.ts";
import { type Theme, ThemeManager } from "../../../theme.ts";
import { Input } from "../controls/input.tsx";
import { Box } from "../layout/box.tsx";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { Label } from "../text/label.tsx";
import { useHotkey } from "./hotkey-palette.tsx";
import { useLayer } from "./use-layer.ts";

/** Props for the ThemePalette picker. */
export interface ThemePaletteProps {
  /**
   * Key that toggles the picker. Defaults to `"ctrl+t"` — a single
   * cross-platform binding that reaches the app on every terminal (it's a C0
   * control byte). It avoids the pitfalls of the alternatives: `Ctrl+Alt+T`
   * collides with OS global shortcuts (open-terminal on Linux, app hotkeys on
   * Windows), `F9` isn't delivered by some terminals (e.g. Windows Terminal),
   * and `Cmd+T` is swallowed by macOS terminals for "new tab" before it ever
   * reaches the program. The binding is also listed in the command palette
   * ("Change theme"); pass another key (e.g. `"ctrl+k"`) to rebind.
   */
  toggleKey?: string;
  /** Heading shown in the title bar. Defaults to `"Themes"`. */
  title?: string;
  /** Panel width in columns. Defaults to 78 (fits a 3-card row). */
  width?: number;
  /**
   * Maximum theme cards shown at once before the grid scrolls. Defaults to 12
   * (4 rows of 3); rounded down to a whole number of rows.
   */
  maxVisible?: number;
  /** Filter input placeholder. */
  placeholder?: string;
  /**
   * Controlled active theme by name. When set, the picker keeps the app on this
   * theme and re-applies it whenever the prop changes — pair it with
   * {@link onSelect} to persist and restore the user's choice (e.g. from
   * `localStorage` or a config file):
   *
   * ```tsx
   * const [theme, setTheme] = useState(() => load() ?? "default-dark");
   * <ThemePalette value={theme} onSelect={(t) => { setTheme(t.name); save(t.name); }} />
   * ```
   */
  value?: string;
  /** Initial theme by name, applied once on mount (uncontrolled; ignored when `value` is set). */
  defaultValue?: string;
  /** Called with the theme each time one is applied (Enter or click) — the hook for persisting it. */
  onSelect?: (theme: Theme) => void;
}

/** Clip to `max` columns with an ellipsis so rows can't cross the border. */
function truncate(text: string, max: number): string {
  if (max <= 0) return "";
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** The accent swatch strip shown on each card. */
const SWATCH_KEYS = ["primary", "secondary", "accent", "success", "warning", "error"] as const;
/** Cards per row in the picker grid. */
const COLS = 3;
/** Card height in cells (border 2 + name + example/swatch line). */
const CARD_H = 4;

/**
 * One theme rendered as a compact card painted in its *own* colors — read from
 * `theme.colors.*` (not `$primary`/`$surface`, which only reflect the active
 * theme), so every card previews itself even though only one theme is active.
 * The selected card gets a double border + chevron; the active theme a dot.
 */
function ThemeCard({
  theme,
  selected,
  active,
  width,
  onPick,
}: {
  theme: Theme;
  selected: boolean;
  active: boolean;
  width: number;
  onPick: (theme: Theme) => void;
}) {
  const c = theme.colors;
  const marker = active ? "● " : selected ? "❯ " : "  ";
  const inner = width - 4; // border (2) + horizontal padding (2)
  return (
    <Box
      onClick={() => onPick(theme)}
      style={{
        width,
        border: selected ? "double" : "rounded",
        borderColor: selected ? c.primary : c.surface,
        background: c.background,
        padding: { left: 1, right: 1 },
        margin: { right: 1 },
      }}
    >
      <VBox>
        {/* Title — the theme's foreground on its own backdrop. */}
        <Label style={{ color: c.foreground, bold: selected }}>
          {marker}
          {truncate(theme.name, inner - 2)}
        </Label>
        {/* Example (a `Run` button) + palette swatch strip, both self-colored. */}
        <HBox>
          <Label style={{ background: c.primary, color: c.background, bold: true }}>
            {" Run "}
          </Label>
          <HBox style={{ margin: { left: 1 } }}>
            {SWATCH_KEYS.map((key) => (
              <Label key={key} style={{ color: c[key] }}>
                {"██"}
              </Label>
            ))}
          </HBox>
        </HBox>
      </VBox>
    </Box>
  );
}

/**
 * A visual theme picker styled after {@link HotkeyPalette}. Mount it once near
 * the root; it registers its own toggle binding and opens as a modal dialog.
 * Moving the selection previews the theme live across the whole app; Enter
 * keeps it, Esc (or an outside click) reverts to the theme that was active
 * when the picker opened.
 *
 * ```tsx
 * <ThemePalette />                    // Ctrl+T
 * <ThemePalette toggleKey="ctrl+k" />
 * ```
 */
export function ThemePalette({
  toggleKey = "ctrl+t",
  title = "Themes",
  width = 78,
  maxVisible = 12,
  placeholder = "Type to filter themes…",
  value,
  defaultValue,
  onSelect,
}: ThemePaletteProps) {
  const manager = ThemeManager.getInstance();

  // Bind the active theme to `value` (controlled) or `defaultValue` (applied
  // once). Restoring a persisted choice is just passing it as `value`.
  const initialized = useRef(false);
  useEffect(() => {
    if (value != null) {
      if (value !== manager.getActiveThemeName()) manager.setTheme(value);
    } else if (!initialized.current && defaultValue) {
      if (defaultValue !== manager.getActiveThemeName()) manager.setTheme(defaultValue);
    }
    initialized.current = true;
  }, [manager, value, defaultValue]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  // Theme active when the picker opened, restored on cancel.
  const revertTo = useRef<string | null>(null);
  // Entries shown per window (a whole number of card rows).
  const winSize = Math.max(COLS, Math.floor(maxVisible / COLS) * COLS);

  useHotkey({
    key: toggleKey,
    name: "Change theme",
    description: "Pick a color theme with live preview",
    group: "Help",
    handler: () => {
      setOpen((wasOpen) => {
        if (!wasOpen) {
          revertTo.current = manager.getActiveThemeName();
          const all = manager.listThemes();
          setQuery("");
          setSelected(
            Math.max(
              0,
              all.findIndex((t) => t.name === manager.getActiveThemeName()),
            ),
          );
        }
        return !wasOpen;
      });
    },
  });

  const themes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = manager.listThemes();
    return q ? all.filter((t) => t.name.toLowerCase().includes(q)) : all;
  }, [manager, query]);
  const sel = Math.min(selected, Math.max(0, themes.length - 1));

  const preview = (index: number) => {
    const theme = themes[index];
    if (theme) manager.setTheme(theme.name);
  };

  // Step the selection by `delta` entries (clamped) and live-preview it. Shared
  // by keyboard nav and the mouse wheel. The side-effecting `preview` call
  // must stay outside the `setSelected` updater: React (StrictMode, and
  // future concurrent-render replay) may invoke an updater more than once to
  // check purity, which would apply the theme twice per step.
  const moveBy = (delta: number) => {
    const last = Math.max(0, themes.length - 1);
    const next = Math.max(0, Math.min(last, Math.min(selected, last) + delta));
    setSelected(next);
    preview(next);
  };

  // Enter/click *commits* a theme but keeps the picker open so it can be seen
  // applied. Committing makes it the new baseline, so a later Esc keeps it
  // (rather than reverting) — while still-uncommitted browsing previews revert.
  const confirm = (theme: Theme) => {
    manager.setTheme(theme.name);
    revertTo.current = theme.name;
    onSelect?.(theme);
  };

  // Clicking a card also moves the cursor highlight to it, then commits.
  const pick = (theme: Theme) => {
    const idx = themes.findIndex((t) => t.name === theme.name);
    if (idx >= 0) setSelected(idx);
    confirm(theme);
  };

  const cancel = () => {
    if (revertTo.current) manager.setTheme(revertTo.current);
    revertTo.current = null;
    setOpen(false);
  };

  const rootRef = useLayer({
    open,
    modal: true,
    centered: true,
    dim: true,
    passThrough: false,
    closeOnEscape: true,
    // Only Esc closes — clicking a card applies it but keeps the picker open so
    // the user can see the theme before leaving.
    closeOnOutsideClick: false,
    onClose: cancel,
    keyInterceptor: (ev) => {
      const step: Record<string, number> = {
        left: -1,
        right: 1,
        up: -COLS,
        down: COLS,
        pageup: -winSize,
        pagedown: winSize,
      };
      if (ev.key in step) {
        moveBy(step[ev.key]);
        ev.handled = true;
      } else if (ev.key === "enter" && themes[sel]) {
        confirm(themes[sel]);
        ev.handled = true;
      }
    },
  });

  // Height of the scrollable grid: a whole number of card rows.
  const viewRows = Math.max(1, Math.floor(winSize / COLS));
  const viewH = viewRows * CARD_H;
  // Ref to the scrollable-box widget so keyboard moves can scroll the selected
  // card into view (the box scrolls freely on its own for wheel/scrollbar).
  const gridRef = useRef<any>(null);

  useEffect(() => {
    const box = gridRef.current;
    if (!open || !box) return;
    const rowTop = Math.floor(Math.max(0, sel) / COLS) * CARD_H;
    const cur = box.scrollOffset?.y ?? 0;
    let y = cur;
    if (rowTop < y) y = rowTop;
    else if (rowTop + CARD_H > y + viewH) y = rowTop + CARD_H - viewH;
    y = Math.max(0, y);
    if (y !== cur) {
      box.scrollOffset = new Offset(box.scrollOffset?.x ?? 0, y);
      App.instance?.queueRender("theme-palette:ensure-visible");
    }
  }, [open, sel, viewH]);

  if (!open) return null;

  const innerWidth = width - 4; // border (2) + horizontal padding (2)
  // Cards share the inner width with a one-cell gap between columns.
  const cardW = Math.max(12, Math.floor(innerWidth / COLS) - 1);
  const activeName = revertTo.current ?? manager.getActiveThemeName();

  // Every theme as a row of cards; the ScrollableBox clips + scrolls them.
  const rows: ReactNode[] = [];
  for (let r = 0; r < themes.length; r += COLS) {
    const cells: ReactNode[] = [];
    for (let i = 0; i < COLS; i++) {
      const theme = themes[r + i];
      if (!theme) continue;
      cells.push(
        <ThemeCard
          key={theme.name}
          theme={theme}
          selected={r + i === sel}
          active={theme.name === activeName}
          width={cardW}
          onPick={pick}
        />,
      );
    }
    rows.push(<HBox key={`row-${r}`}>{cells}</HBox>);
  }

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
          <VBox style={{ flexGrow: 1 }} />
          <Label style={{ dim: true }}>↑↓←→ move · ⏎/click apply · Esc close</Label>
        </HBox>
        <Input
          id="theme-palette-filter"
          placeholder={placeholder}
          value={query}
          onChange={(v) => {
            setQuery(v);
            setSelected(0);
          }}
        />
        {themes.length === 0 ? (
          <Label style={{ dim: true }}>No themes match your filter.</Label>
        ) : (
          // Direct createElement so the `ref` attaches to the widget (a
          // hostComponent wrapper would swallow it — function components can't
          // forward refs to the underlying instance). The rows are direct
          // column children so their stacked height (the scroll content) is
          // measured naturally; a wrapping flex child would be stretched to the
          // box height and leave nothing to scroll.
          createElement(
            "ztui-scrollable-box",
            {
              ref: gridRef,
              style: { height: viewH, overflowY: "auto", flexDirection: "column" },
            },
            rows,
          )
        )}
        <Label style={{ dim: true }}>
          {`  toggle with ${formatKeyLabel(normalizeKey(toggleKey))}`}
        </Label>
      </VBox>
    </Box>,
  );
}
