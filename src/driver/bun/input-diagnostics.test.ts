import { describe, expect, test } from "vitest";
import { parseInput } from "./input.ts";

describe("parseInput diagnostics", () => {
  test("reports chunk move coalescing statistics", () => {
    const mouseEvents: any[] = [];
    const diagnostics = {
      chunks: 0,
      moveEventsBuffered: 0,
      moveEventsFlushed: 0,
      moveEventsDroppedInChunk: 0,
      keyEvents: 0,
      mouseEvents: 0,
    };

    parseInput(
      "\u001b[<35;10;5M\u001b[<35;11;5M\u001b[<35;12;5M",
      () => {},
      (ev) => mouseEvents.push(ev),
      { buttonDown: false },
      diagnostics as any,
    );

    expect(mouseEvents.length).toBe(1);
    expect(diagnostics.moveEventsBuffered).toBeGreaterThan(0);
    expect(diagnostics.moveEventsDroppedInChunk).toBeGreaterThan(0);
    expect(diagnostics.moveEventsFlushed).toBeGreaterThan(0);
  });
});
