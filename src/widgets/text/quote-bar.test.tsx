import { describe, expect, test } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { QuoteBarWidget } from "./quote-bar.ts";

describe("QuoteBarWidget", () => {
  test("falls back to 'default' color when no color is styled", () => {
    const bar = new QuoteBarWidget();
    bar.region = new Region(new Offset(0, 0), new Size(2, 2));

    const buf = new ScreenBuffer(2, 2);
    bar.render(buf);

    expect(buf.cells[0][0].char).toBe("▌");
    expect(buf.cells[0][0].style.color).toBe("default");
  });

  test("uses the styled color when one is set", () => {
    const bar = new QuoteBarWidget();
    bar.style.color = "red";
    bar.region = new Region(new Offset(0, 0), new Size(2, 2));

    const buf = new ScreenBuffer(2, 2);
    bar.render(buf);

    expect(buf.cells[0][0].char).toBe("▌");
    expect(buf.cells[0][0].style.color).toBe("red");
  });
});
