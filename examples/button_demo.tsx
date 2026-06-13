import { useState } from "react";
import { Button, Header, Label, VBox } from "../src/react.ts";
import type { Demo } from "./gallery/types.ts";

function ButtonDemo() {
  const [count, setCount] = useState(0);
  return (
    <VBox style={{ padding: 1 }}>
      <Header>Button</Header>
      <Label style={{ margin: { top: 1 } }}>Clicked {count} times</Label>
      <Button style={{ margin: { top: 1 } }} onClick={() => setCount((c) => c + 1)}>
        Click me
      </Button>
      <Button
        style={{ margin: { top: 1 }, background: "$primary", color: "$background" }}
        onClick={() => setCount((c) => c + 1)}
      >
        Primary
      </Button>
      <Button style={{ margin: { top: 1 } }} disabled>
        Disabled
      </Button>
    </VBox>
  );
}

export const buttonDemo: Demo = {
  id: "button",
  title: "Button",
  group: "Controls",
  description: "Clickable buttons.",
  autoFocusTag: "@first",
  Component: ButtonDemo,
};
