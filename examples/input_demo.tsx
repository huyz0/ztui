import { useState } from "react";
import { Header, Input, Label, VBox } from "../src/react.ts";
import type { Demo } from "./gallery/types.ts";

function InputDemo() {
  const [name, setName] = useState("Ada Lovelace");
  const [pw, setPw] = useState("hunter2");
  return (
    <VBox style={{ padding: 1, width: 44 }}>
      <Header>Input</Header>
      <Label style={{ margin: { top: 1 } }}>Name</Label>
      <Input value={name} onChange={setName} icon="user" />
      <Label style={{ margin: { top: 1 } }}>Password</Label>
      <Input type="password" value={pw} onChange={setPw} />
      <Label style={{ margin: { top: 1 } }}>Email (placeholder)</Label>
      <Input type="email" placeholder="you@example.com" />
    </VBox>
  );
}

export const inputDemo: Demo = {
  id: "input",
  title: "Input",
  group: "Controls",
  description: "Single-line text fields.",
  autoFocusTag: "input",
  Component: InputDemo,
};
