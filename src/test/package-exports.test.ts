import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Guards the published `exports` map: every declared subpath must point at files
 * that exist, and its source (`bun`) entry must actually load and export
 * something. Catches the "added a subpath but the file is missing / mistyped /
 * empty" class of mistake before publish — e.g. when `./testing` was added.
 *
 * Imports through the `bun` (source) targets, the condition tests resolve under;
 * `npm pack` + a built-dist smoke test is the heavier publish-time check.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
const exportsMap: Record<string, unknown> = pkg.exports;

/** A representative export each subpath must expose (sanity beyond "non-empty"). */
const EXPECTED: Record<string, string> = {
  ".": "App",
  "./react": "render",
  "./testing": "mountApp",
};

describe("package exports map", () => {
  const subpaths = Object.entries(exportsMap).filter(([k]) => k !== "./package.json");

  test("declares the testing entry", () => {
    expect(exportsMap["./testing"]).toBeTruthy();
  });

  // The built outputs (dist/*) only exist after `bun run build` — which CI and
  // the pre-commit hook run before tests. Skip those checks on a bare test run.
  const built = existsSync(resolve(ROOT, "dist"));

  test.each(subpaths)("%s — every target file exists", (_key, entry) => {
    const e = entry as Record<string, string>;
    for (const cond of ["types", "bun", "import", "default"] as const) {
      if (!e[cond]) continue;
      const isDist = e[cond].startsWith("./dist/");
      if (isDist && !built) continue;
      expect(existsSync(resolve(ROOT, e[cond])), `${cond} → ${e[cond]}`).toBe(true);
    }
  });

  test.each(subpaths)("%s — the source entry loads and exports something", async (key, entry) => {
    const e = entry as Record<string, string>;
    const mod = await import(resolve(ROOT, e.bun));
    expect(Object.keys(mod).length).toBeGreaterThan(0);
    const expected = EXPECTED[key as string];
    if (expected) expect(mod[expected]).toBeDefined();
  });
});
