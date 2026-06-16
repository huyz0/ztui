import { useRef, useState } from "react";
import type { Widget } from "../src/core.ts";
import {
  Button,
  HBox,
  Header,
  Label,
  Popover,
  Tooltip,
  useTooltip,
  VBox,
  View,
} from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";

function PopoverDemoApp() {
  const detailsRef = useRef<Widget>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const saveTip = useTooltip({ delay: 250 });
  const helpTip = useTooltip({ delay: 250 });

  return (
    <VBox style={{ padding: 1, height: "100%", background: "$background" }}>
      <Header>💬 Popover & Tooltip</Header>
      <View style={{ height: 1 }} />

      <Label style={{ color: "$dimmed" }}>Click for a popover; hover a button for a tooltip.</Label>
      <View style={{ height: 1 }} />

      <HBox>
        <Button
          ref={detailsRef}
          style={{ margin: { right: 2 } }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Details ▴" : "Details ▾"}
        </Button>
        <Button
          ref={saveTip.ref}
          {...saveTip.triggerProps}
          style={{ margin: { right: 2 } }}
          onClick={() => setCount((c) => c + 1)}
        >
          Save
        </Button>
        <Button ref={helpTip.ref} {...helpTip.triggerProps}>
          ?
        </Button>
      </HBox>

      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>{`Saved ${count} time(s).`}</Label>

      {/* A popover with arbitrary, interactive content. */}
      <Popover open={open} anchorRef={detailsRef} onClose={() => setOpen(false)} placement="bottom">
        <Label>Build: 1.0.5</Label>
        <Label>Branch: main</Label>
        <Label style={{ color: "$dimmed" }}>Esc or click away to close</Label>
        <View style={{ height: 1 }} />
        <Button onClick={() => setOpen(false)}>Close</Button>
      </Popover>

      {/* Hover tips, placed above/right and flipping to fit. */}
      <Tooltip {...saveTip.props} placement="top">
        <Label>Save your work (Ctrl+S)</Label>
      </Tooltip>
      <Tooltip {...helpTip.props} placement="right">
        <Label>Open the documentation</Label>
      </Tooltip>

      <View style={{ height: "1fr" }} />
      <ExitButton style={{ margin: 0 }}>Exit</ExitButton>
    </VBox>
  );
}

import type { Demo } from "./gallery/types.ts";

export const popoverDemo: Demo = {
  id: "popover",
  title: "Popover & Tooltip",
  group: "Controls",
  description:
    "Anchored popover with interactive content, plus hover tooltips — best-fit placement.",
  Component: PopoverDemoApp,
};
