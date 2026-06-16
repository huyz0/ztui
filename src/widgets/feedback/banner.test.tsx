import { describe, expect, test, vi } from "vitest";
import { Banner, VBox } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";

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
});
