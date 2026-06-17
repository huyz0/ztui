import { describe, expect, test } from "vitest";
import { createWidgetByTagName, registerElement } from "./element-registry.ts";
import { Widget } from "./widget.ts";

describe("element registry", () => {
  test("constructs the built-in tags by name (case-insensitive)", () => {
    for (const [tag, expected] of [
      ["ztui-view", "view"],
      ["ztui-button", "button"],
      ["ztui-label", "label"],
      ["ztui-input", "input"],
      ["ztui-header", "header"],
      ["ztui-footer", "footer"],
    ] as const) {
      expect(createWidgetByTagName(tag.toUpperCase())?.tagName).toBe(expected);
    }
  });

  test("an unknown tag resolves to null", () => {
    expect(createWidgetByTagName("ztui-nope")).toBeNull();
  });

  test("registerElement adds a custom factory", () => {
    registerElement("ztui-custom-x", () => new Widget("custom-x"));
    expect(createWidgetByTagName("ztui-custom-x")?.tagName).toBe("custom-x");
  });
});
