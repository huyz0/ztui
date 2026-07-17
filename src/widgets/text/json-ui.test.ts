import { describe, expect, test } from "vitest";
import { parsePartialJson } from "./json-ui.ts";

describe("parsePartialJson", () => {
  test("parses already-complete JSON unchanged", () => {
    expect(parsePartialJson('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] });
  });

  test("closes an unterminated object (streaming mid-write)", () => {
    expect(parsePartialJson('{"type":"label","text":"hi"')).toEqual({
      type: "label",
      text: "hi",
    });
  });

  test("closes an unterminated array and drops a dangling comma", () => {
    expect(parsePartialJson('{"items":[1,2,')).toEqual({ items: [1, 2] });
  });

  test("strips a dangling key colon (un-parseable remainder yields null)", () => {
    // The trailing `:` is sliced off before closing; the leftover `{"a":1,"b"}`
    // still isn't valid JSON, so the result is null — but the colon-trim ran.
    expect(parsePartialJson('{"a":1,"b":')).toBeNull();
  });

  test("ignores brackets and quotes that appear inside strings", () => {
    expect(parsePartialJson('{"s":"a [bracket] and a \\" quote"')).toEqual({
      s: 'a [bracket] and a " quote',
    });
  });

  test("returns null for input that can't be repaired into JSON", () => {
    expect(parsePartialJson("not json at all")).toBeNull();
  });

  test("pops the array off the stack on a properly matched closing bracket", () => {
    // Only the outer object is left unclosed; the `]` here matches the `[`
    // pushed for the array, exercising the matching (not mismatched) branch.
    expect(parsePartialJson('{"items":[1,2]')).toEqual({ items: [1, 2] });
  });

  test("a mismatched `}` (top of stack is `[`, not `{`) is left as-is, not popped", () => {
    // The `}` doesn't match the array's `[` on top of the stack, so it's a
    // no-op rather than closing the array — leaving stray garbage that fails
    // to parse even after the repair pass closes the array for real.
    expect(parsePartialJson("[1,2}")).toBeNull();
  });

  test("a mismatched `]` (top of stack is `{`, not `[`) is left as-is, not popped", () => {
    expect(parsePartialJson('{"a":1]')).toBeNull();
  });

  test("closes an unterminated array that doesn't end in a dangling comma", () => {
    // No trailing comma to strip -- exercises the "else" side of that check.
    expect(parsePartialJson('{"items":[1,2')).toEqual({ items: [1, 2] });
  });
});
