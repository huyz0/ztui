import { afterEach, describe, expect, test } from "vitest";
import { ToastManager, toast } from "../core/toast.ts";
import type { Widget } from "../dom/widget.ts";
import { ToastHost } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

afterEach(() => {
  const mgr = ToastManager.getInstance();
  mgr.maxVisible = Number.POSITIVE_INFINITY;
  mgr.clear();
});

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

  test("maxVisible caps visible toasts and queues the overflow", () => {
    const mgr = ToastManager.getInstance();
    mgr.maxVisible = 2;

    mgr.notify({ message: "a" });
    mgr.notify({ message: "b" });
    const idC = mgr.notify({ message: "c" }); // overflows the cap
    expect(mgr.getToasts().map((t) => t.message)).toEqual(["a", "b"]);
    expect(mgr.pendingCount).toBe(1);

    // Dismissing a visible toast promotes the queued one into the freed slot.
    mgr.dismiss(mgr.getToasts()[0].id);
    expect(mgr.getToasts().map((t) => t.message)).toEqual(["b", "c"]);
    expect(mgr.pendingCount).toBe(0);

    // A queued toast can be dismissed before it ever becomes visible.
    mgr.notify({ message: "d" });
    expect(mgr.pendingCount).toBe(1);
    mgr.dismiss(mgr.notify({ message: "e" })); // e queues, then is removed
    expect(mgr.pendingCount).toBe(1);
    void idC;

    // Raising the cap promotes queued toasts immediately and notifies.
    let pinged = 0;
    const unsub = mgr.subscribe(() => pinged++);
    mgr.maxVisible = 5;
    expect(mgr.pendingCount).toBe(0);
    expect(pinged).toBe(1);
    unsub();
  });

  test("shrinking maxVisible demotes the overflow instead of leaving it visible forever", () => {
    // Regression: the setter only called promote() (fills empty slots from
    // pending); it never trimmed already-visible toasts when the cap shrank
    // below the current visible count, so a burst raised under a loose cap
    // stayed visible forever — the cap only applied to toasts raised after.
    const mgr = ToastManager.getInstance();
    mgr.notify({ message: "a" });
    mgr.notify({ message: "b" });
    mgr.notify({ message: "c" });
    mgr.notify({ message: "d" });
    mgr.notify({ message: "e" });
    expect(mgr.getToasts()).toHaveLength(5);

    mgr.maxVisible = 2;
    expect(mgr.getToasts().map((t) => t.message)).toEqual(["a", "b"]);
    expect(mgr.pendingCount).toBe(3);

    // The demoted toasts resume the queue in their original order and
    // promote normally as slots free up.
    mgr.dismiss(mgr.getToasts()[0].id);
    expect(mgr.getToasts().map((t) => t.message)).toEqual(["b", "c"]);
    expect(mgr.pendingCount).toBe(2);
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

  test("clicking the ✕ dismisses the toast", async () => {
    const t = await mountApp(<ToastHost position="top-right" />);
    toast.error("Failed");
    await t.settle();
    expect(t.screen.layers.length).toBe(1);

    // root → corner VBox → toast Box (block left bar) → HBox → [content, close]
    const hbox = t.screen.layers[0].root.children[0].children[0].children[0] as Widget;
    const close = hbox.children[hbox.children.length - 1] as Widget;
    const r = close.region;
    t.driver.simulateMouse(r.x, r.y, "press", "left");
    await t.settle();

    expect(t.screen.layers.length).toBe(0);
  });

  test("the 'clear all' link clears every toast", async () => {
    const t = await mountApp(<ToastHost position="top-right" />);
    toast.info("one", { duration: 0 });
    toast.warn("two", { duration: 0 });
    await t.settle();
    expect(t.text()).toContain("clear all");

    // Footer row is the last child of the corner VBox (top position); the
    // "clear all" link is the last child within it.
    const stack = t.screen.layers[0].root.children[0] as Widget;
    const footer = stack.children[stack.children.length - 1] as Widget;
    const link = footer.children[footer.children.length - 1] as Widget;
    const r = link.region;
    t.driver.simulateMouse(r.right - 1, r.y, "press", "left");
    await t.settle();

    expect(t.screen.layers.length).toBe(0);
    expect(ToastManager.getInstance().getToasts()).toHaveLength(0);
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

  test("max={0} still shows at least one toast instead of hiding everything", async () => {
    // Regression: toasts.slice(toasts.length - max) with max=0 clamps its
    // start to toasts.length, yielding zero visible toasts while `overflow`
    // still counted every one of them — a "+N more" footer with no toasts
    // actually rendered underneath it, silently hiding the whole stack.
    const t = await mountApp(<ToastHost max={0} />);
    toast.info("only one", { duration: 0 });
    await t.settle();
    expect(t.text()).toContain("only one");
  });
});
