import { describe, expect, test } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { Divider, HBox, VBox } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { mountApp } from "../../test/harness.tsx";
import { DividerWidget } from "./divider.ts";

describe("DividerWidget", () => {
  test("vertical divider draws a │ rule in the theme border colour", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <HBox>
        <Divider id="d" style={{ height: 3 }} />
      </HBox>,
      { cols: 10, rows: 5 },
    );
    const d = findById("d");
    await settle();
    const r = d.getClientRect();
    expect(r.width).toBe(1);
    expect(r.height).toBeGreaterThan(1); // exercise the multi-row draw loop
    for (let y = r.y; y < r.bottom; y++) {
      expect(cellAt(r.x, y).char).toBe("│");
    }
    // Colour is resolved from the theme's $border token, not left as the literal.
    const col = cellAt(r.x, r.y).style.color;
    expect(col).toBeTruthy();
    expect(col).not.toBe("$border");
  });

  test("horizontal divider draws a ─ rule", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <Divider id="d" orientation="horizontal" style={{ width: 4 }} />
      </VBox>,
      { cols: 10, rows: 5 },
    );
    const d = findById("d");
    await settle();
    const r = d.getClientRect();
    expect(r.height).toBe(1);
    expect(r.width).toBeGreaterThan(1);
    for (let x = r.x; x < r.right; x++) {
      expect(cellAt(x, r.y).char).toBe("─");
    }
  });

  test("uses an explicit style.color instead of the theme's $border token", () => {
    const w = new DividerWidget();
    w.style.color = "red";
    w.region = new Region(Offset.ORIGIN, new Size(1, 2));

    const buffer = new ScreenBuffer(1, 2);
    w.render(buffer);
    expect(buffer.cells[0][0].style.color).toBe("red");
  });

  test("falls back to a literal gray when no App/theme is mounted", () => {
    // Instantiated directly, with no App.instance set up, so
    // `App.instance?.cssResolver` resolves to undefined and the widget must
    // fall back to the literal "gray" instead of a resolved $border color.
    const w = new DividerWidget();
    w.region = new Region(Offset.ORIGIN, new Size(1, 2));

    const buffer = new ScreenBuffer(1, 2);
    w.render(buffer);
    expect(buffer.cells[0][0].style.color).toBe("gray");
  });
});
