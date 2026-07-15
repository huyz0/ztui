import { useState } from "react";
import { Combobox, Header, Label, VBox } from "../src/react.ts";
import type { Demo } from "./gallery/types.ts";

const LANGUAGES = ["TypeScript", "Rust", "Go", "Python", "Zig", "Swift", "Kotlin"];

function ComboboxDemo() {
  const [lang, setLang] = useState("Type");
  return (
    <VBox style={{ padding: 1, width: 40 }}>
      <Header>Combobox</Header>
      <Label style={{ margin: { top: 1 } }}>Language</Label>
      <Combobox options={LANGUAGES} value={lang} onChange={setLang} placeholder="Type to filter…" />
    </VBox>
  );
}

export const comboboxDemo: Demo = {
  id: "combobox",
  title: "Combobox",
  group: "Controls",
  description: "Filterable text field with autocomplete suggestions.",
  autoFocusTag: "@first",
  Component: ComboboxDemo,
};
