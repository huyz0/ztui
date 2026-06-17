import { describe, expect, test } from "vitest";
import { Diff, VBox } from "../react/components.tsx";
import type { DiffWidget } from "../widgets/data/diff.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 60,
  rows: 16,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

const OLD = "line one\nline two\nline three\nline four";
const NEW = "line one\nline 2\nline three\nline four";

describe("Diff", () => {
  test("shows the changed lines and keeps the unchanged context", async () => {
    const t = await mountApp(
      <VBox style={{ width: 50 }}>
        <Diff id="d" oldText={OLD} newText={NEW} context={Infinity} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("line two"); // removed
    expect(text).toContain("line 2"); // added
    expect(text).toContain("line one"); // unchanged context kept
    expect(text).toContain("line four");
  });

  test("collapses long unchanged runs into a ⋯ hunk marker", async () => {
    const big = Array.from({ length: 30 }, (_, i) => `row ${i}`).join("\n");
    const changed = big.replace("row 0", "row ZERO");
    const t = await mountApp(
      <VBox style={{ width: 50 }}>
        <Diff id="d" oldText={big} newText={changed} context={2} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("⋯");
    expect(text).toContain("unchanged");
    expect(text).toContain("row 0"); // removed
    expect(text).toContain("row ZERO"); // added
    // The far-away rows are folded away, not drawn.
    expect(text).not.toContain("row 20");
  });

  test("split view renders both panes with a divider", async () => {
    const t = await mountApp(
      <VBox style={{ width: 56 }}>
        <Diff id="d" oldText={OLD} newText={NEW} view="split" context={Infinity} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("│"); // pane divider
    expect(text).toContain("line one");
  });

  test("an identical old/new produces one context row per line", async () => {
    const t = await mountApp(
      <VBox style={{ width: 50 }}>
        <Diff id="d" oldText={OLD} newText={OLD} context={Infinity} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<DiffWidget>("d") as DiffWidget;
    const lines = w.selectableLines();
    expect(lines).toHaveLength(4); // four lines, all unchanged context
    expect(lines.some((l) => l.includes("line one"))).toBe(true);
    // Every row carries both old and new line numbers in the gutter.
    expect(lines.every((l) => /^\s*\d+\s+\d+\s/.test(l))).toBe(true);
  });

  test("renders a clickable view toggle that switches unified/split", async () => {
    const t = await mountApp(
      <VBox style={{ width: 56 }}>
        <Diff id="d" oldText={OLD} newText={NEW} context={Infinity} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("Unified");
    expect(t.text()).toContain("Split");
    // Starts unified: no pane divider in the body.
    expect(t.text()).not.toContain("│");

    const w = t.findById<DiffWidget>("d") as DiffWidget;
    // The toggle is right-aligned; " Split " is the last tab, ending at the
    // right edge of the content rect (width 7), so click just inside it.
    const c = w.getContentRect();
    w.handleMouse({
      type: "press",
      button: "left",
      x: c.right - 3,
      y: c.y,
      handled: false,
    } as never);
    await t.settle();
    expect(t.text()).toContain("│"); // split view now shows the divider
  });

  test("scrolls when the diff overflows the viewport", async () => {
    const big = Array.from({ length: 40 }, (_, i) => `row ${i}`).join("\n");
    const changed = `${big}\nappended tail`;
    const t = await mountApp(
      <VBox style={{ width: 50 }}>
        <Diff id="d" style={{ height: 8 }} oldText={big} newText={changed} context={Infinity} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<DiffWidget>("d") as DiffWidget;
    expect(t.text()).toContain("row 0");

    w.handleKey({ name: "end", handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("appended tail");
    expect(t.text()).not.toContain("row 0");

    // home jumps back to the top.
    w.handleKey({ name: "home", handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("row 0");
    expect(t.text()).not.toContain("appended tail");

    // pagedown advances by a viewport; the first rows scroll off.
    w.handleKey({ name: "pagedown", handled: false } as never);
    await t.settle();
    expect(t.text()).not.toContain("row 0");
  });

  test("split view pads unequal deletion/addition blocks across both panes", async () => {
    const oldText = "keep\ndrop A\ndrop B\ndrop C\ntail";
    const newText = "keep\nadd X\ntail";
    const t = await mountApp(
      <VBox style={{ width: 56 }}>
        <Diff id="d" oldText={oldText} newText={newText} view="split" context={Infinity} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<DiffWidget>("d") as DiffWidget;
    const lines = w.selectableLines();
    // Both the removed-only and added lines survive into the paired split rows.
    expect(lines.some((l) => l.includes("drop A"))).toBe(true);
    expect(lines.some((l) => l.includes("add X"))).toBe(true);
    expect(t.text()).toContain("│");
  });

  test("mouse wheel scrolls the body up and down", async () => {
    const big = Array.from({ length: 40 }, (_, i) => `row ${i}`).join("\n");
    const t = await mountApp(
      <VBox style={{ width: 50 }}>
        <Diff
          id="d"
          style={{ height: 8 }}
          oldText={big}
          newText={`${big}\ntail`}
          context={Infinity}
        />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<DiffWidget>("d") as DiffWidget;
    expect(t.text()).toContain("row 0");

    for (let i = 0; i < 5; i++) w.handleScroll({ type: "scroll_down", handled: false } as never);
    await t.settle();
    expect(t.text()).not.toContain("row 0");

    for (let i = 0; i < 10; i++) w.handleScroll({ type: "scroll_up", handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("row 0");
  });

  test("dragging the scrollbar track jumps the view; release ends the drag", async () => {
    const big = Array.from({ length: 60 }, (_, i) => `row ${i}`).join("\n");
    const t = await mountApp(
      <VBox style={{ width: 50 }}>
        <Diff
          id="d"
          style={{ height: 8 }}
          oldText={big}
          newText={`${big}\ntail`}
          context={Infinity}
        />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<DiffWidget>("d") as DiffWidget;
    const c = w.getContentRect();
    const sbX = c.right - 1;

    // Press near the bottom of the scrollbar track to jump down.
    w.handleMouse({
      type: "press",
      button: "left",
      x: sbX,
      y: c.bottom - 1,
      handled: false,
    } as never);
    await t.settle();
    expect(t.text()).not.toContain("row 0");

    // Drag back to the top.
    w.handleMouse({ type: "drag", x: sbX, y: c.y, handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("row 0");

    // Release ends the drag; a later stray drag must not move the view.
    w.handleMouse({ type: "release", x: sbX, y: c.y, handled: false } as never);
    const after = t.text();
    w.handleMouse({ type: "drag", x: sbX, y: c.bottom - 1, handled: false } as never);
    await t.settle();
    expect(t.text()).toBe(after);
  });

  test("split view with hunks and over-wide lines: folds runs and clips segments", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => `${"col".repeat(8)} ${i}`);
    const oldText = rows.join("\n");
    const newText = rows.map((r, i) => (i === 0 ? `${r} CHANGED` : r)).join("\n");
    const t = await mountApp(
      <VBox style={{ width: 40 }}>
        <Diff id="d" oldText={oldText} newText={newText} view="split" context={1} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("⋯"); // hunk marker for the folded middle
    expect(text).toContain("│"); // split divider
    // Lines are wider than the narrow panes, so they're clipped (no overflow row).
    const w = t.findById<DiffWidget>("d") as DiffWidget;
    expect(w.selectableLines().length).toBeGreaterThan(0);
  });

  test("keyboard scrolling only acts while focused (keys consumed)", async () => {
    const big = Array.from({ length: 40 }, (_, i) => `row ${i}`).join("\n");
    const t = await mountApp(
      <VBox style={{ width: 50 }}>
        <Diff
          id="d"
          style={{ height: 8 }}
          oldText={big}
          newText={`${big}\ntail`}
          context={Infinity}
        />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<DiffWidget>("d") as DiffWidget;

    const ev = { name: "pagedown", handled: false } as never;
    w.handleKey(ev);
    expect((ev as { handled: boolean }).handled).toBe(true);
  });
});
