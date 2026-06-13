import { useState } from "react";
import {
  Button,
  Checkbox,
  Dock,
  Footer,
  Form,
  HBox,
  Header,
  Input,
  Label,
  RadioGroup,
  Select,
  Slider,
  Switch,
  ToggleButton,
  VBox,
  View,
} from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";

// Shows the `disabled` prop across every interactive control: a disabled widget
// is muted, skipped by Tab, and ignores keyboard/mouse. The bottom section wraps
// a whole <Form> so toggling one flag disables every control inside it (disabled
// propagates to descendants).

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <HBox style={{ height: 3, margin: { bottom: 1 } }}>
      <Label style={{ width: 14, color: "$secondary" }}>{label}</Label>
      {children}
    </HBox>
  );
}

function DisabledDemo() {
  const [formLocked, setFormLocked] = useState(true);

  return (
    <Dock style={{ background: "$background" }}>
      <Header>🚫 ZTUI Disabled State — enabled vs disabled</Header>
      <Footer>Tab skips disabled controls · disabled widgets ignore input · Ctrl+C: Exit</Footer>

      <HBox style={{ padding: 1 }}>
        {/* Left: each control type, enabled on top, disabled below. */}
        <VBox style={{ width: "50%", border: "rounded", borderColor: "$border", padding: 1 }}>
          <Label style={{ color: "$primary", bold: true }}>Per-widget</Label>
          <View style={{ height: 1 }} />

          <Label style={{ color: "$secondary" }}>Input</Label>
          <Input style={{ height: 3 }} value="Editable" placeholder="type here" />
          <Input style={{ height: 3 }} value="Read-only (disabled)" disabled />

          <Pair label="Checkbox">
            <Checkbox checked={true} label="Enabled" />
            <View style={{ width: 2 }} />
            <Checkbox checked={true} label="Disabled" disabled />
          </Pair>

          <Pair label="Switch">
            <Switch active={true} label="Enabled" />
            <View style={{ width: 2 }} />
            <Switch active={true} label="Disabled" disabled />
          </Pair>

          <Pair label="Buttons">
            <ToggleButton active={true} label="Toggle" />
            <View style={{ width: 2 }} />
            <Button disabled>Disabled</Button>
          </Pair>

          <Label style={{ color: "$secondary" }}>Slider (disabled)</Label>
          <Slider value={45} min={0} max={100} disabled />
        </VBox>

        {/* Right: a whole form locked by a single flag (container propagation). */}
        <VBox style={{ width: "50%", border: "rounded", borderColor: "$border", padding: 1 }}>
          <Label style={{ color: "$primary", bold: true }}>Whole-form lock</Label>
          <Label style={{ color: "$dimmed" }}>
            One `disabled` on the &lt;Form&gt; disables everything inside it.
          </Label>
          <View style={{ height: 1 }} />

          <ToggleButton
            active={formLocked}
            label={formLocked ? "🔒 Form is LOCKED" : "🔓 Form is EDITABLE"}
            onChange={setFormLocked}
          />
          <View style={{ height: 1 }} />

          <Form disabled={formLocked} style={{ border: "round", padding: 1 }}>
            <Label style={{ color: "$secondary" }}>Full name</Label>
            <Input style={{ height: 3 }} placeholder="Ada Lovelace" />

            <Label style={{ color: "$secondary" }}>Plan</Label>
            <Select options={["Free", "Pro", "Enterprise"]} value="Pro" />

            <Label style={{ color: "$secondary", margin: { top: 1 } }}>Billing</Label>
            <RadioGroup options={["Monthly", "Yearly"]} value="Yearly" orientation="horizontal" />

            <View style={{ height: 1 }} />
            <Checkbox checked={true} label=" Subscribe to updates" />

            <View style={{ height: 1 }} />
            <Button formAction="submit" style={{ background: "$success" }}>
              Save changes
            </Button>
          </Form>
        </VBox>
      </HBox>

      <HBox style={{ dock: "bottom", height: 1, padding: { left: 1 } }}>
        <ExitButton>Exit</ExitButton>
      </HBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const disabledDemo: Demo = {
  id: "disabled",
  title: "Disabled State",
  group: "Layout",
  description: "Disabled / inert widget styling.",
  Component: DisabledDemo,
};
