import { useState } from "react";
import { Header, Label, Select, VBox } from "../src/react.ts";
import type { Demo } from "./gallery/types.ts";

function SelectDemo() {
  const [lang, setLang] = useState("TypeScript");
  const [tags, setTags] = useState<string[]>(["cli"]);
  return (
    <VBox style={{ padding: 1, width: 40 }}>
      <Header>Select</Header>
      <Label style={{ margin: { top: 1 } }}>Language</Label>
      <Select options={["TypeScript", "Rust", "Go", "Python"]} value={lang} onChange={setLang} />
      <Label style={{ margin: { top: 1 } }}>Tags (multiple)</Label>
      <Select options={["cli", "tui", "web", "lib"]} value={tags} multiple onChange={setTags} />
    </VBox>
  );
}

export const selectDemo: Demo = {
  id: "select",
  title: "Select",
  group: "Controls",
  description: "Single- and multi-select dropdowns.",
  autoFocusTag: "@first",
  Component: SelectDemo,
};
