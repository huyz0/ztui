import { describe, expect, test } from "vitest";
import { requestAnimationTick } from "./animation.ts";

describe("animation repaint reasons", () => {
  test("includes owner tag in batched paint-only repaint reasons", async () => {
    let reason = "";
    const owner = {
      tagName: "spinner",
      region: { y: 1, bottom: 2 },
      app: {
        queueRender: () => {},
        queueRepaint: (_region?: { y: number; bottom: number } | null, why?: string) => {
          reason = why ?? "";
        },
      },
    };

    requestAnimationTick(owner as any, 1, true);
    await new Promise((r) => setTimeout(r, 130));

    expect(reason).toContain("cosmetic-batch");
    expect(reason).toContain("animation:paint-only:spinner");
  });
});
