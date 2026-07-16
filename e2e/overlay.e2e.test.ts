import { afterEach, describe, expect, test } from "vitest";
import { type E2EApp, launchApp } from "./harness.ts";

describe("E2E: overlays (Dialog + Select dropdown) over a real BunDriver", () => {
  let appUnderTest: E2EApp | undefined;

  afterEach(() => {
    if (appUnderTest && appUnderTest.proc.exitCode === null) {
      appUnderTest.proc.kill("SIGKILL");
    }
    appUnderTest = undefined;
  });

  test("a modal Dialog opens on activation and closes on Esc", async () => {
    const app = launchApp("overlay-app.tsx");
    appUnderTest = app;

    await app.waitForScreen((s) => s.includes("DIALOG:CLOSED"));

    // The button is auto-focused; Enter activates it, opening the dialog on a
    // real overlay layer (a new Screen-level overlay, not just conditional JSX).
    await app.sendUntil("\r", (s) => s.includes("DIALOG:OPEN"));
    expect(app.screen()).toContain("Dialog Content");

    // Esc dismisses it (Dialog's default closeOnEscape).
    await app.sendUntil("\x1b", (s) => s.includes("DIALOG:CLOSED"));
  });

  test("a Select dropdown opens, lists options, and commits a choice", async () => {
    const app = launchApp("overlay-app.tsx");
    appUnderTest = app;

    await app.waitForScreen((s) => s.includes("SELECTED:none"));

    // Tab from the auto-focused button onto the Select.
    app.send("\t");

    // Enter opens the dropdown overlay; its options render as real widgets.
    await app.sendUntil("\r", (s) => s.includes("alpha") && s.includes("beta"));

    // Down moves the highlight to "beta", Enter commits it.
    app.send("\x1b[B");
    await app.sendUntil("\r", (s) => s.includes("SELECTED:beta"));
  });
});
