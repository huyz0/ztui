import { Collapsible, Dock, Footer, Header, Label, Syntax, VBox } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";
import "../src/syntax.ts";

// Foldable sections, the way an agent transcript groups reasoning and tool
// calls: a one-line title you can expand to see the detail. Tab moves focus
// between sections; Enter/Space (or click) toggles; →/← expand/collapse.
function CollapsibleDemo() {
  return (
    <Dock style={{ background: "$surface" }}>
      <Header>🧩 ZTUI Collapsible — foldable reasoning / tool blocks</Header>
      <Footer>Tab focus · Enter/Space or click toggle · →/← expand/collapse{quitHint()}</Footer>

      <VBox style={{ padding: 1 }}>
        <Collapsible title="💭 Reasoning" defaultOpen>
          <Label style={{ dim: true }}>
            The user wants the open PRs summarized. I'll list them, then inspect
          </Label>
          <Label style={{ dim: true }}>the ones that look risky before answering.</Label>
        </Collapsible>

        <Collapsible title="⚙ tool: gh.pr_list">
          <Syntax language="json" style={{ margin: { bottom: 1 } }}>
            {'{\n  "state": "open",\n  "limit": 20\n}'}
          </Syntax>
        </Collapsible>

        <Collapsible title="⚙ tool: gh.pr_diff (#309)  ⚠ risky">
          <Label style={{ color: "$warning" }}>removes src/legacy/session.ts</Label>
          <Label style={{ dim: true }}>
            still imported by app.ts, login.ts, middleware/auth.ts
          </Label>
        </Collapsible>

        <Collapsible title="✓ Final answer">
          <Label>#312 safe · #309 request changes · #305 blocked (auth-e2e red)</Label>
        </Collapsible>
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const collapsibleDemo: Demo = {
  id: "collapsible",
  title: "Collapsible",
  group: "Layout",
  description: "Expand / collapse sections.",
  autoFocusTag: "collapsible",
  Component: CollapsibleDemo,
};
