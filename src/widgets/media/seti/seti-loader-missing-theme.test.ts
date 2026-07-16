import { describe, expect, test, vi } from "vitest";

// This file's module registry is isolated from seti.test.tsx (vitest gives
// each test file its own module instances), so seti-loader.ts's module-level
// `themeLoaded`/`setiTheme` singletons start unset here — letting us force
// the "theme resources missing" fallback path in resolveFileIcon() without
// interfering with the happy-path tests elsewhere.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: () => false,
  };
});

describe("resolveFileIcon with an unavailable theme JSON", () => {
  test("falls back to the default icon instead of throwing", async () => {
    const { resolveFileIcon } = await import("./seti-loader.ts");

    const result = resolveFileIcon("whatever.ts");
    expect(result).toEqual({ name: "seti:_default", color: "#d4d7d6" });

    // Folder resolution doesn't depend on the theme, so it still works.
    const folder = resolveFileIcon("src", true);
    expect(folder.name).toBe("seti:_folder");
  });
});
