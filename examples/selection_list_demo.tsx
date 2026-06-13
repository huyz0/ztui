import { useState } from "react";
import { Dock, Footer, Header, Label, SelectionList, VBox } from "../src/index.ts";
import type { ListItem } from "../src/widgets/data/list-view.ts";

// "Pick which changes to apply" — the multi-select an agent shows before it
// commits a batch of file edits. Arrows move the cursor, Space/Enter or click
// toggles, `a` toggles all.
const FILES: ListItem[] = [
  { id: "src/app.ts", label: "src/app.ts", detail: "+12 −3" },
  { id: "src/login.ts", label: "src/login.ts", detail: "+4 −1" },
  {
    id: "src/legacy/session.ts",
    label: "src/legacy/session.ts",
    detail: "deleted",
    disabled: true,
  },
  { id: "src/middleware/auth.ts", label: "src/middleware/auth.ts", detail: "+8 −8" },
  { id: "README.md", label: "README.md", detail: "+2" },
  { id: "package.json", label: "package.json", detail: "+1" },
];

function SelectionListDemo() {
  const [picked, setPicked] = useState<string[]>(["src/app.ts", "README.md"]);

  return (
    <Dock style={{ background: "$surface" }}>
      <Header>☑ ZTUI SelectionList — choose changes to apply</Header>
      <Footer>↑↓ move · Space/Enter or click toggle · a toggle all · Ctrl+C quit</Footer>

      <VBox style={{ padding: 1 }}>
        <Label style={{ dim: true, margin: { bottom: 1 } }}>
          {`${picked.length} of ${FILES.length} selected`}
        </Label>
        <SelectionList
          items={FILES}
          defaultValue={picked}
          onChange={setPicked}
          style={{
            height: 8,
            border: "round",
            borderColor: "$primary",
            padding: { left: 1, right: 1 },
          }}
        />
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const selectionListDemo: Demo = {
  id: "selection-list",
  title: "Selection List",
  group: "Data",
  description: "Multi-select checklist.",
  autoFocusTag: "selection-list",
  Component: SelectionListDemo,
};
