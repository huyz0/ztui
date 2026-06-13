import { Dock, Footer, Header, Traceback, VBox } from "../src/index.ts";

// The readable error panel an agent shows when a tool call throws: the
// exception heads the panel, frames follow (library frames dimmed), and the
// top in-app frame is expanded with syntax-highlighted source and a caret.
function boom() {
  const cfg: Record<string, unknown> | null = null;
  // @ts-expect-error intentional throw to capture a real stack
  return cfg.timeout.toFixed(2);
}

let error: Error;
try {
  boom();
} catch (e) {
  error = e as Error;
}

function TracebackDemo() {
  return (
    <Dock style={{ background: "$surface" }}>
      <Header>💥 ZTUI Traceback — rich exception panel</Header>
      <Footer>↑↓ scroll · real stack from this file · Ctrl+C quit</Footer>

      <VBox style={{ padding: 1 }}>
        <Traceback
          error={error}
          style={{
            height: 16,
            border: "round",
            borderColor: "$error",
            padding: { left: 1, right: 1 },
          }}
        />
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const tracebackDemo: Demo = {
  id: "traceback",
  title: "Traceback",
  group: "Feedback",
  description: "Pretty Python-style tracebacks.",
  Component: TracebackDemo,
};
