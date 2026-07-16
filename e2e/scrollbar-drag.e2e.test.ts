import { afterEach, describe, expect, test } from "vitest";
import { type E2EApp, launchApp } from "./harness.ts";

// SGR mouse: press = button code as-is + "M"; drag (motion with button held)
// adds 32 to the button code; release keeps the button code but ends in "m".
const pressAt = (col: number, row: number) => `\x1b[<0;${col};${row}M`;
const dragTo = (col: number, row: number) => `\x1b[<32;${col};${row}M`;
const releaseAt = (col: number, row: number) => `\x1b[<0;${col};${row}m`;

describe("E2E: scrollbar drag over a real BunDriver", () => {
  let appUnderTest: E2EApp | undefined;

  afterEach(() => {
    if (appUnderTest && appUnderTest.proc.exitCode === null) {
      appUnderTest.proc.kill("SIGKILL");
    }
    appUnderTest = undefined;
  });

  test("dragging the thumb down scrolls later rows into view", async () => {
    const app = launchApp("scrollbar-app.tsx");
    appUnderTest = app;

    await app.waitForScreen((s) => s.includes("ROW-0"));
    // Only the first window of rows is visible before any scrolling.
    expect(app.screen()).not.toMatch(/ROW-4\d/);

    // The box is borderless, 20 cols x 10 rows at the screen origin — the
    // scrollbar gutter is the last column (1-based col 20), thumb starts at
    // the top (row 1). Press on the thumb, drag most of the way down the
    // track, then release.
    app.send(pressAt(20, 1));
    app.send(dragTo(20, 8));
    app.send(releaseAt(20, 8));

    // A drag that far down the track scrolls well past the initial window.
    await app.waitForScreen((s) => /ROW-[2-4]\d/.test(s));
  });
});
