import { describe, expect, test } from "vitest";
import { Style, StyleCache } from "./style.ts";

/**
 * Guards {@link StyleCache}: it must hand back the *same* Style instance for
 * repeated identical field sets (so the render diff's `a === b` identity fast
 * path fires across frames) and a fresh instance the moment a field differs.
 */
describe("StyleCache", () => {
  test("identical props return the same instance", () => {
    const cache = new StyleCache();
    const a = cache.get({ color: "#fff", background: "#000" });
    const b = cache.get({ color: "#fff", background: "#000" });
    expect(b).toBe(a);
  });

  test("a differing field returns a new instance, and both stay cached", () => {
    const cache = new StyleCache();
    const normal = cache.get({ color: "#fff", background: "#000" });
    const selected = cache.get({ color: "#fff", background: "#226" });
    expect(selected).not.toBe(normal);
    // A table alternates between a small fixed set of variants every frame; both
    // must remain reachable so each keeps hitting the identity path.
    expect(cache.get({ color: "#fff", background: "#000" })).toBe(normal);
    expect(cache.get({ color: "#fff", background: "#226" })).toBe(selected);
  });

  test("matches the constructor's boolean normalisation (no spurious misses)", () => {
    const cache = new StyleCache();
    const a = cache.get({ color: "#fff", bold: true });
    // `underline: false` and an omitted `underline` both normalise to false, so
    // they must hit the same cached instance rather than allocating a twin.
    const b = cache.get({ color: "#fff", bold: true, underline: false });
    expect(b).toBe(a);
    // underlineStyle implies underline — must not collide with a plain style.
    const underlined = cache.get({ color: "#fff", bold: true, underlineStyle: "curly" });
    expect(underlined).not.toBe(a);
    expect(underlined.underline).toBe(true);
  });

  test("evicts the oldest entry past its capacity", () => {
    const cache = new StyleCache(2);
    const first = cache.get({ color: "#100" });
    cache.get({ color: "#200" });
    cache.get({ color: "#300" }); // pushes #100 out
    // #100 was evicted, so it is rebuilt as a new instance.
    expect(cache.get({ color: "#100" })).not.toBe(first);
  });

  test("a cached instance is a usable Style equal to a direct construction", () => {
    const cache = new StyleCache();
    const cached = cache.get({ color: "#abc", background: "#123", dim: true });
    expect(cached).toBeInstanceOf(Style);
    expect(cached.equals(new Style({ color: "#abc", background: "#123", dim: true }))).toBe(true);
  });
});
