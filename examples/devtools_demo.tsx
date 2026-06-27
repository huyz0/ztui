import { useEffect, useRef, useState } from "react";
import { App, type Widget } from "../src/core.ts";
import {
  Button,
  ButtonGroup,
  DevTools,
  type DevToolsFrame,
  Dock,
  Footer,
  Form,
  HBox,
  Header,
  Input,
  Label,
  VBox,
} from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";
import type { Demo } from "./gallery/types.ts";

// A React-DevTools-style inspector for ztui, dogfooded: the left pane is a small
// sample app; the right pane is <DevTools> pointed at it (via a ref). Click a
// node in the tree to see its geometry/flags/style; the footer strip is the live
// render profiler (scoped vs full frame, widgets rendered, bytes, reasons).
function DevToolsDemoApp() {
  const inspected = useRef<Widget>(null);
  const [frame, setFrame] = useState<DevToolsFrame | null>(null);

  // Poll the live frame summary; this re-render also feeds the (now-set) ref to
  // the panel after mount.
  useEffect(() => {
    const h = setInterval(() => setFrame(App.instance?.getLastFrame() ?? null), 400);
    return () => clearInterval(h);
  }, []);

  return (
    <Dock style={{ background: "$background" }}>
      <Header>🛠 ZTUI DevTools — inspect the live widget tree</Header>
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
          style={{
            width: "1fr",
            height: "100%",
            border: "rounded",
            padding: 1,
            margin: { left: 1 },
          }}
        />
      </HBox>
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
