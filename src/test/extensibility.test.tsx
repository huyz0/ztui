import { createElement } from "react";
import { describe, expect, test } from "vitest";
import {
  App,
  createWidgetByTagName,
  MockDriver,
  registerElement,
  renderBufferToText,
  type ScreenBuffer,
  Style,
  Widget,
} from "../core.ts";
import { type ComponentProps, hostComponent, render } from "../react.ts";

/**
 * Guards the *public* custom-widget extension contract — the exact surface the
 * "Extending ztui" guide tells users to rely on. If an internal refactor breaks
 * subclassing `Widget`, `registerElement`, or `hostComponent`, this fails. The
 * point is that these stay stable even as the engine's internals change.
 */

// A minimal custom widget: paint a horizontal bar of `char` across its content
// box, sized to a fixed height. Exercises the documented override points
// (measure + render) and a custom prop wired through the host element.
class BarWidget extends Widget {
  public char = "#";

  override measure(maxW: number, maxH: number): void {
    super.measure(maxW, maxH);
    this.measuredHeight = 1;
    this.measuredWidth = maxW;
  }

  override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const r = this.getContentRect();
    const style = new Style({ color: this.computedStyle.color });
    for (let x = r.x; x < r.right; x++) buffer.setCell(x, r.y, this.char, style);
  }
}

interface BarProps extends ComponentProps {
  char?: string;
}
const Bar = hostComponent<BarProps>("ztui-bar");

describe("custom widget extension surface (public API)", () => {
  test("registerElement maps a tag to a Widget subclass", () => {
    registerElement("ztui-bar", () => new BarWidget());
    const w = createWidgetByTagName("ztui-bar");
    expect(w).toBeInstanceOf(BarWidget);
  });

  test("a custom widget renders through App + the React binding", async () => {
    registerElement("ztui-bar", () => new BarWidget());
    const driver = new MockDriver(10, 3);
    const app = new App(driver);

    render(createElement(Bar, { char: "=" }), app.activeScreen);
    app.run();
    await new Promise((r) => setTimeout(r, 15));

    const text = renderBufferToText(
      (app as unknown as { currentBuffer: ScreenBuffer }).currentBuffer,
    );
    // The bar painted a row of "=" via the custom render() override.
    expect(text).toContain("=");
    app.stop();
  });

  test("custom props forward to the widget instance field", async () => {
    registerElement("ztui-bar", () => new BarWidget());
    const driver = new MockDriver(8, 2);
    const app = new App(driver);
    let captured: BarWidget | null = null;
    render(
      createElement(Bar, {
        char: "*",
        ref: (w: Widget | null) => {
          captured = w as BarWidget;
        },
      }),
      app.activeScreen,
    );
    app.run();
    await new Promise((r) => setTimeout(r, 15));
    expect(captured).not.toBeNull();
    expect((captured as unknown as BarWidget).char).toBe("*");
    app.stop();
  });
});
