import { describe, expect, test } from "vitest";
import { App } from "../core/app.ts";
import { Widget } from "../dom/widget.ts";
import { MockDriver } from "../driver/mock/index.ts";
import { resolveColor } from "./resolve-color.ts";

describe("resolveColor", () => {
  test("falls back for an unresolved $variable token instead of leaking the literal string", () => {
    // Regression: CSSResolver.resolveVariable returns the unresolved `$name`
    // token itself (not undefined/empty) when no stylesheet var, theme color,
    // or derived fallback matches. That string is truthy, so `|| fallback`
    // alone never triggered — a typoed color token rendered as garbage
    // instead of falling back, e.g. Chart/Gauge painting a bar with the
    // literal text "$typoedToken" as its color.
    const driver = new MockDriver(40, 5);
    const app = new App(driver);
    app.run();

    const widget = new Widget("test");
    app.activeScreen.appendChild(widget);

    expect(resolveColor(widget, "$totally-unknown-token", "#4daafc")).toBe("#4daafc");
  });

  test("still resolves a variable that legitimately maps to a value", () => {
    const driver = new MockDriver(40, 5);
    const app = new App(driver);
    app.run();

    const widget = new Widget("test");
    app.activeScreen.appendChild(widget);

    expect(resolveColor(widget, "$accent", "fallback")).not.toBe("fallback");
  });

  test("passes through a literal (non-variable) color unchanged", () => {
    const driver = new MockDriver(40, 5);
    const app = new App(driver);
    app.run();
    const widget = new Widget("test");
    app.activeScreen.appendChild(widget);

    expect(resolveColor(widget, "#ff00ff", "fallback")).toBe("#ff00ff");
    expect(resolveColor(widget, undefined, "fallback")).toBe("fallback");
  });
});
