import { useRef } from "react";
import { describe, expect, test } from "vitest";
import type { Widget } from "../../../dom/widget.ts";
import { Button, Label, Popover, Tooltip, useTooltip, VBox } from "../../../react.ts";
import { mountApp, waitFor } from "../../../test/harness.tsx";

describe("Popover", () => {
  function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
    const ref = useRef<Widget>(null);
    return (
      <VBox>
        <Button id="trigger" ref={ref}>
          Open
        </Button>
        <Popover open={open} anchorRef={ref} onClose={onClose}>
          <Label>Popover body</Label>
        </Popover>
      </VBox>
    );
  }

  test("renders content placed below its anchor", async () => {
    const { text, findById, screen, settle } = await mountApp(<Harness open onClose={() => {}} />, {
      cols: 80,
      rows: 24,
    });
    await settle();
    expect(text()).toContain("Popover body");
    const trigger = findById("trigger") as Widget;
    const panel = (screen.overlays[0].children[0] as Widget).region;
    expect(panel.y).toBeGreaterThanOrEqual(trigger.getClientRect().bottom); // default "bottom"
    expect(panel.right).toBeLessThanOrEqual(80);
    expect(panel.bottom).toBeLessThanOrEqual(24);
    expect((screen.overlays[0] as { shadow?: boolean }).shadow).toBe(true); // popovers cast a shadow
  });

  test("Esc and outside-click request close", async () => {
    let closes = 0;
    const { driver, settle } = await mountApp(<Harness open onClose={() => closes++} />, {
      cols: 80,
      rows: 24,
    });
    await settle();
    driver.simulateKey("escape", "escape");
    await settle();
    expect(closes).toBe(1);
    driver.simulateMouse(70, 20, "press", "left"); // empty area → outside click
    await settle();
    expect(closes).toBe(2);
  });
});

describe("Tooltip", () => {
  function Harness() {
    const tip = useTooltip({ delay: 0 });
    return (
      <VBox>
        <Button id="trigger" ref={tip.ref} {...tip.triggerProps}>
          Hover me
        </Button>
        <Tooltip {...tip.props}>
          <Label>Tip text</Label>
        </Tooltip>
      </VBox>
    );
  }

  test("shows on hover and hides on leave, without a drop shadow", async () => {
    const { text, findById, driver, screen, settle } = await mountApp(<Harness />, {
      cols: 80,
      rows: 24,
    });
    await settle();
    expect(text()).not.toContain("Tip text");

    const r = findById("trigger").getClientRect();
    driver.simulateMouse(r.x + 1, r.y, "move", "none"); // hover the trigger
    await waitFor(() => text().includes("Tip text"));
    // A lightweight one-line hint casts no shadow.
    expect((screen.overlays[0] as { shadow?: boolean }).shadow).toBe(false);

    driver.simulateMouse(70, 20, "move", "none"); // move away
    await waitFor(() => !text().includes("Tip text"));
  });
});
