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
});
