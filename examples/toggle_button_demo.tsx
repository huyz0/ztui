import { useState } from "react";
import { HBox, Header, ToggleButton, VBox } from "../src/react.ts";
import type { Demo } from "./gallery/types.ts";

function ToggleButtonDemo() {
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  return (
    <VBox style={{ padding: 1 }}>
      <Header>Toggle Button</Header>
      <HBox style={{ margin: { top: 1 } }}>
        <ToggleButton active={bold} onChange={setBold} label="B" />
        <ToggleButton
          active={italic}
          onChange={setItalic}
          label="I"
          style={{ margin: { left: 1 } }}
        />
        <ToggleButton
          active={underline}
          onChange={setUnderline}
          label="U"
          style={{ margin: { left: 1 } }}
        />
      </HBox>
    </VBox>
  );
}

export const toggleButtonDemo: Demo = {
  id: "toggle-button",
  title: "Toggle Button",
  group: "Controls",
  description: "Buttons with a pressed/active state.",
  autoFocusTag: "@first",
  Component: ToggleButtonDemo,
};
