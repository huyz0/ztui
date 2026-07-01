import { describe, expect, test, vi } from "vitest";
import { Markdown, Syntax } from "../react.ts";
import { mountApp } from "../test/harness.tsx";
import "../markdown.ts";
import "../syntax.ts";

type Mounted = Awaited<ReturnType<typeof mountApp>>;

/** Locate the copy glyph (idle `⧉` or copied `✓`) in the rendered frame. */
function glyphAt(t: Mounted): { x: number; y: number } {
  const rows = t.text().split("\n");
  for (let y = 0; y < rows.length; y++) {
    const cells = [...rows[y]];
    const x = cells.findIndex((c) => c === "⧉" || c === "✓");
    if (x >= 0) return { x, y };
  }
  throw new Error("copy glyph not rendered");
}

function press(t: Mounted, x: number, y: number): void {
  (t.driver as any).emit("mouse", { x, y, type: "press", button: "left" });
}
function move(t: Mounted, x: number, y: number): void {
  (t.driver as any).emit("mouse", { x, y, type: "move", button: "none" });
}

describe("copy button", () => {
  test("syntax: a routed click on the glyph copies the raw code", async () => {
    const t = await mountApp(<Syntax language="ts">{"const x = 1;"}</Syntax>);
    await t.settle();
    const g = glyphAt(t);
    t.driver.clipboard.set("OLD");
    press(t, g.x, g.y);
    await t.settle();
    expect(await t.driver.clipboard.get()).toBe("const x = 1;");
  });

  test("markdown: a routed click on the glyph copies the raw source", async () => {
    const md = "# Hi\n\nsome **text**";
    const t = await mountApp(<Markdown>{md}</Markdown>);
    await t.settle();
    const g = glyphAt(t);
    t.driver.clipboard.set("OLD");
    press(t, g.x, g.y);
    await t.settle();
    expect((await t.driver.clipboard.get()).trim()).toBe(md);
  });

  test("idle glyph blends with its background; hover paints a panel pill", async () => {
    const t = await mountApp(
      <Syntax language="ts" style={{ background: "$surface" }}>
        {"const x = 1;"}
      </Syntax>,
    );
    await t.settle();
    const g = glyphAt(t);
    // Idle: the glyph cell matches the surrounding background (no dark square).
    expect(t.cellAt(g.x, g.y).style.background).toBe(t.cellAt(g.x - 2, g.y).style.background);
    // Hover: a distinct raised background appears.
    move(t, g.x, g.y);
    await t.settle();
    const hoverBg = t.cellAt(g.x, g.y).style.background;
    expect(hoverBg).toBeTruthy();
    expect(hoverBg).not.toBe(t.cellAt(g.x - 2, g.y).style.background);
  });

  test("a click away from the glyph does not copy", async () => {
    const t = await mountApp(<Syntax language="ts">{"const x = 1;"}</Syntax>);
    await t.settle();
    t.driver.clipboard.set("OLD");
    press(t, 2, 0);
    await t.settle();
    expect(await t.driver.clipboard.get()).toBe("OLD");
  });

  test("clicking the glyph shows the ✓ acknowledgement, then reverts after the timeout", async () => {
    const t = await mountApp(<Syntax language="ts">{"const y = 2;"}</Syntax>);
    await t.settle();
    const g = glyphAt(t);

    // Drive the ack timer on fake timers so this test doesn't spend 1.3s of real
    // wall-clock waiting for the revert. The button's setTimeout is created under
    // fake timers (press happens after useFakeTimers), and each
    // `advanceTimersByTimeAsync` also drains the microtask queue that queueRender
    // schedules the frame on.
    vi.useFakeTimers();
    try {
      press(t, g.x, g.y);
      await vi.advanceTimersByTimeAsync(0); // flush the paint queued by the click
      expect(t.cellAt(g.x, g.y).char).toBe("✓"); // acknowledgement shown

      // The 1200ms ack timer reverts the glyph to the idle ⧉.
      await vi.advanceTimersByTimeAsync(1300);
      expect(t.cellAt(g.x, g.y).char).toBe("⧉");
    } finally {
      vi.useRealTimers();
    }
  });
});
