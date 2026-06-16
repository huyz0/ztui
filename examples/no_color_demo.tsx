import { useEffect, useState } from "react";
import { App, colorMode } from "../src/core.ts";
import {
  Banner,
  Button,
  Dock,
  Footer,
  HBox,
  Header,
  Label,
  Sparkline,
  StatusBadge,
  VBox,
} from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";
import type { Demo } from "./gallery/types.ts";

const WAVE = Array.from({ length: 32 }, (_, i) => 50 + 40 * Math.sin(i / 3));

// Demonstrates NO_COLOR: the same colourful UI, with a live toggle that drops
// every foreground/background colour while keeping the monochrome attributes
// (bold/underline/reverse) and the layout intact — exactly how the app renders
// under the `NO_COLOR` environment variable.
function NoColorDemo() {
  const [on, setOn] = useState(colorMode.enabled);

  // The gallery runs demos in one process — restore the env default on exit so a
  // toggle here doesn't leave other demos monochrome.
  useEffect(() => {
    return () => {
      colorMode.reset();
      App.instance?.refresh("demo:no-color-restore");
    };
  }, []);

  const toggle = () => {
    const next = !colorMode.enabled;
    colorMode.set(next);
    setOn(next);
    // colorMode gates serialization, not the buffer cells, so the per-cell diff
    // sees no change — force a full re-emit.
    App.instance?.refresh("demo:no-color-toggle");
  };

  return (
    <Dock style={{ background: "$background" }}>
      <Header>🎨 NO_COLOR — colour as a toggle</Header>
      <Footer>
        Colour is {on ? "ON" : "OFF"} · honours $NO_COLOR / $ZTUI_NO_COLOR at startup{quitHint()}
      </Footer>

      <VBox style={{ padding: 1 }}>
        <Banner variant="info" title="Banner" message="Accent rule, icon and tint." />
        <HBox style={{ height: 1, margin: { top: 1, bottom: 1 } }}>
          <StatusBadge state="completed" label="passed" style={{ margin: { right: 2 } }} />
          <StatusBadge state="warning" label="degraded" style={{ margin: { right: 2 } }} />
          <StatusBadge state="failed" label="failed" />
        </HBox>
        <HBox style={{ height: 1, margin: { bottom: 1 } }}>
          <Label style={{ width: 12, dim: true }}>throughput</Label>
          <Sparkline data={WAVE} showValue style={{ width: 40, color: "$accent" }} />
        </HBox>
        <Banner
          variant="error"
          title="Build failed"
          message="With colour off, the accent drops but bold/underline and the icon stay — still legible."
        />

        <HBox style={{ margin: { top: 1 } }}>
          <Button onClick={toggle} style={{ background: "$primary", margin: { right: 2 } }}>
            {on ? "Turn colour OFF" : "Turn colour ON"}
          </Button>
        </HBox>
      </VBox>
    </Dock>
  );
}

export const noColorDemo: Demo = {
  id: "no-color",
  title: "NO_COLOR",
  group: "Text",
  description: "Toggle colour off (NO_COLOR) — attributes and layout survive, hues drop.",
  Component: NoColorDemo,
};
