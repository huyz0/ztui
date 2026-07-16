import { describe, expect, test } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { Footer, Header, VBox } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { mountApp } from "../../test/harness.tsx";
import { FooterWidget } from "./footer.ts";
import { HeaderWidget } from "./header.ts";

describe("Header / Footer", () => {
  test("getTextContent reflects children", async () => {
    const { findById } = await mountApp(
      <VBox>
        <Header id="hdr">Custom Title</Header>
        <Footer id="ftr">Custom Status</Footer>
      </VBox>,
      { cols: 80, rows: 24 },
    );

    const header = findById<any>("hdr")!;
    const footer = findById<any>("ftr")!;

    expect(header.getTextContent()).toBe("Custom Title");
    expect(footer.getTextContent()).toBe("Custom Status");
  });

  test("footer falls back to the default hint text and color when unstyled/childless", () => {
    // Instantiated directly (no App/theme mount): computedStyle is just the
    // raw style object, so `style.color` is undefined — exercising both the
    // "no text content" and "no resolved color" fallback branches.
    const w = new FooterWidget();
    w.region = new Region(Offset.ORIGIN, new Size(30, 1));
    expect(w.computedStyle.color).toBeFalsy();

    const buffer = new ScreenBuffer(30, 1);
    expect(() => w.render(buffer)).not.toThrow();
    const text = buffer.cells[0].map((c) => c.char).join("");
    expect(text).toContain("Ctrl+C Exit");
  });

  test("header falls back to the default title text and color when unstyled/childless", () => {
    const w = new HeaderWidget();
    w.region = new Region(Offset.ORIGIN, new Size(30, 1));
    expect(w.computedStyle.color).toBeFalsy();

    const buffer = new ScreenBuffer(30, 1);
    expect(() => w.render(buffer)).not.toThrow();
    const text = buffer.cells[0].map((c) => c.char).join("");
    expect(text).toContain("ZTUI Application");
  });
});
