import { afterEach, describe, expect, test } from "vitest";
import { ToastManager, toast } from "../core/toast.ts";
import type { Widget } from "../dom/widget.ts";
import { ToastHost } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

afterEach(() => ToastManager.getInstance().clear());

describe("ToastManager", () => {
  test("notify / dismiss / clear and subscribe notifications", () => {
    const mgr = ToastManager.getInstance();
    let pings = 0;
    const unsub = mgr.subscribe(() => pings++);

    const id = mgr.notify({ level: "info", message: "hi" });
    expect(mgr.getToasts()).toHaveLength(1);
    expect(pings).toBe(1);

    mgr.notify({ message: "generic one" });
    expect(mgr.getToasts()).toHaveLength(2);
    expect(mgr.getToasts()[1].level).toBe("generic");

    mgr.dismiss(id);
    expect(mgr.getToasts()).toHaveLength(1);
    expect(pings).toBe(3);

    mgr.clear();
    expect(mgr.getToasts()).toHaveLength(0);

    unsub();
    mgr.notify({ message: "after unsub" });
    expect(pings).toBe(4); // no further ping
    mgr.clear();
  });

  test("errors are sticky (duration 0) by default; others time out", () => {
    const mgr = ToastManager.getInstance();
    mgr.notify({ level: "error", message: "boom" });
    mgr.notify({ level: "info", message: "fyi" });
    expect(mgr.getToasts()[0].duration).toBe(0);
    expect(mgr.getToasts()[1].duration).toBeGreaterThan(0);
  });
});

describe("ToastHost", () => {
  test("shows a layer with the toast text and hides when empty", async () => {
    const t = await mountApp(<ToastHost />);
    expect(t.screen.layers.length).toBe(0);

    toast.success("Saved!", { duration: 0 });
    await t.settle();
    expect(t.screen.layers.length).toBe(1);
    expect(t.text()).toContain("Saved!");

    toast.clear();
    await t.settle();
    expect(t.screen.layers.length).toBe(0);
  });

  test("clicking a toast dismisses it", async () => {
    const t = await mountApp(<ToastHost position="top-right" />);
    toast.error("Failed");
    await t.settle();
    expect(t.screen.layers.length).toBe(1);

    // Click inside the toast box (its region lives in the overlay subtree).
    const box = t.screen.layers[0].root.children[0].children[0] as Widget;
    const r = box.region;
    t.driver.simulateMouse(r.x + 1, r.y + 1, "press", "left");
    await t.settle();

    expect(t.screen.layers.length).toBe(0);
  });

  test("auto-dismisses a timed toast", async () => {
    const t = await mountApp(<ToastHost />);
    toast.info("transient", { duration: 30 });
    await t.settle();
    expect(t.text()).toContain("transient");

    await t.settle(60);
    expect(ToastManager.getInstance().getToasts()).toHaveLength(0);
  });

  test("collapses overflow beyond max into a '+N more' row", async () => {
    const t = await mountApp(<ToastHost max={3} />);
    for (let i = 0; i < 7; i++) toast.info(`msg ${i}`, { duration: 0 });
    await t.settle();
    expect(t.text()).toContain("+4 more");
  });
});
