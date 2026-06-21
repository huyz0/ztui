import { describe, expect, test } from "vitest";
import { Label, VBox } from "../react.ts";
import { mountApp } from "../test/harness.tsx";
import { flush, type MountResult } from "../tools/app-mount.tsx";

/**
 * Deterministic frame-scheduling contract, asserted through {@link App.getLastFrame}
 * and {@link App.framePipelineRunCount} rather than React's commit timing (which
 * was too racy to test in earlier attempts at subtree-damage skipping). Every case
 * drives the scheduler directly — `queueRender` / `queueRepaint` + `flush` — and
 * inspects exactly what the resulting frame did.
 *
 * This pins the *current* behaviour so a future dirty-tracking / damage-scoping
 * change has a precise, non-flaky net: the redundant-frame cases below are the
 * work that change aims to remove, and they should flip from "ran, emitted
 * nothing" to "did not run" — observable here without touching React.
 */

/** Run `action`, flush one frame, and report how many pipeline runs it caused. */
async function runsDuring(t: MountResult, action: () => void): Promise<number> {
  const before = t.app.framePipelineRunCount;
  action();
  await flush();
  return t.app.framePipelineRunCount - before;
}

describe("frame scheduling: pipeline-run accounting", () => {
  test("a settled idle app runs no further pipeline on an empty flush", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();
    // Nothing queued → flushing the loop must not run the pipeline. This is the
    // precondition for skipping clean frames: idle costs nothing.
    expect(await runsDuring(t, () => {})).toBe(0);
  });

  test("coalesced requests in one tick collapse to a single run", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();
    expect(
      await runsDuring(t, () => {
        t.app.queueRender();
        t.app.queueRender();
        t.app.queueRepaint();
      }),
    ).toBe(1);
  });

  test("seq advances by exactly one per pipeline run", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();
    const before = t.app.getLastFrame()?.seq ?? 0;
    t.app.queueRender();
    await flush();
    expect(t.app.getLastFrame()?.seq).toBe(before + 1);
  });
});

describe("frame scheduling: frame scope", () => {
  test("queueRender produces a full relayout frame over every row", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();
    t.app.queueRender("test:full");
    await flush();
    const f = t.app.getLastFrame();
    expect(f).not.toBeNull();
    expect(f?.full).toBe(true);
    expect(f?.relayout).toBe(true);
    expect(f?.restyle).toBe(true);
    expect(f?.damageY0).toBe(0);
    expect(f?.damageY1).toBe(5);
    expect(f?.reasons).toContain("test:full");
  });

  test("queueRepaint() is a full-screen frame that reuses layout", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();
    t.app.queueRepaint(null, "test:paint");
    await flush();
    const f = t.app.getLastFrame();
    expect(f?.full).toBe(true); // whole screen
    expect(f?.relayout).toBe(false); // but no measure/layout
    expect(f?.restyle).toBe(false); // and styles reused (no stylesheet)
    expect(f?.damageY0).toBe(0);
    expect(f?.damageY1).toBe(5);
    expect(f?.reasons).toContain("repaint:test:paint");
  });

  test("queueRepaint(region) scopes the frame to the damaged rows", async () => {
    const t = await mountApp(
      <VBox>
        <Label>row0</Label>
        <Label>row1</Label>
        <Label>row2</Label>
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await t.settle();
    t.app.queueRepaint({ y: 1, bottom: 2 }, "test:band");
    await flush();
    const f = t.app.getLastFrame();
    expect(f?.full).toBe(false);
    expect(f?.relayout).toBe(false);
    expect(f?.damageY0).toBe(1);
    expect(f?.damageY1).toBe(2);
  });

  test("a queueRender in the same tick widens a scoped repaint to a full frame", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();
    t.app.queueRepaint({ y: 1, bottom: 2 });
    t.app.queueRender();
    await flush();
    const f = t.app.getLastFrame();
    expect(f?.full).toBe(true);
    expect(f?.relayout).toBe(true);
  });
});

describe("frame scheduling: emit vs. redundant work", () => {
  test("a redundant queueRender on an unchanged tree runs but emits nothing", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();
    // The tree didn't change, so the diff finds nothing — yet the whole pipeline
    // still ran. This wasted pass is exactly what subtree-damage / dirty tracking
    // would eliminate; the test documents the cost so that work can prove itself.
    const runs = await runsDuring(t, () => t.app.queueRender());
    expect(runs).toBe(1);
    expect(t.app.getLastFrame()?.emitted).toBe(false);
    expect(t.app.getLastFrame()?.bytes).toBe(0);
  });

  test("a genuine change emits bytes", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();
    // refresh() invalidates the retained buffer, so the next frame re-emits.
    const runs = await runsDuring(t, () => t.app.refresh("test:change"));
    expect(runs).toBe(1);
    const f = t.app.getLastFrame();
    expect(f?.emitted).toBe(true);
    expect(f?.bytes).toBeGreaterThan(0);
  });
});
