import { useState } from "react";
import { Checkbox, Header, VBox } from "../src/react.ts";
import type { Demo } from "./gallery/types.ts";

function CheckboxDemo() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <VBox style={{ padding: 1 }}>
      <Header>Checkbox</Header>
      <Checkbox style={{ margin: { top: 1 } }} checked={a} onChange={setA} label="Enable feature" />
      <Checkbox style={{ margin: { top: 1 } }} checked={b} onChange={setB} label="Subscribe" />
      <Checkbox style={{ margin: { top: 1 } }} checked disabled label="Locked (on)" />
    </VBox>
  );
}

export const checkboxDemo: Demo = {
  id: "checkbox",
  title: "Checkbox",
  group: "Controls",
  description: "Boolean checkboxes.",
  autoFocusTag: "@first",
  Component: CheckboxDemo,
};
