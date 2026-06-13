// Two tiers of emphasis built on the easing/breathing engine:
//   • FOCUS — Tab between the controls. The focused one's accent *breathes*
//     (a whisper-quiet pulse of $focus) instead of a static slab. Notice the
//     softened chrome: no more "fill + bold + colour-flip" stacked at once.
//   • ATTENTION — the bordered panel on the right pulses harder ($attention) to
//     pull your eye to a decision. It keeps pulsing regardless of focus.
//
// Keys: Tab move focus · F2 toggle motion (breathing on/off) · F3 re-arm the
//       attention panel · Ctrl+C quit.
import { useState } from "react";
import { motion } from "../src/core.ts";
import {
  Attention,
  Button,
  Checkbox,
  Footer,
  HBox,
  Header,
  Input,
  Label,
  Select,
  Slider,
  Switch,
  ToggleButton,
  useHotkey,
  VBox,
  View,
} from "../src/react.ts";

function FocusDemo() {
  const [, force] = useState(0);
  const [decided, setDecided] = useState<string | null>(null);
  const [on, setOn] = useState(true);

  // Function keys dispatch in the priority phase, so they fire even while an
  // Input is focused (bare letters would be typed into the field instead).
  useHotkey({
    key: "f2",
    name: "Toggle motion",
    handler: () => {
      motion.set(!motion.enabled);
      force((n) => n + 1);
    },
  });
  useHotkey({ key: "f3", name: "Re-arm attention", handler: () => setDecided(null) });
  useHotkey({ key: "ctrl+c", name: "Quit", handler: () => process.exit(0) });

  return (
    <VBox style={{ width: "100%", height: "100%", background: "$background" }}>
      <Header>ztui — breathing focus & attention</Header>

      <HBox style={{ padding: 1 }}>
        {/* Left: ordinary focusable controls. Tab to move the breathing accent. */}
        <VBox style={{ width: "55%", border: "rounded", borderColor: "$border", padding: 1 }}>
          <Label style={{ color: "$primary", bold: true }}>Focus (Tab through me)</Label>
          <View style={{ height: 1 }} />

          <Label style={{ color: "$secondary" }}>Name</Label>
          <Input style={{ height: 3 }} placeholder="type here" />

          <HBox style={{ height: 1, margin: { top: 1, bottom: 1 } }}>
            <Switch active={on} label="Notifications" onChange={setOn} />
            <View style={{ width: 3 }} />
            <Checkbox checked label="Agree" />
          </HBox>

          <Label style={{ color: "$secondary" }}>Volume</Label>
          <Slider value={60} min={0} max={100} step={5} />

          <View style={{ height: 1 }} />
          <HBox style={{ height: 1 }}>
            <Button>Save</Button>
            <View style={{ width: 2 }} />
            <ToggleButton active label="Toggle" />
            <View style={{ width: 2 }} />
            <Select options={["Free", "Pro"]} value="Pro" />
          </HBox>
        </VBox>

        {/* Right: an attention panel pulling the eye to a decision. */}
        <VBox style={{ width: "45%", padding: { left: 1 } }}>
          {decided ? (
            <VBox style={{ border: "rounded", borderColor: "$border", padding: 1 }}>
              <Label style={{ color: "$success" }}>You chose: {decided}</Label>
              <Label style={{ color: "$dimmed" }}>Press `a` to ask again.</Label>
            </VBox>
          ) : (
            <Attention title=" Permission required " style={{ padding: 1 }}>
              <Label style={{ color: "$foreground" }}>Allow access to the clipboard?</Label>
              <View style={{ height: 1 }} />
              <HBox style={{ height: 1 }}>
                <Button style={{ background: "$success" }} onClick={() => setDecided("Allow")}>
                  Allow
                </Button>
                <View style={{ width: 2 }} />
                <Button style={{ background: "$error" }} onClick={() => setDecided("Deny")}>
                  Deny
                </Button>
              </HBox>
            </Attention>
          )}

          <View style={{ height: 1 }} />
          <Label style={{ color: "$dimmed" }}>
            motion: {motion.enabled ? "on" : "off"} (press F2)
          </Label>
        </VBox>
      </HBox>

      <Footer>Tab focus · F2 motion on/off · F3 re-arm · Ctrl+C quit</Footer>
    </VBox>
  );
}

import type { Demo } from "./gallery/types.ts";

export const focusDemo: Demo = {
  id: "focus",
  title: "Focus Ring",
  group: "Layout",
  description: "Tab focus navigation & breathing.",
  Component: FocusDemo,
};
