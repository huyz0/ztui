import { afterEach, describe, expect, it, vi } from "vitest";

describe("resolveHeroIcon / registerHeroIcon", () => {
  afterEach(() => {
    vi.doUnmock("node:module");
    vi.resetModules();
  });

  it("resolves solid, outline, mini, and micro variants to real SVG markup", async () => {
    const { resolveHeroIcon } = await import("./heroicons.ts");
    for (const variant of ["solid", "outline", "mini", "micro"] as const) {
      const svg = resolveHeroIcon("academic-cap", variant);
      expect(svg).toContain("<svg");
    }
  });

  it("throws for an icon name that doesn't exist in the package", async () => {
    const { resolveHeroIcon } = await import("./heroicons.ts");
    expect(() => resolveHeroIcon("not-a-real-icon")).toThrow(/does not exist/);
  });

  it("registerHeroIcon logs and no-ops instead of throwing for a missing icon", async () => {
    const { registerHeroIcon } = await import("./heroicons.ts");
    const { iconRegistry } = await import("./icon-registry.ts");
    const registryName = registerHeroIcon("not-a-real-icon-either", "outline");
    expect(registryName).toBe("hero:outline:not-a-real-icon-either");
    expect(iconRegistry.get(registryName)).toBeUndefined();
  });

  it("registerHeroIcon is a no-op the second time (already registered)", async () => {
    const { registerHeroIcon } = await import("./heroicons.ts");
    const { iconRegistry } = await import("./icon-registry.ts");
    const name = registerHeroIcon("academic-cap", "solid");
    expect(iconRegistry.get(name)).toBeDefined();
    // Second call must short-circuit on the existing registration without re-reading the file.
    const again = registerHeroIcon("academic-cap", "solid");
    expect(again).toBe(name);
  });

  it("throws when the heroicons package directory could not be resolved", async () => {
    vi.resetModules();
    vi.doMock("node:module", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:module")>();
      return {
        ...actual,
        createRequire: () => ({
          resolve: () => {
            throw new Error("cannot find module");
          },
        }),
      };
    });
    const { resolveHeroIcon } = await import("./heroicons.ts");
    expect(() => resolveHeroIcon("academic-cap")).toThrow(/not resolved/);
  });
});
