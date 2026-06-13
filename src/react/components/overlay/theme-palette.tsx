import { createElement, type ReactNode, useMemo, useRef, useState } from "react";
import { formatKeyLabel, normalizeKey } from "../../../core/hotkeys.ts";
import { isThemeLight, type Theme, ThemeManager } from "../../../theme.ts";
import { Input } from "../controls/input.tsx";
import { Box } from "../layout/box.tsx";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { Label } from "../text/label.tsx";
import { useHotkey } from "./hotkey-palette.tsx";
import { useLayer } from "./use-layer.ts";

export interface ThemePaletteProps {
  /**
   * Key that toggles the picker. Defaults to `"ctrl+alt+t"`. The binding is
   * also listed in the command palette ("Change theme"), so apps mounting
   * both get a discoverable entry for free.
   */
  toggleKey?: string;
  /** Heading shown in the title bar. Defaults to `"Themes"`. */
  title?: string;
  /** Panel width in columns. Defaults to 56. */
  width?: number;
  /** Maximum theme rows listed at once. Defaults to 12. */
  maxVisible?: number;
  /** Filter input placeholder. */
  placeholder?: string;
  /** Called when a theme is confirmed with Enter. */
  onSelect?: (theme: Theme) => void;
}

/** Clip to `max` columns with an ellipsis so rows can't cross the border. */
function truncate(text: string, max: number): string {
  if (max <= 0) return "";
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** The accent swatch strip rendered on the right side of each row. */
const SWATCH_KEYS = ["primary", "secondary", "accent", "success", "warning", "error"] as const;

function ThemeRow({
  theme,
  selected,
  active,
  nameColWidth,
  onPick,
}: {
  theme: Theme;
  selected: boolean;
  active: boolean;
  nameColWidth: number;
  onPick: (theme: Theme) => void;
}) {
  // Each row is a miniature of the theme itself: name on the theme's own
  // background/foreground, followed by one block per semantic accent. The
  // selected row is marked with a chevron; the active theme with a dot.
  const marker = selected ? "❯" : active ? "·" : " ";
  return (
    <HBox onClick={() => onPick(theme)} style={selected ? { background: "$panel" } : undefined}>
      <Label style={{ color: "$primary", bold: selected }}>{`${marker} `}</Label>
      <Label style={{ bold: selected }}>
        {truncate(theme.name, nameColWidth).padEnd(nameColWidth)}
      </Label>
      <Label
        style={{
          background: theme.colors.background,
          color: theme.colors.foreground,
          margin: { left: 1 },
        }}
      >
        {" Aa "}
      </Label>
      {SWATCH_KEYS.map((key) => (
        <Label key={key} style={{ color: theme.colors[key] }}>
          {"██"}
        </Label>
      ))}
      <Label style={{ dim: true, margin: { left: 1 } }}>
        {isThemeLight(theme) ? "light" : "dark"}
      </Label>
    </HBox>
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
 * <ThemePalette />                    // Ctrl+Alt+T
 * <ThemePalette toggleKey="f9" />
 * ```
 */
export function ThemePalette({
  toggleKey = "ctrl+alt+t",
  title = "Themes",
  width = 56,
  maxVisible = 12,
  placeholder = "Type to filter themes…",
  onSelect,
}: ThemePaletteProps) {
  const manager = ThemeManager.getInstance();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  // Theme active when the picker opened, restored on cancel.
  const revertTo = useRef<string | null>(null);

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

  const confirm = (theme: Theme) => {
    manager.setTheme(theme.name);
    revertTo.current = null;
    setOpen(false);
    onSelect?.(theme);
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
    closeOnOutsideClick: true,
    onClose: cancel,
    keyInterceptor: (ev) => {
      const last = Math.max(0, themes.length - 1);
      const move = (to: (cur: number) => number) => {
        setSelected((cur) => {
          const next = Math.max(0, Math.min(last, to(Math.min(cur, last))));
          preview(next);
          return next;
        });
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
        case "enter":
          if (themes[sel]) {
            confirm(themes[sel]);
            ev.handled = true;
          }
          break;
      }
    },
  });

  if (!open) return null;

  const innerWidth = width - 4; // border (2) + horizontal padding (2)
  // name column + " Aa " sample (4) + six 2-cell swatches + light/dark tag
  const nameColWidth = Math.max(10, innerWidth - 2 - 5 - SWATCH_KEYS.length * 2 - 7);
  const activeName = revertTo.current ?? manager.getActiveThemeName();

  // Window rows around the selection so long catalogs scroll in place.
  let start = 0;
  if (themes.length > maxVisible) {
    start = Math.max(0, Math.min(sel - Math.floor(maxVisible / 2), themes.length - maxVisible));
  }
  const visible = themes.slice(start, start + maxVisible);
  const above = start;
  const below = themes.length - (start + visible.length);

  const slots: ReactNode[] = visible.map((theme, i) => (
    <ThemeRow
      key={theme.name}
      theme={theme}
      selected={start + i === sel}
      active={theme.name === activeName}
      nameColWidth={nameColWidth}
      onPick={confirm}
    />
  ));
  if (themes.length === 0) {
    slots.push(
      <Label key="empty" style={{ dim: true }}>
        No themes match your filter.
      </Label>,
    );
  }
  for (let i = slots.length; i < maxVisible; i++) {
    slots.push(<Label key={`pad-${i}`}> </Label>);
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
          <Label style={{ dim: true }}>↑↓ preview · ⏎ keep · Esc revert</Label>
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
