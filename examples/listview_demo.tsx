import { useState } from "react";
import { Dock, Footer, Header, type ListItem, ListView } from "../src/index.ts";

// A mixed list with icons, dimmed detail text, disabled rows, and thousands of
// generated entries to show virtualization + scrolling.
const items: ListItem[] = [
  { id: "inbox", label: "Inbox", icon: "📥", detail: "12 unread" },
  { id: "drafts", label: "Drafts", icon: "📝", detail: "3" },
  { id: "sent", label: "Sent", icon: "📤" },
  { id: "archive", label: "Archive (read-only)", icon: "🗄️", disabled: true },
  { id: "trash", label: "Trash", icon: "🗑️" },
  ...Array.from({ length: 5000 }, (_, i) => ({
    id: `msg/${i}`,
    label: `Message ${String(i).padStart(4, "0")}`,
    icon: "✉️",
    detail: `thread-${i % 37}`,
  })),
];

function ListViewDemo() {
  const [selected, setSelected] = useState<string>("");
  const [opened, setOpened] = useState<string>("");

  return (
    <Dock style={{ background: "$surface" }}>
      <Header>📋 ZTUI ListView — flat selection list (virtualized, 5000+ rows)</Header>
      <Footer>
        ↑/↓ move · PgUp/PgDn jump · Enter/dbl-click open · Ctrl+C quit ·{" "}
        {selected ? `sel: ${selected}` : "—"}
        {opened ? ` · opened: ${opened}` : ""}
      </Footer>

      <ListView
        style={{ padding: 1 }}
        items={items}
        onSelect={(item) => setSelected(item.id)}
        onActivate={(item) => setOpened(item.id)}
      />
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const listviewDemo: Demo = {
  id: "listview",
  title: "List View",
  group: "Data",
  description: "Virtualized single-select list.",
  autoFocusTag: "listview",
  Component: ListViewDemo,
};
