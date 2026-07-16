import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { logger } from "./logger.ts";

let dir: string;
let logFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ztui-log-"));
  logFile = join(dir, "test.log");
  logger.configure({ filePath: logFile, level: "debug" });
});

afterEach(() => {
  logger.reset(); // back to the env default (silent) so nothing leaks between tests
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

  test("is silent by default — writes no file and reports no target", () => {
    logger.reset(); // env-derived default (no ZTUI_LOG_FILE in the test env)
    expect(logger.getFilePath()).toBeNull();
    expect(logger.isEnabled("error")).toBe(false); // nothing is emitted
    expect(() => {
      logger.init("App started");
      logger.error("x", "dropped");
    }).not.toThrow();
    expect(read()).toBe(""); // the configured file was never created/written
  });

  test("routes formatted lines to a custom sink", () => {
    const lines: string[] = [];
    logger.configure({ sink: (line) => lines.push(line), level: "debug" });
    logger.init("session"); // a custom sink has nothing to truncate — header is emitted
    logger.warn("net", "hi", { code: 7 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("session");
    expect(lines[1]).toMatch(/\[WARN\] \[net\] hi \{"code":7\}/);
    expect(read()).toBe(""); // and nothing went to the file
  });

  test("enabled:false silences an otherwise-configured logger", () => {
    logger.configure({ enabled: false });
    expect(logger.isEnabled("error")).toBe(false);
    logger.init();
    logger.error("x", "dropped");
    expect(read()).toBe("");
  });

  test("serializes a string payload as-is (no quoting)", () => {
    logger.init();
    logger.info("net", "hi", "extra-string-payload");
    expect(read()).toContain("hi extra-string-payload");
  });

  test("serializes an Error without a stack as `name: message`", () => {
    logger.init();
    const err = new Error("no-stack-here");
    err.stack = undefined;
    logger.error("net", "boom", err);
    expect(read()).toContain("Error: no-stack-here");
  });

  test("falls back to String(data) when a payload can't be JSON-serialized", () => {
    logger.init();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    logger.info("x", "circular", circular);
    expect(read()).toContain("[object Object]");
  });

  test("reset() picks up ZTUI_LOG_FILE from the environment", () => {
    const prevFile = process.env.ZTUI_LOG_FILE;
    const prevLevel = process.env.ZTUI_LOG_LEVEL;
    try {
      process.env.ZTUI_LOG_FILE = logFile;
      process.env.ZTUI_LOG_LEVEL = "debug";
      logger.reset();
      expect(logger.getFilePath()).toBe(logFile);
      logger.info("env", "from-env-file");
      expect(read()).toContain("from-env-file");
    } finally {
      if (prevFile === undefined) delete process.env.ZTUI_LOG_FILE;
      else process.env.ZTUI_LOG_FILE = prevFile;
      if (prevLevel === undefined) delete process.env.ZTUI_LOG_LEVEL;
      else process.env.ZTUI_LOG_LEVEL = prevLevel;
    }
  });

  test("configure({ filePath: '' }) clears the file target and silences the logger", () => {
    logger.configure({ filePath: "" });
    expect(logger.getFilePath()).toBeNull();
    logger.init();
    logger.error("x", "dropped-by-empty-path");
    expect(read()).toBe("");
  });
});
