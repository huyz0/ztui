/**
 * Deterministic fixture app for E2E overlay/dropdown tests.
 *
 * Runs the real framework end-to-end (real BunDriver, real overlay layer):
 *  - A button opens a modal Dialog; Esc closes it. `DIALOG:OPEN`/`DIALOG:CLOSED`
 *    is printed so the test can assert state without parsing box-drawing chrome.
 *  - A Select renders a dropdown on click; choosing an option updates a
 *    `SELECTED:<value>` label.
 *  - The button is auto-focused shortly after start so no Tab is needed.
 */
import { useState } from "react";
import { App } from "../../src/core.ts";
import type { Widget } from "../../src/dom/widget.ts";
import { Button, Dialog, Label, render, Select, VBox } from "../../src/react.ts";

function OverlayApp() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState("none");

  return (
    <VBox>
      <Label>DIALOG:{dialogOpen ? "OPEN" : "CLOSED"}</Label>
      <Label>SELECTED:{selected}</Label>
      <Button id="open-dialog" onClick={() => setDialogOpen(true)}>
        Open Dialog
      </Button>
      <Select
        id="the-select"
        options={["alpha", "beta", "gamma"]}
        value={selected === "none" ? undefined : selected}
        onChange={(v) => setSelected(v)}
      />
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <Label>Dialog Content</Label>
      </Dialog>
    </VBox>
  );
}

const app = new App();
render(<OverlayApp />, app.activeScreen);
app.run();

const focusButton = () => {
  let btn: Widget | null = null;
  app.activeScreen.walk((node) => {
    if ((node as Widget).id === "open-dialog") btn = node as Widget;
  });
  if (btn) {
    app.activeScreen.focusWidget(btn);
  } else {
    setTimeout(focusButton, 10);
  }
};
focusButton();
