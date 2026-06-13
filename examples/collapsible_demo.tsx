import type { Widget } from "../src/dom/widget.ts";
import {
  App,
  Collapsible,
  Dock,
  Footer,
  Header,
  Label,
  render,
  Syntax,
  VBox,
} from "../src/index.ts";

// Foldable sections, the way an agent transcript groups reasoning and tool
// calls: a one-line title you can expand to see the detail. Tab moves focus
// between sections; Enter/Space (or click) toggles; →/← expand/collapse.
function CollapsibleDemo() {
  return (
    <Dock style={{ background: "$surface" }}>
      <Header>🧩 ZTUI Collapsible — foldable reasoning / tool blocks</Header>
      <Footer>Tab focus · Enter/Space or click toggle · →/← expand/collapse · Ctrl+C quit</Footer>

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

const app = new App();
render(<CollapsibleDemo />, app.activeScreen);
app.run();

// Auto-focus the first collapsible so the keyboard drives it without a Tab first.
const focusFirst = () => {
  let first: Widget | null = null;
  app.activeScreen.walk((node) => {
    if (!first && (node as Widget).tagName === "collapsible") first = node as Widget;
  });
  if (first) app.activeScreen.focusWidget(first);
  else setTimeout(focusFirst, 10);
};
focusFirst();
