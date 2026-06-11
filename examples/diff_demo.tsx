import { useState } from "react";
import type { Widget } from "../src/dom/widget.ts";
import { App, Diff, Dock, Footer, Header, hotkeys, Label, render, VBox } from "../src/index.ts";

// The view a coding agent shows when it proposes a file edit: a syntax-
// highlighted diff with a +/- gutter and line numbers. Toggle unified vs
// split, and full-file vs collapsed context, the way you'd review a patch.
const OLD = `export function greet(name) {
  const msg = "hello " + name;
  console.log(msg);
  return msg;
}

export function farewell(name) {
  console.log("bye " + name);
}`;

const NEW = `export function greet(name: string): string {
  const msg = \`hello \${name}\`;
  console.log(msg);
  return msg;
}

export function farewell(name: string): void {
  console.log(\`bye \${name}\`);
}`;

function DiffDemo() {
  const [split, setSplit] = useState(false);
  const [full, setFull] = useState(false);

  hotkeys.register({ key: "v", name: "Unified / split", handler: () => setSplit((s) => !s) });
  hotkeys.register({ key: "c", name: "Context", handler: () => setFull((f) => !f) });

  return (
    <Dock style={{ background: "#11111b" }}>
      <Header>🪢 ZTUI Diff — a proposed edit to greet.ts</Header>
      <Footer>v unified/split · c collapse/full context · ↑↓ scroll · Ctrl+C quit</Footer>

      <VBox style={{ padding: 1 }}>
        <Label style={{ dim: true, margin: { bottom: 1 } }}>
          {split ? "split view" : "unified view"} · {full ? "full file" : "3 lines of context"}
        </Label>
        <Diff
          language="ts"
          oldText={OLD}
          newText={NEW}
          view={split ? "split" : "unified"}
          context={full ? Number.POSITIVE_INFINITY : 3}
          style={{ border: "round", borderColor: "$primary", padding: { left: 1, right: 1 } }}
        />
      </VBox>
    </Dock>
  );
}

const app = new App();
render(<DiffDemo />, app.activeScreen);
app.run();

// Auto-focus the diff so ↑↓ scroll without a Tab first.
const focusFirst = () => {
  let first: Widget | null = null;
  app.activeScreen.walk((node) => {
    if (!first && (node as Widget).tagName === "diff") first = node as Widget;
  });
  if (first) app.activeScreen.focusWidget(first);
  else setTimeout(focusFirst, 10);
};
focusFirst();
