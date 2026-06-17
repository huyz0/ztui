import { describe, expect, test } from "vitest";
import { getBaselineCapabilities, parseProbeResponse } from "./bun/capabilities.ts";
import { isPointerShape, POINTER_SHAPES } from "./driver.ts";
import { MockDriver } from "./mock/index.ts";

describe("pointer-shape names", () => {
  test("the standard set has the 30 CSS-derived shapes and no duplicates", () => {
    expect(POINTER_SHAPES).toHaveLength(30);
    expect(new Set(POINTER_SHAPES).size).toBe(30);
    // Spot-check the names the widgets actually reach for.
    for (const name of ["default", "pointer", "text", "grab", "not-allowed", "ew-resize"]) {
      expect(POINTER_SHAPES).toContain(name);
    }
  });

  test("isPointerShape accepts standard names and rejects the rest", () => {
    expect(isPointerShape("pointer")).toBe(true);
    expect(isPointerShape("ns-resize")).toBe(true);
    expect(isPointerShape("col-resize")).toBe(false); // CSS name, not the OSC 22 one
    expect(isPointerShape("")).toBe(false);
    expect(isPointerShape("nonsense")).toBe(false);
  });
});

describe("Driver.setPointerShape (OSC 22)", () => {
  function supportingDriver(): MockDriver {
    const d = new MockDriver();
    d.capabilities.pointerShapes = true;
    d.start();
    return d;
  }

  test("emits the named-shape sequence", () => {
    const d = supportingDriver();
    d.setPointerShape("pointer");
    expect(d.writtenData).toBe("\x1b]22;pointer\x1b\\");
  });

  test("null resets to the terminal default", () => {
    const d = supportingDriver();
    d.setPointerShape("text");
    d.clearWrittenData();
    d.setPointerShape(null);
    expect(d.writtenData).toBe("\x1b]22;\x1b\\");
  });

  test("suppresses a redundant set to the already-active shape", () => {
    const d = supportingDriver();
    d.setPointerShape("grab");
    d.clearWrittenData();
    d.setPointerShape("grab");
    expect(d.writtenData).toBe("");
  });

  test("coerces an unknown name to the default reset rather than emitting it raw", () => {
    const d = supportingDriver();
    // Cast through unknown: a stray CSS value (e.g. "col-resize") could reach here.
    d.setPointerShape("col-resize" as never);
    expect(d.writtenData).toBe("\x1b]22;\x1b\\");
  });

  test("is a no-op when the backend lacks pointer-shape support", () => {
    const d = new MockDriver(); // pointerShapes defaults to false
    d.start();
    d.setPointerShape("pointer");
    expect(d.writtenData).toBe("");
  });
});

describe("OSC 22 capability probing", () => {
  test("baseline capabilities start with pointerShapes off", () => {
    expect(getBaselineCapabilities().pointerShapes).toBe(false);
  });

  test('a "1" reply (ST-terminated) enables the capability', () => {
    const caps = getBaselineCapabilities();
    const { leftover } = parseProbeResponse("\x1b]22;1\x1b\\", caps, 80, 24);
    expect(caps.pointerShapes).toBe(true);
    expect(leftover).toBe("");
  });

  test('a "1" reply (BEL-terminated) also enables it', () => {
    const caps = getBaselineCapabilities();
    parseProbeResponse("\x1b]22;1\x07", caps, 80, 24);
    expect(caps.pointerShapes).toBe(true);
  });

  test('a "0" reply leaves it disabled', () => {
    const caps = getBaselineCapabilities();
    parseProbeResponse("\x1b]22;0\x1b\\", caps, 80, 24);
    expect(caps.pointerShapes).toBe(false);
  });

  test("no OSC 22 reply leaves it disabled and untouched", () => {
    const caps = getBaselineCapabilities();
    const { leftover } = parseProbeResponse("\x1b[?62;4c", caps, 80, 24);
    expect(caps.pointerShapes).toBe(false);
    expect(leftover).toBe(""); // the DA1 reply was still consumed
  });
});
