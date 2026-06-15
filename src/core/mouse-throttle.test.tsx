import { describe, expect, test } from "vitest";
import { Box } from "../react.ts";
import { mountApp } from "../test/harness.tsx";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Last pointer cell the app actually *processed* (updated inside processMouse). */
function processedX(app: unknown): number {
  return (app as { lastMouseX: number }).lastMouseX;
}
function emit(t: Awaited<ReturnType<typeof mountApp>>, ev: Record<string, unknown>): void {
  (t.driver as unknown as { emit: (e: string, ev: unknown) => void }).emit("mouse", ev);
}

describe("pointer-move throttling", () => {
  test("a burst of moves processes the leading one now and coalesces the rest", async () => {
    const t = await mountApp(<Box style={{ width: "100%", height: "100%" }} />, {
      cols: 40,
      rows: 12,
    });
    await t.settle();

    // Six rapid moves across distinct cells in one tick.
    for (let i = 1; i <= 6; i++) emit(t, { x: i, y: 1, type: "move", button: "none" });
    // Only the leading move (cell 1) was processed synchronously; 2..6 are pending.
    expect(processedX(t.app)).toBe(1);

    // After the throttle window (~66ms), the latest pending move (cell 6) applies.
    await sleep(90);
    expect(processedX(t.app)).toBe(6);
  });

  test("a press is never delayed and flushes the pending move first", async () => {
    const t = await mountApp(<Box style={{ width: "100%", height: "100%" }} />, {
      cols: 40,
      rows: 12,
    });
    await t.settle();

    emit(t, { x: 1, y: 1, type: "move", button: "none" }); // leading → processed (cell 1)
    emit(t, { x: 2, y: 1, type: "move", button: "none" }); // pending
    emit(t, { x: 3, y: 1, type: "press", button: "left" }); // flush pending + press now
    // The press is processed immediately (cell 3), not delayed behind the timer.
    expect(processedX(t.app)).toBe(3);
  });
});
