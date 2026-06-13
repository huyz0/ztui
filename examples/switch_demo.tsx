import { useState } from "react";
import { Header, Switch, VBox } from "../src/react.ts";
import type { Demo } from "./gallery/types.ts";

function SwitchDemo() {
  const [wifi, setWifi] = useState(true);
  const [bt, setBt] = useState(false);
  return (
    <VBox style={{ padding: 1 }}>
      <Header>Switch</Header>
      <Switch style={{ margin: { top: 1 } }} active={wifi} onChange={setWifi} label="Wi-Fi" />
      <Switch style={{ margin: { top: 1 } }} active={bt} onChange={setBt} label="Bluetooth" />
    </VBox>
  );
}

export const switchDemo: Demo = {
  id: "switch",
  title: "Switch",
  group: "Controls",
  description: "On/off toggle switches.",
  autoFocusTag: "@first",
  Component: SwitchDemo,
};
