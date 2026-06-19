import { useState } from "react";
import type { RowGroup, TableColumn } from "../src/core.ts";
import { Dock, Footer, Header, Table } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";

// A grouped, collapsible "table list": rows are split into provider sections,
// each introduced by a non-interactive title row. Clicking a title collapses or
// expands its group; the cursor (and clicks) skip the titles. The canonical use
// is an LLM model picker grouped by provider.
interface Model {
  id: string;
  name: string;
  context: string;
  price: string;
}

// Grouped tables are text-only, so the columns are plain text. `groups` replaces
// the flat `data` prop.
const GROUPS: RowGroup<Model>[] = [
  {
    id: "anthropic",
    title: "Anthropic",
    items: [
      { id: "opus-4.8", name: "Claude Opus 4.8", context: "200K", price: "$15 / $75" },
      { id: "sonnet-4.6", name: "Claude Sonnet 4.6", context: "200K", price: "$3 / $15" },
      { id: "haiku-4.5", name: "Claude Haiku 4.5", context: "200K", price: "$1 / $5" },
      { id: "fable-5", name: "Claude Fable 5", context: "200K", price: "$5 / $25" },
    ],
  },
  {
    id: "openai",
    title: "OpenAI",
    items: [
      { id: "gpt-5", name: "GPT-5", context: "256K", price: "$10 / $30" },
      { id: "gpt-5-mini", name: "GPT-5 mini", context: "128K", price: "$2 / $8" },
    ],
  },
  {
    id: "local",
    title: "Local",
    collapsed: true, // starts collapsed to show the feature
    items: [
      { id: "llama-4", name: "Llama 4 70B", context: "128K", price: "free" },
      { id: "qwen-3", name: "Qwen 3 32B", context: "64K", price: "free" },
    ],
  },
];

function GroupedListDemo() {
  // Controlled cursor: onSelect reports the visual-row index (which skips title
  // rows), and we feed it back as selectedIndex. Row 0 is a header, so the first
  // selectable row is index 1.
  const [index, setIndex] = useState(1);
  const [chosen, setChosen] = useState<Model>(GROUPS[0].items[0]);

  const columns: TableColumn<Model>[] = [
    // A text marker for the committed selection (rich `render` cells are not
    // used in grouped mode — a `cell` accessor that closes over `chosen` works).
    { key: "marker", header: "", width: 2, cell: (m) => (m.id === chosen.id ? "›" : "") },
    { key: "name", header: "Model", width: "1fr", minWidth: 16 },
    { key: "context", header: "Context", width: 8, align: "right" },
    { key: "price", header: "In / Out", width: 12, align: "right" },
  ];

  return (
    <Dock style={{ background: "$surface" }}>
      <Header>🗂️ ZTUI Grouped List — collapsible sections (model picker by provider)</Header>
      <Footer>
        ↑/↓ move · Enter to choose · click a title to collapse/expand{quitHint()} · › {chosen.name}
      </Footer>

      <Table
        style={{ padding: 1 }}
        columns={columns}
        groups={GROUPS}
        showHeader
        headerStyle={{ bold: true, dim: true }}
        selectedIndex={index}
        onSelect={(_row, viewIndex) => setIndex(viewIndex)}
        onActivate={(row) => setChosen(row)}
      />
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const groupedListDemo: Demo = {
  id: "grouped-list",
  title: "Grouped List",
  group: "Data",
  description: "Collapsible grouped table/list with non-interactive title rows.",
  autoFocusTag: "table",
  Component: GroupedListDemo,
};
