import { describe, expect, test } from "vitest";
import { requestAnimationTick } from "./animation.ts";

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
  test("paint-only ticks request a repaint, not a full render", async () => {
    const { owner, calls } = fakeOwner();
    requestAnimationTick(owner, 16, true);
    await sleep(40);
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
    await sleep(40);
    expect(calls.repaint).toBe(1);
  });

  test("falls back to queueRender when the app lacks queueRepaint", async () => {
    const calls = { render: 0 };
    const owner = { app: { queueRender: () => calls.render++ } };
    requestAnimationTick(owner, 16, true);
    await sleep(40);
    expect(calls.render).toBe(1);
  });
});
