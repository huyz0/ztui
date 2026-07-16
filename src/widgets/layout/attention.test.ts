import { describe, expect, test } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { AttentionWidget } from "./attention.ts";

describe("AttentionWidget", () => {
  test("attentive=false renders as an ordinary bordered box (no pulse)", () => {
    const w = new AttentionWidget();
    w.attentive = false;
    w.style.width = 10;
    w.style.height = 3;
    w.style.border = "rounded";
    w.region = new Region(Offset.ORIGIN, new Size(10, 3));

    const buffer = new ScreenBuffer(10, 3);
    // Should not throw and should draw a plain border without touching the
    // attention accent resolution path.
    expect(() => w.render(buffer)).not.toThrow();
    expect(buffer.cells[0][0].char).toBe("╭");
  });

  test("attentive=true without an app falls back gracefully when the accent can't be resolved", () => {
    // No App.instance is set up, so `this.app?.cssResolver.resolveVariable`
    // resolves to undefined — exercising the "resolved is falsy" branch,
    // which leaves computedStyle untouched instead of applying a border color.
    const w = new AttentionWidget();
    w.attentive = true;
    w.style.width = 10;
    w.style.height = 3;
    w.style.border = "rounded";
    w.region = new Region(Offset.ORIGIN, new Size(10, 3));

    const buffer = new ScreenBuffer(10, 3);
    expect(() => w.render(buffer)).not.toThrow();
    expect(buffer.cells[0][0].char).toBe("╭");
  });
});
