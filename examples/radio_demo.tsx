import { useState } from "react";
import { Header, Label, RadioGroup, VBox } from "../src/react.ts";
import type { Demo } from "./gallery/types.ts";

function RadioDemo() {
  const [plan, setPlan] = useState("pro");
  const [align, setAlign] = useState("left");
  return (
    <VBox style={{ padding: 1, width: 40 }}>
      <Header>Radio Group</Header>
      <Label style={{ margin: { top: 1 } }}>Plan</Label>
      <RadioGroup
        options={[
          { value: "free", label: "Free" },
          { value: "pro", label: "Pro" },
          { value: "team", label: "Team" },
        ]}
        value={plan}
        onChange={setPlan}
      />
      <Label style={{ margin: { top: 1 } }}>Align (horizontal)</Label>
      <RadioGroup
        options={["left", "center", "right"]}
        value={align}
        orientation="horizontal"
        onChange={setAlign}
      />
    </VBox>
  );
}

export const radioDemo: Demo = {
  id: "radio",
  title: "Radio Group",
  group: "Controls",
  description: "Single-choice radio groups.",
  autoFocusTag: "@first",
  Component: RadioDemo,
};
