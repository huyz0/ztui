import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Guards against raw NUL (`\x00`) bytes creeping into source files. They have bit
 * this repo before: a template-literal separator typed as a space silently became
 * a NUL, which `grep`/`git grep` then treat as binary and skip — corrupting code
 * search with no compiler error. A delimiter that needs to be unmatchable in text
 * should be written as the escape `\u0000`, which keeps the source clean ASCII.
 */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("source hygiene", () => {
  test("no source file contains a raw NUL byte", () => {
    const offenders = sourceFiles("src").filter((f) => readFileSync(f).includes(0));
    expect(offenders).toEqual([]);
  });
});
