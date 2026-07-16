import { describe, expect, test } from "vitest";
import { Screen } from "../dom/screen.ts";
import { MockDriver } from "../driver/mock/index.ts";
import { Label } from "../react.ts";
import { mountApp } from "../test/harness.tsx";
import { App } from "./app.ts";

describe("App: constructor default driver and screen stack", () => {
  test("with no driver argument, defaults to a real BunDriver", () => {
    // Constructing (not starting/running) a BunDriver is inert — no stdin wiring
    // happens until `run()`, so this is safe to exercise directly.
    const app = new App();
    expect(app.driver.constructor.name).toBe("BunDriver");
  });

  test("popScreen on the base screen is a no-op: the stack never empties", () => {
    const app = new App(new MockDriver());
    expect(app.activeScreen).toBeDefined();
    const base = app.activeScreen;
    app.popScreen();
    expect(app.activeScreen).toBe(base);
  });

  test("pushScreen then popScreen returns to the previous screen and detaches the popped one's parent", () => {
    const app = new App(new MockDriver());
    const base = app.activeScreen;
    const second = new Screen();
    app.pushScreen(second);
    expect(app.activeScreen).toBe(second);
    expect(second.parent).toBe(app);

    app.popScreen();
    expect(app.activeScreen).toBe(base);
    expect(second.parent).toBeNull();
  });

  test("pushScreen skips the resize/layout pass when the driver reports a zero size", () => {
    const app = new App(new MockDriver(0, 0));
    const second = new Screen();
    // Must not throw even though no layout ever ran for the base screen.
    expect(() => app.pushScreen(second)).not.toThrow();
    expect(app.activeScreen).toBe(second);
    // Never resized: still at Screen's own construction-time default, not the
    // 80x24 floor pushScreen would have applied had size.width been > 0.
    expect(second.region.width).toBe(0);
  });

  test("pushScreen after the app has settled still forces a full frame (no pending damage info)", async () => {
    // pushScreen calls layoutAndRender() directly, bypassing the scheduleRender
    // microtask that normally sets needsLayout/repaintFull. Once the app has
    // already rendered once (so those flags — and the damage bounds — are back
    // at their reset/idle state), this direct call has neither a relayout nor an
    // explicit full-repaint reason: it only reaches a full frame via the
    // "no damage info" fallback (damageTop still Number.POSITIVE_INFINITY).
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();
    const before = t.app.framePipelineRunCount;

    const second = new Screen();
    t.app.pushScreen(second);

    expect(t.app.framePipelineRunCount).toBe(before + 1);
    const f = t.app.getLastFrame();
    expect(f?.relayout).toBe(false); // pushScreen itself never calls queueRender
    expect(f?.full).toBe(true); // yet the frame still came out full
    expect(f?.damageY0).toBe(0);
    expect(f?.damageY1).toBe(5);
  });
});
