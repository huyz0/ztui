import { describe, expect, test } from "vitest";
import { MockDriver } from "./mock/index.ts";

describe("Driver.setTitle (OSC 0)", () => {
  test("emits the title sequence", () => {
    const d = new MockDriver();
    d.start();
    d.setTitle("ztui — build.tsx");
    expect(d.writtenData).toBe("\x1b]0;ztui — build.tsx\x07");
  });

  test("suppresses a redundant set to the already-active title", () => {
    const d = new MockDriver();
    d.start();
    d.setTitle("same");
    d.clearWrittenData();
    d.setTitle("same");
    expect(d.writtenData).toBe("");
  });

  test("re-emits when the title changes", () => {
    const d = new MockDriver();
    d.start();
    d.setTitle("first");
    d.clearWrittenData();
    d.setTitle("second");
    expect(d.writtenData).toBe("\x1b]0;second\x07");
  });
});

describe("Driver.setProgress (OSC 9;4)", () => {
  test("emits a determinate value, clamped and rounded", () => {
    const d = new MockDriver();
    d.start();
    d.setProgress("normal", 42.6);
    expect(d.writtenData).toBe("\x1b]9;4;1;43\x07");
  });

  test("clamps out-of-range values", () => {
    const d = new MockDriver();
    d.start();
    d.setProgress("normal", 150);
    expect(d.writtenData).toBe("\x1b]9;4;1;100\x07");
    d.clearWrittenData();
    d.setProgress("normal", -10);
    expect(d.writtenData).toBe("\x1b]9;4;1;0\x07");
  });

  test("indeterminate and none omit the value", () => {
    const d = new MockDriver();
    d.start();
    d.setProgress("indeterminate");
    expect(d.writtenData).toBe("\x1b]9;4;3\x07");
    d.clearWrittenData();
    d.setProgress("none");
    expect(d.writtenData).toBe("\x1b]9;4;0\x07");
  });

  test("error and paused carry a value like normal", () => {
    const d = new MockDriver();
    d.start();
    d.setProgress("error", 10);
    expect(d.writtenData).toBe("\x1b]9;4;2;10\x07");
    d.clearWrittenData();
    d.setProgress("paused", 55);
    expect(d.writtenData).toBe("\x1b]9;4;4;55\x07");
  });

  test("suppresses a redundant set to the same state and value", () => {
    const d = new MockDriver();
    d.start();
    d.setProgress("normal", 50);
    d.clearWrittenData();
    d.setProgress("normal", 50);
    expect(d.writtenData).toBe("");
  });

  test("re-emits when only the value changes", () => {
    const d = new MockDriver();
    d.start();
    d.setProgress("normal", 50);
    d.clearWrittenData();
    d.setProgress("normal", 51);
    expect(d.writtenData).toBe("\x1b]9;4;1;51\x07");
  });
});
