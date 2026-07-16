import { describe, expect, test } from "vitest";
import type { ApprovalCall } from "./approval-prompt.tsx";
import { distinctMatches, globToRegExp } from "./approval-prompt.tsx";

describe("globToRegExp", () => {
  test("* matches any run of characters", () => {
    const re = globToRegExp("rm -rf *");
    expect(re.test("rm -rf build")).toBe(true);
    expect(re.test("rm -rf")).toBe(false); // no trailing text after "*" position
  });

  test("? matches exactly one character", () => {
    const re = globToRegExp("a?c");
    expect(re.test("abc")).toBe(true);
    expect(re.test("ac")).toBe(false);
    expect(re.test("abbc")).toBe(false);
  });

  test("regex metacharacters in the glob are escaped, not treated as regex", () => {
    const re = globToRegExp("a.b+c(d)");
    expect(re.test("a.b+c(d)")).toBe(true);
    expect(re.test("aXb+c(d)")).toBe(false); // "." is literal, not "any char"
  });

  test("is anchored: a glob must match the whole string, not just a substring", () => {
    const re = globToRegExp("cat");
    expect(re.test("cat")).toBe(true);
    expect(re.test("concat")).toBe(false);
    expect(re.test("cats")).toBe(false);
  });

  test("* is not anchored per path segment — it crosses '/' like a real fs glob's '**', not '*'", () => {
    // Documents current behavior: src/*.ts also matches a nested path, since
    // "*" is translated to ".*" (matches everything including separators)
    // rather than "[^/]*" (a single path segment). This widget matches
    // free-form command args, not file paths, so this is deliberate — but
    // was previously unverified by any test.
    const re = globToRegExp("src/*.ts");
    expect(re.test("src/a.ts")).toBe(true);
    expect(re.test("src/nested/deeper/b.ts")).toBe(true);
  });
});

describe("distinctMatches", () => {
  function call(id: string, name: string, matches?: string[]): ApprovalCall {
    return { id, name, matches };
  }

  test("falls back to the tool name when a call has no matches", () => {
    expect(distinctMatches([call("1", "Bash")])).toEqual(["Bash"]);
  });

  test("collects the union of every call's patterns, in first-seen order", () => {
    const calls = [
      call("1", "Bash", ["Bash", "rm"]),
      call("2", "Read", ["Read"]),
      call("3", "Bash", ["rm", "rm -rf *"]),
    ];
    expect(distinctMatches(calls)).toEqual(["Bash", "rm", "Read", "rm -rf *"]);
  });

  test("de-duplicates identical patterns across calls", () => {
    const calls = [call("1", "Bash", ["rm"]), call("2", "Bash", ["rm"])];
    expect(distinctMatches(calls)).toEqual(["rm"]);
  });

  test("returns an empty list for no calls", () => {
    expect(distinctMatches([])).toEqual([]);
  });
});
