import { describe, expect, test } from "vitest";
import { parseTCSS } from "./css-parser.ts";

describe("parseTCSS edge cases", () => {
  test("a stray closing brace with no opening brace produces no rule", () => {
    // Splitting on "}" can leave a trailing/stray chunk that never had a "{":
    // it must be skipped, not throw or emit a bogus rule.
    const rules = parseTCSS("button { color: red; } trailing text with no braces");
    expect(rules.length).toBe(1);
    expect(rules[0].selector).toBe("button");
  });

  test("a declaration missing its colon is dropped", () => {
    const rules = parseTCSS("button { color: red; not-a-declaration; }");
    expect(rules[0].properties).toEqual({ color: "red" });
  });

  test("a declaration with an empty key or empty value is dropped", () => {
    const rules = parseTCSS("button { : red; color: ; valid: 1; }");
    expect(rules[0].properties).toEqual({ valid: "1" });
  });

  test("an empty selector block (no declarations) produces no rule", () => {
    const rules = parseTCSS("button { }");
    expect(rules.length).toBe(0);
  });

  test("a grouped selector with an empty/blank member is skipped", () => {
    const rules = parseTCSS("button, , label { color: red; }");
    expect(rules.map((r) => r.selector)).toEqual(["button", "label"]);
  });

  test("a value containing a colon (e.g. a time or ratio) keeps the rest intact", () => {
    const rules = parseTCSS("button { content: a:b:c; }");
    expect(rules[0].properties.content).toBe("a:b:c");
  });
});
