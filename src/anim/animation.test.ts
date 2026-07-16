import { describe, expect, test } from "vitest";
import { requestAnimationTick, requestCosmeticRepaint } from "./animation.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeOwner() {
  const calls = { render: 0, repaint: 0 };
  const owner = {
    app: {
      queueRender: () => {
        calls.render++;
      },
      queueRepaint: () => {
        calls.repaint++;
      },
    },
  };
  return { owner, calls };
}

describe("requestAnimationTick", () => {
  test("paint-only ticks request a batched repaint, not a full render", async () => {
    const { owner, calls } = fakeOwner();
    requestAnimationTick(owner, 16, true);
    await sleep(130);
    expect(calls).toEqual({ render: 0, repaint: 1 });
  });

  test("default ticks request a full render", async () => {
    const { owner, calls } = fakeOwner();
    requestAnimationTick(owner, 16);
    await sleep(40);
    expect(calls).toEqual({ render: 1, repaint: 0 });
  });

  test("a full request in the same frame upgrades a pending paint-only tick", async () => {
    const { owner, calls } = fakeOwner();
    requestAnimationTick(owner, 16, true); // books paint-only
    requestAnimationTick(owner, 16, false); // coincident full request wins
    await sleep(40);
    expect(calls).toEqual({ render: 1, repaint: 0 });
  });

  test("coalesces to a single frame per owner", async () => {
    const { owner, calls } = fakeOwner();
    for (let i = 0; i < 10; i++) requestAnimationTick(owner, 16, true);
    await sleep(130);
    expect(calls.repaint).toBe(1);
  });

  test("owners due together fire in one macrotask, coalescing into a single frame", async () => {
    // Mirror App.scheduleRender's within-a-macrotask dedup: repaints requested in
    // the same macrotask collapse to one frame; ones in separate macrotasks don't.
    let frames = 0;
    let queued = false;
    const app = {
      queueRender: () => {},
      queueRepaint: () => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          frames++;
        });
      },
    };
    requestAnimationTick({ app }, 16, true);
    requestAnimationTick({ app }, 16, true);
    requestAnimationTick({ app }, 16, true);
    await sleep(130);
    // All three are due together, so the shared clock fires them in one macrotask
    // → a single coalesced frame (not three).
    expect(frames).toBe(1);
  });

  test("falls back to queueRender when the app lacks queueRepaint", async () => {
    const calls = { render: 0 };
    const owner = { app: { queueRender: () => calls.render++ } };
    requestAnimationTick(owner, 16, true);
    await sleep(130);
    expect(calls.render).toBe(1);
  });

  test("re-booking a pending tick with a sooner due time moves it earlier", async () => {
    const { owner, calls } = fakeOwner();
    requestAnimationTick(owner, 200, true); // booked far out
    requestAnimationTick(owner, 16, true); // re-booked sooner — should win
    await sleep(150);
    // The sooner (16ms) due time should have fired already, well before 200ms.
    expect(calls.repaint).toBe(1);
  });
});

describe("requestCosmeticRepaint", () => {
  test("is a no-op for a detached owner (no app)", () => {
    expect(() => requestCosmeticRepaint({ app: null }, "test")).not.toThrow();
    expect(() => requestCosmeticRepaint({}, "test")).not.toThrow();
  });

  test("merges reasons from repeated requests for the same owner into one batched call", async () => {
    const calls: string[] = [];
    const app = {
      queueRender: () => {},
      queueRepaint: (_region: unknown, reason?: string) => {
        if (reason) calls.push(reason);
      },
    };
    const owner = { app };
    requestCosmeticRepaint(owner, "reason-a");
    requestCosmeticRepaint(owner, "reason-b"); // same owner — merges into the existing entry
    await sleep(130);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("reason-a");
    expect(calls[0]).toContain("reason-b");
  });

  test("skips an app whose queueRepaint disappears before the batched flush fires", async () => {
    const calls = { repaint: 0, render: 0 };
    const app: { queueRender: () => void; queueRepaint?: () => void } = {
      queueRender: () => {
        calls.render++;
      },
      queueRepaint: () => {
        calls.repaint++;
      },
    };
    requestCosmeticRepaint({ app }, "vanishing");
    // Simulate the capability disappearing between scheduling and the flush —
    // flushCosmeticRepaints must skip this app rather than throw.
    app.queueRepaint = undefined;
    await sleep(130);
    expect(calls).toEqual({ repaint: 0, render: 0 });
  });
});
