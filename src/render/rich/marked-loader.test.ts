import { afterEach, describe, expect, it, vi } from "vitest";

describe("getMarked", () => {
  afterEach(() => {
    vi.doUnmock("node:module");
    vi.resetModules();
  });

  it("returns the marked function when the package is installed", async () => {
    const { getMarked } = await import("./marked-loader.ts");
    const marked = getMarked();
    expect(typeof marked).toBe("function");
    // Cached: a second call returns the same reference without re-requiring.
    expect(getMarked()).toBe(marked);
  });

  it("throws an actionable error when 'marked' cannot be required", async () => {
    vi.resetModules();
    vi.doMock("node:module", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:module")>();
      return {
        ...actual,
        createRequire: () => () => {
          throw new Error("Cannot find module 'marked'");
        },
      };
    });
    const { getMarked } = await import("./marked-loader.ts");
    expect(() => getMarked()).toThrow(/optional 'marked' dependency/);
  });
});
