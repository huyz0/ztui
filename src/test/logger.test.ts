import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { logger } from "../core/logger.ts";

let dir: string;
let logFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ztui-log-"));
  logFile = join(dir, "test.log");
  logger.configure({ filePath: logFile, level: "debug" });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function read(): string {
  return existsSync(logFile) ? readFileSync(logFile, "utf-8") : "";
}

describe("logger", () => {
  test("init truncates and writes a session header", () => {
    logger.info("scope", "first");
    logger.init("fresh session");
    const contents = read();
    expect(contents).toContain("fresh session");
    expect(contents).not.toContain("first");
  });

  test("formats with ISO timestamp, level, and scope", () => {
    logger.init();
    logger.info("widget", "hello world");
    const line = read().trim().split("\n").pop() ?? "";
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[INFO\] \[widget\] hello world$/);
  });

  test("serializes Error payloads with their stack", () => {
    logger.init();
    logger.error("net", "boom", new Error("kaboom"));
    const contents = read();
    expect(contents).toContain("[ERROR] [net] boom");
    expect(contents).toContain("kaboom");
    expect(contents).toContain("Error"); // from the stack trace
  });

  test("serializes object payloads as JSON", () => {
    logger.init();
    logger.debug("layout", "sizes", { w: 80, h: 24 });
    expect(read()).toContain('{"w":80,"h":24}');
  });

  test("respects the configured level threshold", () => {
    logger.configure({ level: "warn" });
    logger.init();
    logger.debug("x", "should-not-appear");
    logger.info("x", "also-not");
    logger.warn("x", "should-appear");
    const contents = read();
    expect(contents).not.toContain("should-not-appear");
    expect(contents).not.toContain("also-not");
    expect(contents).toContain("should-appear");
  });

  test("never throws when the target path is unwritable", () => {
    logger.configure({ filePath: "/this/path/does/not/exist/nope.log", level: "debug" });
    expect(() => {
      logger.init();
      logger.error("x", "still fine", new Error("e"));
    }).not.toThrow();
    // restore for other assertions in suite isolation
    logger.configure({ filePath: logFile, level: "debug" });
  });
});
