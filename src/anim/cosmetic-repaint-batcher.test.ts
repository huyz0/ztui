import { describe, expect, test } from "vitest";
import { COSMETIC_REPAINT_MS, requestCosmeticRepaint } from "./animation.ts";

describe("cosmetic repaint batcher", () => {
  test("defaults to a shared 10fps repaint cadence", () => {
    expect(COSMETIC_REPAINT_MS).toBe(100);
  });

  test("batches multiple cosmetic repaint requests into one repaint callback", async () => {
    let calls = 0;
    const reasons: string[] = [];
    const app = {
      queueRender: () => {},
      queueRepaint: (_region?: { y: number; bottom: number } | null, reason?: string) => {
        calls += 1;
        if (reason) reasons.push(reason);
      },
    };
    const ownerA = { app, tagName: "input", region: { y: 1, bottom: 2 } };
    const ownerB = { app, tagName: "input", region: { y: 1, bottom: 2 } };

    requestCosmeticRepaint(ownerA as any, "caret:input");
    requestCosmeticRepaint(ownerB as any, "animation:paint-only:input");
    await new Promise((r) => setTimeout(r, 130));

    expect(calls).toBe(1);
    expect(reasons[0]).toContain("cosmetic-batch");
    expect(reasons[0]).toContain("caret:input");
    expect(reasons[0]).toContain("animation:paint-only:input");
  });
});
