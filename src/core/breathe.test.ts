import { afterEach, describe, expect, test } from "vitest";
import { ATTENTION_BREATH, breatheColor, breatheIntensity, FOCUS_BREATH } from "./breathe.ts";
import { motion } from "./motion.ts";

afterEach(() => motion.reset());

describe("breatheIntensity", () => {
  test("peaks at the start of the period and troughs at the half-period", () => {
    expect(breatheIntensity(0, 1000)).toBeCloseTo(1, 5);
    expect(breatheIntensity(500, 1000)).toBeCloseTo(0, 5);
  });

  test("stays within [0,1] across the cycle", () => {
    for (let ms = 0; ms < 2000; ms += 53) {
      const v = breatheIntensity(ms, 1000);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test("is periodic", () => {
    expect(breatheIntensity(123, 1000)).toBeCloseTo(breatheIntensity(1123, 1000), 6);
  });
});

describe("breatheColor", () => {
  test("at the crest it lands at mix(base, hi, amplitude) — never full hi", () => {
    // period 1000, t=0 → crest. amplitude 0.5 → halfway between black and white.
    const c = breatheColor("#000000", "#ffffff", 0, { periodMs: 1000, amplitude: 0.5 });
    expect(c).toBe("rgb(128, 128, 128)");
  });

  test("at the trough it sits on the base colour", () => {
    const c = breatheColor("#000000", "#ffffff", 500, { periodMs: 1000, amplitude: 0.5 });
    expect(c).toBe("rgb(0, 0, 0)");
  });

  test("falls back to base when an endpoint is unparseable", () => {
    expect(breatheColor("not-a-color", "#fff", 0, FOCUS_BREATH)).toBe("not-a-color");
  });
});

describe("presets", () => {
  test("attention is louder and faster than focus", () => {
    expect(ATTENTION_BREATH.amplitude).toBeGreaterThan(FOCUS_BREATH.amplitude);
    expect(ATTENTION_BREATH.periodMs).toBeLessThan(FOCUS_BREATH.periodMs);
  });
});

describe("motion flag", () => {
  test("defaults off under the test runner (deterministic colours)", () => {
    expect(motion.enabled).toBe(false);
  });

  test("can be toggled", () => {
    motion.set(true);
    expect(motion.enabled).toBe(true);
    motion.set(false);
    expect(motion.enabled).toBe(false);
  });
});
