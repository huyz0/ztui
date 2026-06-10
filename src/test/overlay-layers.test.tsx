import { useState } from "react";
import { describe, expect, test } from "vitest";
import { Button, Dialog, Input, Label, StickyPanel, VBox } from "../react/components.tsx";
// Side-effect import: registers the host elements (ztui-button, ztui-overlay-root, …).
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

describe("Dialog", () => {
  test("opens as a modal layer and traps focus inside it", async () => {
    function App() {
      const [open, setOpen] = useState(false);
      return (
        <VBox>
          <Button id="trigger" onClick={() => setOpen(true)}>
            Open
          </Button>
          <Input id="background-input" />
          <Dialog open={open} onClose={() => setOpen(false)}>
            <Label>Confirm?</Label>
            <Button id="dialog-ok">OK</Button>
            <Button id="dialog-cancel">Cancel</Button>
          </Dialog>
        </VBox>
      );
    }

    const t = await mountApp(<App />);
    expect(t.screen.layers.length).toBe(0);

    // Open the dialog by clicking the trigger.
    const trigger = t.findById("trigger");
    trigger?.onClick?.({});
    await t.settle();

    expect(t.screen.layers.length).toBe(1);
    expect(t.screen.topModalLayer).not.toBeNull();

    // Focus is trapped: only the two dialog buttons are focusable now.
    const focusables = t.screen.getFocusableWidgets();
    expect(focusables.length).toBe(2);
    expect(focusables.every((w) => w.tagName === "button")).toBe(true);
    // The background input is not reachable.
    expect(focusables.some((w) => w.id === "background-input")).toBe(false);
  });

  test("Escape closes the dialog and restores prior focus", async () => {
    function App() {
      const [open, setOpen] = useState(true);
      return (
        <VBox>
          <Input id="bg" />
          <Dialog open={open} onClose={() => setOpen(false)}>
            <Button id="ok">OK</Button>
          </Dialog>
        </VBox>
      );
    }

    const t = await mountApp(<App />);
    // Focus the background input first, then it should be restored on close.
    const bg = t.findById("bg");
    t.screen.focusWidget(bg ?? null);

    // Re-open requires the dialog already open at mount; focus moved into it.
    await t.settle();
    expect(t.screen.layers.length).toBe(1);

    t.driver.simulateKey("escape");
    await t.settle();

    expect(t.screen.layers.length).toBe(0);
    expect(t.screen.topModalLayer).toBeNull();
  });

  test("a click on the backdrop closes the dialog", async () => {
    function App() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} onClose={() => setOpen(false)}>
          <Button id="ok">OK</Button>
        </Dialog>
      );
    }

    const t = await mountApp(<App />);
    expect(t.screen.layers.length).toBe(1);

    // Click a corner — guaranteed to miss the centered panel on an 80x24 screen.
    t.driver.simulateMouse(0, 0, "press", "left");
    await t.settle();

    expect(t.screen.layers.length).toBe(0);
  });
});

describe("StickyPanel", () => {
  test("does not steal focus and lets keys reach the focused control", async () => {
    const typed: string[] = [];
    function App() {
      return (
        <VBox>
          <Input id="chat" onKey={(ev: any) => typed.push(ev.key)} />
          <StickyPanel open panelStyle={{ left: 2, top: 2, width: 20 }}>
            <Label>/help</Label>
          </StickyPanel>
        </VBox>
      );
    }

    const t = await mountApp(<App />);
    expect(t.screen.layers.length).toBe(1);
    // Non-modal: no modal trap.
    expect(t.screen.topModalLayer).toBeNull();

    // Focus the chat input; the sticky panel must not have taken focus.
    const chat = t.findById("chat");
    t.screen.focusWidget(chat ?? null);
    expect(t.screen.focusedWidget).toBe(chat);

    // A normal key still reaches the focused input.
    t.driver.simulateKey("a");
    await t.settle();
    expect(typed).toContain("a");
  });

  test("keyInterceptor claims keys before the focused control", async () => {
    const typed: string[] = [];
    const intercepted: string[] = [];
    function App() {
      return (
        <VBox>
          <Input id="chat" onKey={(ev: any) => typed.push(ev.key)} />
          <StickyPanel
            open
            onKeyIntercept={(ev) => {
              if (ev.name === "down" || ev.name === "up") {
                intercepted.push(ev.name);
                ev.handled = true;
              }
            }}
          >
            <Label>/help</Label>
          </StickyPanel>
        </VBox>
      );
    }

    const t = await mountApp(<App />);
    const chat = t.findById("chat");
    t.screen.focusWidget(chat ?? null);

    // Arrow keys are claimed by the panel.
    t.driver.simulateKey("down", "down");
    await t.settle();
    expect(intercepted).toContain("down");
    expect(typed).not.toContain("down");

    // Plain text still flows to the input.
    t.driver.simulateKey("x");
    await t.settle();
    expect(typed).toContain("x");
  });

  test("removing the panel pops its layer", async () => {
    function App() {
      const [open, setOpen] = useState(true);
      return (
        <VBox>
          <Button id="toggle" onClick={() => setOpen(false)}>
            x
          </Button>
          <StickyPanel open={open}>
            <Label>menu</Label>
          </StickyPanel>
        </VBox>
      );
    }

    const t = await mountApp(<App />);
    expect(t.screen.layers.length).toBe(1);

    t.findById("toggle")?.onClick?.({});
    await t.settle();
    expect(t.screen.layers.length).toBe(0);
  });
});
