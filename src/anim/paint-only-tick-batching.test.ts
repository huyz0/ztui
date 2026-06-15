import { describe, expect, test } from "vitest";
import { requestAnimationTick } from "./animation.ts";

describe("paint-only animation ticks", () => {
  test("route through cosmetic batcher instead of immediate repaint", async () => {
    let reason = "";
    let calls = 0;
    const app = {
      queueRender: () => {},
      queueRepaint: (_region?: { y: number; bottom: number } | null, why?: string) => {
        calls += 1;
        reason = why ?? "";
      },
    };
    const owner = { app, tagName: "input", region: { y: 1, bottom: 2 } };

    requestAnimationTick(owner as any, 16, true);
    await new Promise((r) => setTimeout(r, 130));

    expect(calls).toBe(1);
    expect(reason).toContain("cosmetic-batch");
    expect(reason).toContain("animation:paint-only:input");
  });
});
