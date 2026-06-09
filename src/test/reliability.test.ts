import { describe, expect, test } from "vitest";
import { App } from "../core/app.ts";
import { Widget } from "../dom/widget.ts";
import { MockDriver } from "../driver/mock/index.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { ButtonWidget } from "../widgets/controls/button.ts";
import { decodeImage } from "../widgets/media/image.ts";
import { parsePartialJson } from "../widgets/text/json-ui.ts";

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

describe("bad external data handling", () => {
  test("decodeImage throws a descriptive error (incl. magic bytes) on garbage", () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(() => decodeImage(garbage)).toThrow(/Unsupported or invalid image format/);
    expect(() => decodeImage(garbage)).toThrow(/01 02 03 04/); // magic bytes surfaced
  });

  test("decodeImage reports an empty buffer rather than crashing opaquely", () => {
    expect(() => decodeImage(new Uint8Array([]))).toThrow(/empty|0 bytes/);
  });

  test("parsePartialJson returns null on unrecoverable input instead of throwing", () => {
    expect(parsePartialJson("not json at all {{{")).toBeNull();
    expect(parsePartialJson("")).toBeNull();
  });

  test("parsePartialJson still parses valid and partial JSON", () => {
    expect(parsePartialJson('{"a":1}')).toEqual({ a: 1 });
    // partial/streamed object gets balanced
    expect(parsePartialJson('{"a":1')).toEqual({ a: 1 });
  });
});

describe("event handler isolation", () => {
  test("a throwing onClick handler does not crash the event loop", () => {
    const driver = new MockDriver(40, 5);
    const app = new App(driver);
    const btn = new ButtonWidget();
    let fired = false;
    btn.onClick = () => {
      fired = true;
      throw new Error("handler boom");
    };
    app.activeScreen.appendChild(btn);
    app.run();
    app.activeScreen.focusWidget(btn);

    // Enter triggers the button's onClick (which throws); the app must survive.
    expect(() => driver.simulateKey("enter", "enter")).not.toThrow();
    expect(fired).toBe(true);

    app.stop();
  });
});
