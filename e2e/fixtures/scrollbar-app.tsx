/**
 * Deterministic fixture for E2E scrollbar-drag tests.
 *
 * Runs the real framework end-to-end (real BunDriver, real hit-testing).
 * Renders a fixed-size, borderless scrollable box with more rows than fit,
 * so a scrollbar is always visible in the right-hand gutter column.
 */
import { App } from "../../src/core.ts";
import { Label, render, ScrollableBox } from "../../src/react.ts";

const rows = Array.from({ length: 50 }, (_, i) => `ROW-${i}`);

function ScrollbarApp() {
  return (
    <ScrollableBox
      id="scroll"
      style={{ width: 20, height: 10, overflowY: "scroll", overflowX: "hidden" }}
    >
      {rows.map((r) => (
        <Label key={r}>{r}</Label>
      ))}
    </ScrollableBox>
  );
}

const app = new App();
render(<ScrollbarApp />, app.activeScreen);
app.run();
