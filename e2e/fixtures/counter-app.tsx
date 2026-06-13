/**
 * Deterministic fixture app for E2E tests.
 *
 * Runs the *real* framework end-to-end: `new App()` binds the real `BunDriver`,
 * which writes ANSI to stdout and reads keys from stdin. The E2E test spawns
 * this as a separate OS process, drives stdin, and parses stdout.
 *
 * Behavior:
 *  - Renders `COUNT:<n>` in a label.
 *  - Enter / Space on the focused button increments the counter.
 *  - The button is auto-focused shortly after start so no Tab is needed.
 *  - Ctrl+C (handled by the driver) restores the terminal and exits 0.
 */
import { useState } from "react";
import { App } from "../../src/core.ts";
import type { Widget } from "../../src/dom/widget.ts";
import { Button, Label, render, VBox } from "../../src/react.ts";

function CounterApp() {
  const [count, setCount] = useState(0);
  return (
    <VBox>
      <Label>COUNT:{count}</Label>
      <Button id="inc" onClick={() => setCount((c) => c + 1)}>
        Increment
      </Button>
    </VBox>
  );
}

const app = new App();
render(<CounterApp />, app.activeScreen);
app.run();

// Auto-focus the button so Enter/Space activates it without a Tab keystroke.
// The React tree commits asynchronously, so poll until the button exists.
const focusButton = () => {
  let btn: Widget | null = null;
  app.activeScreen.walk((node) => {
    if ((node as Widget).id === "inc") btn = node as Widget;
  });
  if (btn) {
    app.activeScreen.focusWidget(btn);
  } else {
    setTimeout(focusButton, 10);
  }
};
focusButton();
