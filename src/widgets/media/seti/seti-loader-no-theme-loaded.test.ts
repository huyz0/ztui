import { describe, expect, test } from "vitest";

// Isolated module registry (like the other seti-loader-*.test.ts files) so
// this file's fresh, never-loaded `setiTheme`/`setiFont` singletons aren't
// affected by — or leak into — the happy-path tests in seti.test.tsx.
//
// registerSetiIcon() doesn't call loadSetiTheme() itself; it only reads the
// module-level `setiTheme` cache populated elsewhere (typically via
// resolveFileIcon() or loadSetiIcons()). Calling it directly, before anything
// in this module instance has loaded the theme, exercises its own `!setiTheme`
// guard rather than the font-loading path.
describe("registerSetiIcon before any theme has been loaded", () => {
  test("is a no-op instead of throwing", async () => {
    const { registerSetiIcon } = await import("./seti-loader.ts");
    const { iconRegistry } = await import("../../../core.ts");

    expect(() => registerSetiIcon("_typescript")).not.toThrow();
    expect(iconRegistry.get("seti:_typescript")).toBeUndefined();
  });
});
