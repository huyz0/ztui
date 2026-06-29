import { useEffect, useRef, useState } from "react";
import { App, type Widget } from "../src/core.ts";
import {
  Button,
  ButtonGroup,
  DevTools,
  type DevToolsFrame,
  DevToolsHighlight,
  type DevToolsRegion,
  Dock,
  Footer,
  Form,
  HBox,
  Header,
  Input,
  Label,
  useHotkey,
  VBox,
} from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";
import type { Demo } from "./gallery/types.ts";

// A React-DevTools-style inspector for ztui, dogfooded: the left pane is a small
// sample app; the right pane is <DevTools> pointed at it (via a ref). Click a
// node in the tree (or Ctrl+P to "pick" — hover the app to select what's under
// the pointer) to see its geometry/flags/style and box it on screen; the footer
// strip is the live render profiler.
function DevToolsDemoApp() {
  const inspected = useRef<Widget>(null);
  const [frame, setFrame] = useState<DevToolsFrame | null>(null);
  const [pick, setPick] = useState(false);
  const [highlight, setHighlight] = useState<DevToolsRegion | null>(null);

  // Poll the live frame summary; this re-render also feeds the (now-set) ref to
  // the panel after mount.
  useEffect(() => {
    const h = setInterval(() => setFrame(App.instance?.getLastFrame() ?? null), 400);
    return () => clearInterval(h);
  }, []);

  useHotkey({
    key: "ctrl+p",
    name: "Pick mode",
    description: "Hover the app to select the widget under the pointer",
    group: "DevTools",
    handler: () => setPick((p) => !p),
  });

  return (
    <Dock style={{ background: "$background" }}>
      <Header>🛠 ZTUI DevTools — inspect the live widget tree (Ctrl+P to pick)</Header>
      <HBox style={{ height: "1fr", padding: 1 }}>
        {/* The inspected sample app. */}
        <VBox
          ref={inspected}
          style={{ width: "1fr", height: "100%", border: "rounded", padding: 1 }}
        >
          <Label style={{ bold: true }}>Sign in</Label>
          <Form>
            <Input id="email" placeholder="email…" style={{ width: 24 }} />
            <Input id="password" type="password" placeholder="password…" style={{ width: 24 }} />
            <ButtonGroup>
              <Button formAction="reset">Reset</Button>
              <Button formAction="submit" style={{ color: "$success" }}>
                Sign in
              </Button>
            </ButtonGroup>
          </Form>
        </VBox>

        {/* The inspector, pointed at the sample app's root. */}
        <DevTools
          root={inspected.current}
          frame={frame}
          pick={pick}
          onInspect={setHighlight}
          style={{
            width: "1fr",
            height: "100%",
            border: "rounded",
            padding: 1,
            margin: { left: 1 },
          }}
        />
      </HBox>
      {/* The highlight box overlays the inspected pane (rooted at the full-screen
          Dock so it isn't clipped to a panel). */}
      <DevToolsHighlight region={highlight} />
      <Footer>
        <ExitButton style={{ margin: 0 }}>Exit</ExitButton>
      </Footer>
    </Dock>
  );
}

export const devToolsDemo: Demo = {
  id: "devtools",
  title: "DevTools",
  group: "Data",
  description:
    "A React-DevTools-style inspector: live widget tree, per-node style/geometry, and a render-profiler strip.",
  Component: DevToolsDemoApp,
};
