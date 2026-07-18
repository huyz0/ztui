import { describe, expect, test } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { HBox, StatusBadge, StatusDot, StatusList, VBox } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { mountApp } from "../../test/harness.tsx";
import { StatusBadgeWidget, StatusDotWidget, StatusListWidget } from "./status.ts";

describe("ZTUI Status Widget Suite", () => {
  test("StatusDot renders a single coloured glyph", async () => {
    const { findById, cellAt } = await mountApp(
      <HBox>
        <StatusDot id="d" state="completed" />
      </HBox>,
      { cols: 10, rows: 3 },
    );
    expect(findById("d")).toBeDefined();
    expect(cellAt(0, 0).char).toBe("✓");
    // completed resolves to the theme success colour (green by default).
    expect(cellAt(0, 0).style.color).toBeTruthy();
  });

  test("StatusDot swaps vocabulary with glyphSet", async () => {
    const { cellAt } = await mountApp(
      <HBox>
        <StatusDot state="failed" glyphSet="ascii" />
      </HBox>,
      { cols: 10, rows: 3 },
    );
    expect(cellAt(0, 0).char).toBe("x");
  });

  test("StatusDot sizes to a two-cell emoji glyph (not clipped to one)", async () => {
    const { findById, cellAt } = await mountApp(
      <HBox>
        <StatusDot id="a" state="active" glyphSet="emoji" />
        <StatusDot id="b" state="failed" glyphSet="emoji" />
      </HBox>,
      { cols: 10, rows: 3 },
    );
    // First emoji occupies two cells: glyph then a wide-continuation.
    expect(cellAt(0, 0).char).toBe("🟢");
    expect(cellAt(1, 0).wideContinuation).toBe(true);
    // The second dot starts at column 2, not overlapping the first.
    expect(findById("b")?.region.x).toBe(2);
    expect(cellAt(2, 0).char).toBe("❌");
  });

  test("StatusBadge draws glyph then label, defaulting the label to the state", async () => {
    const { text } = await mountApp(
      <HBox>
        <StatusBadge state="active" />
      </HBox>,
      { cols: 20, rows: 3 },
    );
    expect(text()).toContain("● active");
  });

  test("StatusBadge honours an explicit label", async () => {
    const { text } = await mountApp(
      <HBox>
        <StatusBadge state="ongoing" label="running" />
      </HBox>,
      { cols: 20, rows: 3 },
    );
    expect(text()).toContain("◐ running");
  });

  test("StatusList renders one row per item with detail", async () => {
    const { text } = await mountApp(
      <VBox>
        <StatusList
          items={[
            { state: "completed", label: "build", detail: "4.2s" },
            { state: "failed", label: "e2e", detail: "2 failed" },
          ]}
        />
      </VBox>,
      { cols: 30, rows: 5 },
    );
    const out = text();
    expect(out).toContain("✓ build");
    expect(out).toContain("4.2s");
    expect(out).toContain("✘ e2e");
    expect(out).toContain("2 failed");
  });

  test("an explicit color overrides the state colour on a StatusDot", async () => {
    const { findById, cellAt } = await mountApp(
      <VBox>
        <StatusDot id="d" state="failed" style={{ color: "#abcdef" }} />
      </VBox>,
      { cols: 10, rows: 3 },
    );
    expect(findById("d")).toBeDefined();
    expect(cellAt(0, 0).style.color).toBe("#abcdef"); // override, not the $error fallback
  });

  test("explicit width/height props drive the measured size across Status widgets", async () => {
    const { findById } = await mountApp(
      <VBox>
        <StatusBadge id="b" state="active" label="run" style={{ width: 20, height: 2 }} />
        <StatusList id="l" items={[{ state: "completed", label: "x" }]} style={{ height: 4 }} />
      </VBox>,
      { cols: 30, rows: 8 },
    );
    const badge = findById("b")!;
    badge.measure(30, 8);
    expect(badge.measuredWidth).toBe(20);
    expect(badge.measuredHeight).toBe(2);

    const list = findById("l")!;
    list.measure(30, 8);
    expect(list.measuredHeight).toBe(4);
  });

  test("StatusDot: measure() falls back to glyph width/1 when width/height style is unset or fr-based", () => {
    const noStyle = new StatusDotWidget();
    noStyle.state = "completed";
    noStyle.measure(20, 10);
    expect(noStyle.measuredWidth).toBe(1); // charWidth of "✓"
    expect(noStyle.measuredHeight).toBe(1);

    const frStyle = new StatusDotWidget();
    frStyle.style.width = "1fr"; // parseDimension returns {fr}, not a number
    frStyle.style.height = "1fr";
    frStyle.measure(20, 10);
    expect(frStyle.measuredWidth).toBe(1); // `typeof w === "number"` guard catches the fr object
    expect(frStyle.measuredHeight).toBe(1); // matching guard on the height branch
  });

  test("StatusDot: render() skips while invisible, on a zero-size rect, or off the buffer", () => {
    const invisible = new StatusDotWidget();
    invisible.visible = false;
    invisible.region = new Region(Offset.ORIGIN, new Size(1, 1));
    const buf1 = new ScreenBuffer(1, 1);
    expect(() => invisible.render(buf1)).not.toThrow();
    expect(buf1.cells[0][0].char).toBe(" ");

    const zeroRect = new StatusDotWidget();
    zeroRect.region = new Region(Offset.ORIGIN, new Size(0, 0));
    const buf2 = new ScreenBuffer(1, 1);
    expect(() => zeroRect.render(buf2)).not.toThrow();

    const offBuffer = new StatusDotWidget();
    offBuffer.region = new Region(new Offset(5, 5), new Size(1, 1));
    const buf3 = new ScreenBuffer(2, 2);
    expect(() => offBuffer.render(buf3)).not.toThrow();
  });

  test("StatusDot: without a CSS resolver, the state colour falls back to its literal default", () => {
    const w = new StatusDotWidget();
    w.state = "failed"; // fallback "red"
    w.region = new Region(Offset.ORIGIN, new Size(1, 1));
    const buffer = new ScreenBuffer(1, 1);
    w.render(buffer);
    expect(buffer.cells[0][0].style.color).toBe("red");
  });

  test("StatusList: measure() falls back to the intrinsic size for unset or fr-based width/height", () => {
    const noStyle = new StatusListWidget();
    noStyle.items = [{ state: "completed", label: "build" }];
    noStyle.measure(40, 10);
    expect(noStyle.measuredWidth).toBeGreaterThan(0);
    expect(noStyle.measuredHeight).toBe(1);

    const frStyle = new StatusListWidget();
    frStyle.items = [{ state: "completed", label: "build" }];
    frStyle.style.width = "1fr";
    frStyle.style.height = "1fr";
    frStyle.measure(40, 10);
    expect(frStyle.measuredWidth).toBeGreaterThan(0);
    expect(frStyle.measuredHeight).toBeGreaterThan(0);
  });

  test("StatusList: render() skips while invisible or on a zero-size rect", () => {
    const invisible = new StatusListWidget();
    invisible.visible = false;
    invisible.items = [{ state: "completed", label: "x" }];
    invisible.region = new Region(Offset.ORIGIN, new Size(10, 1));
    const buf1 = new ScreenBuffer(10, 1);
    expect(() => invisible.render(buf1)).not.toThrow();
    expect(buf1.cells[0][0].char).toBe(" ");

    const zeroRect = new StatusListWidget();
    zeroRect.items = [{ state: "completed", label: "x" }];
    zeroRect.region = new Region(Offset.ORIGIN, new Size(0, 0));
    const buf2 = new ScreenBuffer(4, 1);
    expect(() => zeroRect.render(buf2)).not.toThrow();
  });

  test("StatusBadge: measure() falls back to the intrinsic height when height style is unset", () => {
    const w = new StatusBadgeWidget();
    w.state = "active";
    // No style.height at all -> computedStyle.height is undefined.
    w.measure(20, 10);
    expect(w.measuredHeight).toBe(1);
  });

  test("StatusBadge: measure() falls back to intrinsic sizing for a non-numeric (fr) width/height", () => {
    const w = new StatusBadgeWidget();
    w.state = "active";
    w.style.width = "1fr"; // parseDimension returns {fr}, not a number
    w.style.height = "1fr";
    w.measure(20, 10);
    expect(w.measuredWidth).toBeGreaterThan(0);
    expect(w.measuredHeight).toBe(1);
  });

  test("StatusBadge: render() skips while invisible or on a zero-size rect", () => {
    const invisible = new StatusBadgeWidget();
    invisible.visible = false;
    invisible.region = new Region(Offset.ORIGIN, new Size(10, 1));
    const buf1 = new ScreenBuffer(10, 1);
    expect(() => invisible.render(buf1)).not.toThrow();
    expect(buf1.cells[0][0].char).toBe(" ");

    const zeroRect = new StatusBadgeWidget();
    zeroRect.region = new Region(Offset.ORIGIN, new Size(0, 0));
    const buf2 = new ScreenBuffer(4, 1);
    expect(() => zeroRect.render(buf2)).not.toThrow();
  });

  test("StatusList: measure() accepts an explicit numeric width style", () => {
    const w = new StatusListWidget();
    w.items = [{ state: "completed", label: "build" }];
    w.style.width = 25;
    w.measure(40, 10);
    expect(w.measuredWidth).toBe(25);
  });

  test("StatusList: detail colour falls back to its literal default without a CSS resolver", () => {
    const w = new StatusListWidget();
    w.items = [{ state: "completed", label: "build", detail: "4.2s" }];
    w.region = new Region(Offset.ORIGIN, new Size(20, 1));
    const buffer = new ScreenBuffer(20, 1);
    w.render(buffer);
    const row = Array.from({ length: 20 }, (_, x) => buffer.cells[0][x].char).join("");
    expect(row).toContain("4.2s");
    // Find the detail cell and confirm the literal "bright-black" fallback.
    const detailIdx = row.indexOf("4");
    expect(buffer.cells[0][detailIdx].style.color).toBe("bright-black");
  });
});
