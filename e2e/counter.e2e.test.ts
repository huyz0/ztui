import { afterEach, describe, expect, test } from "vitest";
import { ANSI, type E2EApp, launchApp } from "./harness.ts";

describe("E2E: real BunDriver process lifecycle", () => {
  let appUnderTest: E2EApp | undefined;

  afterEach(() => {
    // Make sure no fixture process leaks if an assertion failed mid-test.
    if (appUnderTest && appUnderTest.proc.exitCode === null) {
      appUnderTest.proc.kill("SIGKILL");
    }
    appUnderTest = undefined;
  });

  test("enters the alternate screen and renders the initial frame", async () => {
    const app = launchApp("counter-app.tsx");
    appUnderTest = app;

    await app.waitForScreen((s) => s.includes("COUNT:0"));

    // The real driver must switch to the alternate screen buffer and hide the
    // cursor on startup — behavior the in-process VTEDriver never exercises.
    expect(app.raw()).toContain(ANSI.enterAltScreen);
    expect(app.raw()).toContain(ANSI.hideCursor);
    expect(app.screen()).toContain("Increment");
  });

  test("reacts to stdin keypresses and re-renders", async () => {
    const app = launchApp("counter-app.tsx");
    appUnderTest = app;

    await app.waitForScreen((s) => s.includes("COUNT:0"));

    // Enter activates the focused button → count increments → diff is written
    // back out and reconstructed by the VT parser. Retry to absorb the focus race.
    await app.sendUntil("\r", (s) => /COUNT:[1-9]/.test(s));
  });

  test("enables SGR mouse tracking and reacts to a real click", async () => {
    const app = launchApp("counter-app.tsx");
    appUnderTest = app;

    await app.waitForScreen((s) => s.includes("COUNT:0"));

    // Without a TTY the driver opts into mouse mode unconditionally, so the
    // enable sequences must appear in the raw stream.
    expect(app.raw()).toContain(ANSI.enableSgrMouse);
    expect(app.raw()).toContain(ANSI.enableMouseTracking);

    // Sweep clicks across the button's row until the counter increments. The
    // exact column/offset is layout-dependent, so we cover the whole row; the
    // counter is monotonic, so extra clicks are harmless.
    await app.sendUntil(Array.from({ length: 20 }, (_, x) => `\x1b[<0;${x + 1};2M`).join(""), (s) =>
      /COUNT:[1-9]/.test(s),
    );
  });

  test("Ctrl+C restores the terminal and exits cleanly", async () => {
    const app = launchApp("counter-app.tsx");
    appUnderTest = app;

    await app.waitForScreen((s) => s.includes("COUNT:0"));

    app.send("\x03"); // Ctrl+C
    const code = await app.waitForExit();

    expect(code).toBe(0);
    // Terminal state must be restored on shutdown so the host shell is left clean.
    expect(app.raw()).toContain(ANSI.leaveAltScreen);
    expect(app.raw()).toContain(ANSI.showCursor);
  });

  test("SIGTERM triggers cleanup and the documented exit code", async () => {
    const app = launchApp("counter-app.tsx");
    appUnderTest = app;

    await app.waitForScreen((s) => s.includes("COUNT:0"));

    app.proc.kill("SIGTERM");
    const code = await app.waitForExit();

    // BunDriver's SIGTERM handler exits 143 (128 + 15) after restoring state.
    expect(code).toBe(143);
    expect(app.raw()).toContain(ANSI.leaveAltScreen);
  });
});
