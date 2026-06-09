import { describe, expect, test } from "vitest";
import { Widget } from "../dom/widget.ts";
import { ScreenBuffer } from "../render/buffer.ts";

class BoomWidget extends Widget {
  override render(): void {
    throw new Error("intentional render explosion");
  }
  override measure(): void {
    throw new Error("intentional measure explosion");
  }
}

class FlagWidget extends Widget {
  public rendered = false;
  public measured = false;
  override render(): void {
    this.rendered = true;
  }
  override measure(): void {
    this.measured = true;
  }
}

describe("render/measure isolation", () => {
  test("a throwing child does not prevent siblings from rendering", () => {
    const parent = new Widget("view");
    const boom = new BoomWidget("boom");
    const ok = new FlagWidget("ok");
    parent.appendChild(boom);
    parent.appendChild(ok);

    const buffer = new ScreenBuffer(20, 5);
    expect(() => parent.renderChildren(buffer)).not.toThrow();
    expect(ok.rendered).toBe(true);
  });

  test("a throwing child does not prevent siblings from being measured", () => {
    const parent = new Widget("view");
    const boom = new BoomWidget("boom");
    const ok = new FlagWidget("ok");
    parent.appendChild(boom);
    parent.appendChild(ok);

    expect(() => parent.measure(20, 5)).not.toThrow();
    expect(ok.measured).toBe(true);
  });
});
