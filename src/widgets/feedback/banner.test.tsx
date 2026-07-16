import { describe, expect, test, vi } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { Banner, VBox } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { mountApp } from "../../test/harness.tsx";
import { BannerWidget } from "./banner.ts";

/** Read the plain text of one content row as a trimmed string. */
function rowText(
  cellAt: (x: number, y: number) => { char: string },
  rect: { x: number; y: number; width: number },
  y: number,
): string {
  let s = "";
  for (let x = rect.x; x < rect.x + rect.width; x++) s += cellAt(x, y).char;
  return s;
}

describe("Banner", () => {
  test("renders the icon, a bold title and a wrapped message", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <Banner
          id="b"
          style={{ width: 24 }}
          variant="info"
          title="Heads up"
          message="This message is long enough to wrap across several lines."
        />
      </VBox>,
      { cols: 40, rows: 12 },
    );
    await settle();
    const r = findById("b").getClientRect();
    // Grows past a single row because the message wraps.
    expect(r.height).toBeGreaterThan(2);
    // Accent rule on the left edge of every row.
    expect(cellAt(r.x, r.y).char).toBe("▌");
    // Info icon then the title on the first row.
    const first = rowText(cellAt, r, r.y);
    expect(first).toContain("ⓘ");
    expect(first).toContain("Heads up");
  });

  test("clicking the × fires onDismiss", async () => {
    const onDismiss = vi.fn();
    const { findById, cellAt, driver, settle } = await mountApp(
      <VBox>
        <Banner
          id="b"
          style={{ width: 24 }}
          variant="success"
          message="Saved."
          dismissible
          onDismiss={onDismiss}
        />
      </VBox>,
      { cols: 40, rows: 8 },
    );
    await settle();
    const r = findById("b").getClientRect();
    const dx = r.x + r.width - 1;
    expect(cellAt(dx, r.y).char).toBe("×");
    driver.simulateMouse(dx, r.y, "press", "left");
    await settle();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // A click elsewhere on the banner does not dismiss.
    driver.simulateMouse(r.x + 2, r.y, "press", "left");
    await settle();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("survives a tight width and an empty message without overflowing", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <Banner id="b" style={{ width: 6 }} variant="error" message="overflowing text here" />
      </VBox>,
      { cols: 20, rows: 10 },
    );
    await settle();
    const r = findById("b").getClientRect();
    expect(r.width).toBe(6);
    // Nothing is painted in the column just past the banner's right edge.
    for (let y = r.y; y < r.y + r.height; y++) {
      expect(cellAt(r.x + r.width, y).char.trim()).toBe("");
    }

    const empty = await mountApp(
      <VBox>
        <Banner id="b" style={{ width: 20 }} variant="neutral" title="Note" />
      </VBox>,
      { cols: 30, rows: 6 },
    );
    await empty.settle();
    expect(empty.findById("b").getClientRect().height).toBe(1); // title only
  });

  test("truncates a long title with an ellipsis and clips to an explicit height", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <Banner
          id="b"
          style={{ width: 16, height: 2 }}
          variant="warning"
          glyphSet="ascii"
          title="A title that is far too long to fit"
          message="line one\nline two\nline three"
        />
      </VBox>,
      { cols: 30, rows: 8 },
    );
    await settle();
    const r = findById("b").getClientRect();
    expect(r.height).toBe(2); // honours the explicit height
    const first = (() => {
      let s = "";
      for (let x = r.x; x < r.x + r.width; x++) s += cellAt(x, r.y).char;
      return s;
    })();
    expect(first).toContain("!"); // ascii warning glyph
    expect(first).toContain("…"); // title truncated
  });

  test("hides the icon and skips its reserved column when showIcon is false", () => {
    const w = new BannerWidget();
    w.showIcon = false;
    w.title = "T";
    w.message = "msg";
    w.style.width = 20;
    w.region = new Region(Offset.ORIGIN, new Size(20, 2));
    const buffer = new ScreenBuffer(20, 2);
    w.render(buffer);
    const row0 = Array.from({ length: 20 }, (_, x) => buffer.cells[0][x].char).join("");
    // No icon glyphs anywhere on the first row.
    expect(row0).not.toContain("ⓘ");
  });

  test("skips rendering entirely while invisible, and bails on a zero-size rect", () => {
    const invisible = new BannerWidget();
    invisible.visible = false;
    invisible.message = "hidden";
    invisible.region = new Region(Offset.ORIGIN, new Size(10, 1));
    const buf1 = new ScreenBuffer(10, 1);
    expect(() => invisible.render(buf1)).not.toThrow();
    expect(buf1.cells[0][0].char).toBe(" ");

    const zero = new BannerWidget();
    zero.message = "x";
    zero.region = new Region(Offset.ORIGIN, new Size(0, 0));
    const buf2 = new ScreenBuffer(4, 1);
    expect(() => zero.render(buf2)).not.toThrow();
  });

  test("measure() falls back to maxW/maxH when width/height style is unset or non-numeric (fr)", () => {
    const noWidth = new BannerWidget();
    noWidth.message = "hello";
    // No style.width set at all -> computedStyle.width is undefined.
    noWidth.measure(30, 10);
    expect(noWidth.measuredWidth).toBeGreaterThan(0);

    const frDims = new BannerWidget();
    frDims.message = "hello world this wraps maybe";
    frDims.style.width = "1fr"; // parseDimension returns {fr}, not a number
    frDims.style.height = "1fr";
    frDims.measure(25, 10);
    expect(frDims.measuredWidth).toBeGreaterThan(0);
    expect(frDims.measuredHeight).toBeGreaterThan(0);
  });

  test("without a CSS resolver, falls back to literal colours and the App.instance lookup path", () => {
    const w = new BannerWidget();
    w.variant = "warning";
    w.fill = false; // exercise the fill=false branch (no tint blending)
    w.title = "Note";
    w.message = "plain fallback colours";
    w.region = new Region(Offset.ORIGIN, new Size(24, 2));
    const buffer = new ScreenBuffer(24, 2);
    // Unattached widget: this.app is null and no App is running, so the
    // resolver is undefined and every colour falls back to its literal default.
    expect(() => w.render(buffer)).not.toThrow();
    const row0 = Array.from({ length: 24 }, (_, x) => buffer.cells[0][x].char).join("");
    expect(row0).toContain("Note");
  });

  test("blends the accent into a resolvable hex background when fill is enabled", () => {
    const w = new BannerWidget();
    w.variant = "success";
    w.fill = true;
    w.message = "tinted";
    w.style.background = "#1e1e2e"; // parses as RGB, enabling the blend path
    w.region = new Region(Offset.ORIGIN, new Size(20, 1));
    const buffer = new ScreenBuffer(20, 1);
    w.render(buffer);
    // The blended background should differ from the plain literal hex.
    expect(buffer.cells[0][0].style.background).not.toBe("#1e1e2e");
  });
});
