import { useState } from "react";
import { Dock, Footer, GalleryView, Header, Label, VBox } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";

// A responsive grid of color swatches: the column count flows from the window
// width (resize the terminal and watch it reflow), arrows move a 2D cursor, and
// the wheel/scrollbar scroll the overflow.
const PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
];
const ITEMS = Array.from({ length: 54 }, (_, i) => ({
  id: i,
  color: PALETTE[i % PALETTE.length],
}));

function GalleryViewDemo() {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);

  return (
    <Dock style={{ background: "$surface" }}>
      <Header>🖼️ ZTUI Gallery — resize the window and the columns reflow</Header>
      <Footer>
        ←→↑↓ move · PgUp/PgDn · Enter to choose · wheel/scrollbar scroll{quitHint()} ·{" "}
        {chosen != null ? `chosen #${chosen}` : `cursor #${index}`}
      </Footer>

      <GalleryView
        style={{ padding: 1 }}
        items={ITEMS}
        itemWidth={16}
        itemHeight={4}
        selectedIndex={index}
        onSelect={setIndex}
        onActivate={setChosen}
        renderItem={(item, { selected }) => (
          <VBox
            style={{
              width: "100%",
              height: "100%",
              border: selected ? "double" : "rounded",
              borderColor: selected ? "$primary" : "$border",
              background: item.color,
            }}
          >
            <Label style={{ color: "#000000", bold: true }}>{` #${item.id}`}</Label>
            <Label style={{ color: "#000000" }}>{` ${item.color}`}</Label>
          </VBox>
        )}
      />
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const galleryViewDemo: Demo = {
  id: "gallery-view",
  title: "Gallery View",
  group: "Data",
  description: "Responsive item grid: auto-columns, 2D arrow nav, wheel + scrollbar.",
  autoFocusTag: "@first",
  Component: GalleryViewDemo,
};
