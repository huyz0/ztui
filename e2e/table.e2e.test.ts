import { afterEach, describe, expect, test } from "vitest";
import { ANSI, type E2EApp, launchApp } from "./harness.ts";

describe("E2E: Table widget over a real BunDriver", () => {
  let appUnderTest: E2EApp | undefined;

  afterEach(() => {
    if (appUnderTest && appUnderTest.proc.exitCode === null) {
      appUnderTest.proc.kill("SIGKILL");
    }
    appUnderTest = undefined;
  });

  test("renders the header and the first window of rows in the alt screen", async () => {
    const app = launchApp("table-app.tsx");
    appUnderTest = app;

    await app.waitForScreen((s) => s.includes("ROW-0"));

    expect(app.raw()).toContain(ANSI.enterAltScreen);
    expect(app.screen()).toContain("LABEL"); // header
    expect(app.screen()).toContain("ROW-0");
    // A row far past the viewport must not be drawn (virtualization).
    expect(app.screen()).not.toContain("ROW-500");
  });

  test("arrow-down scrolls new rows into the viewport", async () => {
    const app = launchApp("table-app.tsx");
    appUnderTest = app;

    await app.waitForScreen((s) => s.includes("ROW-0"));

    // Hold Down (resent until a far row appears) to scroll the body. The down
    // arrow is the standard CSI sequence the driver parses.
    await app.sendUntil("\x1b[B", (s) => /ROW-3\d\b/.test(s), { intervalMs: 60 });
  });

  test("Ctrl+C restores the terminal and exits cleanly", async () => {
    const app = launchApp("table-app.tsx");
    appUnderTest = app;

    await app.waitForScreen((s) => s.includes("ROW-0"));

    app.send("\x03");
    const code = await app.waitForExit();
    expect(code).toBe(0);
    expect(app.raw()).toContain(ANSI.leaveAltScreen);
    expect(app.raw()).toContain(ANSI.showCursor);
  });
});
