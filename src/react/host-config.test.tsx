import { describe, expect, test, vi } from "vitest";
import { Box } from "../react.ts";
import { mountApp } from "../test/harness.tsx";

describe("host-config applyProps", () => {
  test("onScroll is wired to the widget instance, not silently dropped", async () => {
    // Regression: onScroll is typed on ComponentProps and Widget.onScroll
    // exists (and fires from handleScroll), but the generic prop-mirror in
    // applyProps explicitly skips every "on*"-prefixed key, and
    // KNOWN_HANDLER_PROPS (the list of handlers applied explicitly) omitted
    // "onScroll" -- so a JSX onScroll={...} prop never reached the widget at
    // all, despite looking fully wired (typed, documented, and a real widget
    // field ready to receive it).
    const onScroll = vi.fn();
    const t = await mountApp(<Box id="box" onScroll={onScroll} style={{ height: 3 }} />, {
      rows: 10,
    });
    const box = t.findById<any>("box");
    expect(box.onScroll).toBe(onScroll);

    box.handleScroll({ type: "scroll_down" });
    expect(onScroll).toHaveBeenCalledTimes(1);
  });
});
