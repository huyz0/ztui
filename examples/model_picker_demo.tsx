import { useState } from "react";
import type { TableColumn } from "../src/core.ts";
import { Dock, Footer, Header, Label, Table } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";

// A "table list": the same Table widget, but with no `sortable` columns. It
// reads like a list — one highlighted current row — while keeping aligned
// columns. The canonical use is an LLM model picker, where each row needs a
// few fields (context window, pricing, tier) lined up for easy scanning.
interface Model {
  id: string;
  name: string;
  tier: "Frontier" | "Balanced" | "Fast" | "Creative";
  context: string;
  price: string;
}

const MODELS: Model[] = [
  {
    id: "opus-4.8",
    name: "Claude Opus 4.8",
    tier: "Frontier",
    context: "200K",
    price: "$15 / $75",
  },
  {
    id: "sonnet-4.6",
    name: "Claude Sonnet 4.6",
    tier: "Balanced",
    context: "200K",
    price: "$3 / $15",
  },
  { id: "haiku-4.5", name: "Claude Haiku 4.5", tier: "Fast", context: "200K", price: "$1 / $5" },
  { id: "fable-5", name: "Claude Fable 5", tier: "Creative", context: "200K", price: "$5 / $25" },
];

const TIER_COLOR: Record<Model["tier"], string> = {
  Frontier: "$primary",
  Balanced: "$success",
  Fast: "$warning",
  Creative: "$secondary",
};

function ModelPickerDemo() {
  // Controlled selection so the highlight bar persists; start on the first row.
  const [index, setIndex] = useState(0);
  // The committed selection — distinct from the cursor. Defaults to the first
  // model so there is always a "currently selected" item to mark.
  const [chosen, setChosen] = useState<Model>(MODELS[0]);

  // No `sortable` on any column → headers don't sort; it behaves like a list.
  const columns: TableColumn<Model>[] = [
    {
      // A persistent marker on the chosen row, independent of the cursor
      // highlight. `cell` closes over `chosen`, so it re-renders on selection.
      key: "marker",
      header: "",
      width: 2,
      align: "center",
      render: (row) =>
        row.id === chosen.id ? (
          <Label style={{ color: "$success", bold: true }}>✔</Label>
        ) : (
          <Label> </Label>
        ),
    },
    { key: "name", header: "Model", width: "1fr", minWidth: 16 },
    {
      key: "tier",
      header: "Tier",
      width: 11,
      // A widget-bearing cell still works in a "table list".
      render: (row) => (
        <Label style={{ color: TIER_COLOR[row.tier], bold: true }}>● {row.tier}</Label>
      ),
    },
    { key: "context", header: "Context", width: 8, align: "right" },
    { key: "price", header: "In / Out", width: 12, align: "right" },
  ];

  return (
    <Dock style={{ background: "$surface" }}>
      <Header>🤖 ZTUI Model Picker — a non-sortable, multi-column "table list"</Header>
      <Footer>
        ↑/↓ move · Enter or double-click to choose{quitHint()} · ✔ selected: {chosen.name} · cursor:{" "}
        {MODELS[index].name}
      </Footer>

      <Table
        style={{ padding: 1 }}
        data={MODELS}
        columns={columns}
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

export const modelPickerDemo: Demo = {
  id: "model-picker",
  title: "Model Picker",
  group: "Data",
  description: "Non-sortable multi-column selectable list (table list).",
  autoFocusTag: "table",
  Component: ModelPickerDemo,
};
