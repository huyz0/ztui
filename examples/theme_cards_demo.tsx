import { useState } from "react";
import { type Theme, ThemeManager } from "../src/core.ts";
import { Box, Dock, Footer, HBox, Header, Label, VBox } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";

// A "card gallery" prototype for theme selection. Each card is a *miniature of
// its own theme*: a swatch palette plus a tiny example mockup (a button, body
// text, an accent, and status dots), all painted with that theme's concrete
// colors — not `$primary`/`$surface`, which only reflect the *active* theme.
// That self-painting is the one real trick; everything else is plain layout.
//
// Themes are a small, bounded set, so the whole grid mounts at once with no
// virtualization. A representative slice is shown here; a full catalog would
// scroll (or, for hundreds of items, want a virtualized gallery widget).
const CARD_W = 24;
const COLS = 3;

/** Palette strip: one block per semantic accent, in the theme's own colors. */
const SWATCH_KEYS = ["primary", "secondary", "accent", "success", "warning", "error"] as const;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

function ThemeCard({
  theme,
  selected,
  active,
}: {
  theme: Theme;
  selected: boolean;
  active: boolean;
}) {
  const c = theme.colors;
  const marker = active ? "● " : selected ? "❯ " : "  ";
  return (
    <Box
      style={{
        width: CARD_W,
        border: selected ? "double" : "rounded",
        borderColor: selected ? c.primary : c.surface,
        background: c.background,
        padding: { left: 1, right: 1 },
        margin: { right: 1, bottom: 1 },
      }}
    >
      <VBox>
        {/* Title — the theme's foreground on its own backdrop. */}
        <Label style={{ color: c.foreground, bold: true }}>
          {marker}
          {truncate(theme.name, CARD_W - 5)}
        </Label>

        {/* Mini example: a button, a line of body text, and status dots. */}
        <HBox style={{ margin: { top: 1 } }}>
          <Label style={{ background: c.primary, color: c.background, bold: true }}>
            {" Run "}
          </Label>
          <Label style={{ color: c.foreground, margin: { left: 1 } }}>Aa</Label>
          <Label style={{ color: c.accent, margin: { left: 1 } }}>◆</Label>
          <Label style={{ color: c.success }}>●</Label>
          <Label style={{ color: c.warning }}>●</Label>
          <Label style={{ color: c.error }}>●</Label>
        </HBox>

        {/* Palette swatch strip. */}
        <HBox style={{ margin: { top: 1 } }}>
          {SWATCH_KEYS.map((k) => (
            <Label key={k} style={{ color: c[k] }}>
              {"██"}
            </Label>
          ))}
        </HBox>
      </VBox>
    </Box>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function ThemeCardsDemo() {
  const manager = ThemeManager.getInstance();
  // A representative slice so the grid fits without scrolling in the prototype.
  const themes = manager.listThemes().slice(0, 9);

  const [index, setIndex] = useState(0);
  const [activeName, setActiveName] = useState(manager.getActiveThemeName());

  const apply = (i: number): void => {
    const t = themes[i];
    if (t) {
      manager.setTheme(t.name);
      setActiveName(t.name);
    }
  };

  const handleKey = (ev: any): void => {
    const last = themes.length - 1;
    const move = (to: number) => {
      setIndex(Math.max(0, Math.min(last, to)));
      ev.handled = true;
    };
    switch (ev.name) {
      case "left":
        move(index - 1);
        break;
      case "right":
        move(index + 1);
        break;
      case "up":
        move(index - COLS);
        break;
      case "down":
        move(index + COLS);
        break;
      case "enter":
      case "space":
        apply(index);
        break;
    }
  };

  return (
    <Dock style={{ background: "$background" }}>
      <Header>🎨 ZTUI Theme Cards — palette + live example, each in its own theme</Header>
      <Footer>
        ←/→/↑/↓ move · Enter to apply{quitHint()} · active: {activeName}
      </Footer>

      {/* Focusable container captures the arrow keys for 2D card navigation. */}
      <VBox focusable onKey={handleKey} style={{ padding: 1 }}>
        {chunk(themes, COLS).map((row, r) => (
          <HBox key={row.map((t) => t.name).join()}>
            {row.map((t, i) => {
              const idx = r * COLS + i;
              return (
                <ThemeCard
                  key={t.name}
                  theme={t}
                  selected={idx === index}
                  active={t.name === activeName}
                />
              );
            })}
          </HBox>
        ))}
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const themeCardsDemo: Demo = {
  id: "theme-cards",
  title: "Theme Cards",
  group: "Data",
  description: "Card-gallery theme picker: swatch palette + mini example per theme.",
  autoFocusTag: "@first",
  Component: ThemeCardsDemo,
};
