import { useRef } from "react";
import { describe, expect, test, vi } from "vitest";
import type { Widget } from "../../../dom/widget.ts";
import { unmount } from "../../../react/reconciler.ts";
import { Button, Label, Popover, Tooltip, useTooltip, VBox } from "../../../react.ts";
import { flush, mountApp, waitFor } from "../../../test/harness.tsx";

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

  test("re-hovering before the delay elapses clears the pending timer", async () => {
    // The trigger's onMouseEnter is a plain callback a consumer can invoke
    // from any event source (not just the pointer-hover pipeline, which only
    // re-fires it after an intervening leave). Calling it twice back-to-back
    // exercises the defensive clearTimeout of an already-pending show timer.
    let onMouseEnter!: () => void;
    let onMouseLeave!: () => void;
    function Harness3() {
      const tip = useTooltip({ delay: 50 });
      onMouseEnter = tip.triggerProps.onMouseEnter;
      onMouseLeave = tip.triggerProps.onMouseLeave;
      return (
        <VBox>
          <Button id="trigger2" ref={tip.ref} {...tip.triggerProps}>
            Hover me
          </Button>
          <Tooltip {...tip.props}>
            <Label>Tip text</Label>
          </Tooltip>
        </VBox>
      );
    }
    const { text, settle } = await mountApp(<Harness3 />, { cols: 80, rows: 24 });
    await settle();
    onMouseEnter();
    onMouseEnter(); // must clear the first pending timer, not schedule a second show
    await waitFor(() => text().includes("Tip text"));
    expect(text()).toContain("Tip text");

    // Leaving twice in a row: the second call finds no pending timer to clear
    // (already cleared by the first), exercising that falsy branch too.
    onMouseLeave();
    onMouseLeave();
    await waitFor(() => !text().includes("Tip text"));
  });

  test("unmounting while a show-timer is pending clears it without error", async () => {
    const clearSpy = vi.spyOn(global, "clearTimeout");
    function Harness2() {
      const tip = useTooltip({ delay: 1000 });
      return (
        <VBox>
          <Button id="trigger3" ref={tip.ref} {...tip.triggerProps}>
            Hover me
          </Button>
          <Tooltip {...tip.props}>
            <Label>Tip text</Label>
          </Tooltip>
        </VBox>
      );
    }
    const { findById, driver, settle, container } = await mountApp(<Harness2 />, {
      cols: 80,
      rows: 24,
    });
    await settle();
    const r = findById("trigger3").getClientRect();
    driver.simulateMouse(r.x + 1, r.y, "move", "none"); // schedule the show timer
    await settle();
    const callsBefore = clearSpy.mock.calls.length;
    unmount(container);
    await flush(10);
    expect(clearSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    clearSpy.mockRestore();
  });
});
