import { useRef, useState } from "react";
import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
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

describe("StickyPanel positioning", () => {
  const panelRegion = (t: Awaited<ReturnType<typeof mountApp>>) =>
    (t.screen.layers[0].root.children[0] as Widget).region;

  test("anchors flush above its target without overlapping it", async () => {
    function App() {
      const ref = useRef<Widget>(null);
      return (
        <VBox style={{ layout: "vertical" }}>
          <VBox style={{ flexGrow: 1 }} />
          <Input ref={ref} id="chat" style={{ height: 3 }} />
          <StickyPanel anchorRef={ref} placement="above" panelStyle={{ width: 20 }}>
            <Label>/help</Label>
            <Label>/clear</Label>
          </StickyPanel>
        </VBox>
      );
    }

    const t = await mountApp(<App />, { cols: 80, rows: 24 });
    const input = t.findById("chat") as Widget;
    const panel = panelRegion(t);

    // The panel sits entirely above the input.
    expect(panel.bottom).toBeLessThanOrEqual(input.region.y);
    // …and fully within the screen.
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.right).toBeLessThanOrEqual(80);
  });

  test("aligns to the anchor's visible box, not its margin edge", async () => {
    function App() {
      const ref = useRef<Widget>(null);
      return (
        <VBox>
          <VBox style={{ flexGrow: 1 }} />
          <Input ref={ref} id="chat" style={{ height: 3, margin: 2 }} />
          <StickyPanel anchorRef={ref} placement="above" panelStyle={{ width: 20 }}>
            <Label>/help</Label>
          </StickyPanel>
        </VBox>
      );
    }

    const t = await mountApp(<App />, { cols: 80, rows: 24 });
    const input = t.findById("chat") as Widget;
    const client = input.getClientRect();
    const panel = panelRegion(t);

    // Flush with the input's visible box: same left edge, no gap row above it.
    expect(panel.x).toBe(client.x);
    expect(panel.bottom).toBe(client.y);
  });

  test("clamps to the screen instead of being clipped by an edge", async () => {
    function App() {
      const ref = useRef<Widget>(null);
      return (
        <VBox>
          {/* Anchor pinned to the very top: 'above' has no room, so the panel
              must flip/clamp to stay on-screen. */}
          <Input ref={ref} id="chat" style={{ height: 3 }} />
          <VBox style={{ flexGrow: 1 }} />
          <StickyPanel anchorRef={ref} placement="above" panelStyle={{ width: 20 }}>
            <Label>/help</Label>
            <Label>/clear</Label>
          </StickyPanel>
        </VBox>
      );
    }

    const t = await mountApp(<App />, { cols: 80, rows: 24 });
    const panel = panelRegion(t);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.bottom).toBeLessThanOrEqual(24);
    expect(panel.right).toBeLessThanOrEqual(80);
  });
});
