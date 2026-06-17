import { afterEach, describe, expect, test } from "vitest";
import { motion } from "./motion.ts";

describe("motion preference", () => {
  const saved = { ...process.env };

  afterEach(() => {
    // Restore the real environment, then re-derive the test-runner default (off).
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
    motion.reset();
  });

  test("set() / reset() toggle and re-derive the default", () => {
    motion.set(true);
    expect(motion.enabled).toBe(true);
    motion.set(false);
    expect(motion.enabled).toBe(false);
    motion.reset(); // under VITEST the default is off
    expect(motion.enabled).toBe(false);
  });

  test("honours NO_MOTION / reduced-motion when not under the test runner", () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.NO_MOTION = "1";
    motion.reset();
    expect(motion.enabled).toBe(false);
  });

  test("defaults to on in a plain (non-test, no reduced-motion) environment", () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    delete process.env.NO_MOTION;
    delete process.env.ZTUI_REDUCED_MOTION;
    motion.reset();
    expect(motion.enabled).toBe(true);
  });
});
