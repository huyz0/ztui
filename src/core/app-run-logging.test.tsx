import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MockDriver } from "../driver/mock/index.ts";
import { logger } from "../utils/logger.ts";
import { App } from "./app.ts";

describe("App.run(): debug logging and resize-timer coalescing", () => {
  let logDir: string;
  let logFile: string;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), "ztui-app-run-"));
    logFile = join(logDir, "ztui.log");
    logger.configure({ filePath: logFile, level: "debug" });
  });

  afterEach(() => {
    logger.reset();
    rmSync(logDir, { recursive: true, force: true });
  });

  test("with debug logging enabled, run() logs the resolved screen bounds", () => {
    const driver = new MockDriver(80, 24);
    const app = new App(driver);
    app.run();
    const contents = readFileSync(logFile, "utf8");
    expect(contents).toContain("Initial screen bounds resolved: 80x24");
    app.stop();
  });

  test("a second resize before the debounce fires clears the pending timeout instead of stacking two", () => {
    const driver = new MockDriver(80, 24);
    const app = new App(driver);
    app.run();

    driver.simulateResize(100, 30);
    // Immediately fire another resize: must clear the first pending timeout
    // (the `if (this.resizeTimeout)` branch) rather than leaving it to also fire.
    driver.simulateResize(120, 40);

    const contents = readFileSync(logFile, "utf8");
    expect(contents).toContain("Resize event: 100x30");
    expect(contents).toContain("Resize event: 120x40");
    app.stop();
  });
});
