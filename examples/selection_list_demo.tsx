import { useState } from "react";
import type { Widget } from "../src/dom/widget.ts";
import { App, Dock, Footer, Header, Label, render, SelectionList, VBox } from "../src/index.ts";
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
    <Dock style={{ background: "#11111b" }}>
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

const app = new App();
render(<SelectionListDemo />, app.activeScreen);
app.run();

// Auto-focus the list so the keyboard drives it without a Tab first.
const focusFirst = () => {
  let first: Widget | null = null;
  app.activeScreen.walk((node) => {
    if (!first && (node as Widget).tagName === "selection-list") first = node as Widget;
  });
  if (first) app.activeScreen.focusWidget(first);
  else setTimeout(focusFirst, 10);
};
focusFirst();
