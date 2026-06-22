import { describe, expect, test } from "vitest";
import { DOMNode } from "../dom/dom.ts";
import { TextNode } from "../dom/text-node.ts";
import { Widget } from "../dom/widget.ts";
import { HBox, Input, Label, Switch, VBox } from "../react.ts";
import { mountApp } from "../test/harness.tsx";
import { flush } from "../tools/app-mount.tsx";

/** Collect every widget with `tagName` under `root`, in document order. */
function findWidgets(root: DOMNode, tag: string): Widget[] {
  const out: Widget[] = [];
  const visit = (n: DOMNode): void => {
    if (n instanceof Widget && n.tagName === tag) out.push(n);
    for (const c of n.children) visit(c);
  };
  visit(root);
  return out;
}

/**
 * The subtree-damage theory, proven by counting widget renders (not timing). The
 * clip-prune in `Widget.renderChildren` already skips subtrees outside the damage
 * band; these tests pin that a scoped {@link App.queueRepaint} re-renders only the
 * band's widgets while a full {@link App.queueRender} walks the whole tree — the
 * gap that makes scoped repaints the lever for a large tree. `widgetsRendered` on
 * the frame summary is the instrument.
 */
describe("subtree-damage: scoped repaint skips out-of-band subtrees", () => {
  const N = 40;
  const rows = Array.from({ length: N }, (_, i) => `row ${i}`);
  const tree = (
    <VBox>
      {rows.map((r) => (
        <Label key={r}>{r}</Label>
      ))}
    </VBox>
  );

  test("a full frame renders the whole tree; a scoped repaint renders only the band", async () => {
    const t = await mountApp(tree, { cols: 30, rows: N });
    await t.settle();

    // Full frame: every visible widget renders.
    t.app.queueRender("test:full");
    await flush();
    const full = t.app.getLastFrame();
    expect(full?.full).toBe(true);
    expect(full?.widgetsRendered).toBeGreaterThanOrEqual(N); // ≥ all N labels

    // Repaint scoped to a 2-row band reuses layout and clips rendering to it.
    t.app.queueRepaint({ y: 5, bottom: 7 }, "test:scoped");
    await flush();
    const scoped = t.app.getLastFrame();
    expect(scoped?.full).toBe(false);
    expect(scoped?.damageY0).toBe(5);
    expect(scoped?.damageY1).toBe(7);

    // The lever: the scoped frame renders an order of magnitude fewer widgets —
    // only the band's subtree, not the whole stack.
    expect(scoped?.widgetsRendered).toBeLessThan((full?.widgetsRendered ?? 0) / 5);
  });

  test("scoped render cost is independent of tree size (band, not total)", async () => {
    const smallRows = Array.from({ length: 10 }, (_, i) => `r${i}`);
    const small = await mountApp(
      <VBox>
        {smallRows.map((r) => (
          <Label key={r}>{r}</Label>
        ))}
      </VBox>,
      { cols: 30, rows: 40 },
    );
    await small.settle();
    small.app.queueRepaint({ y: 2, bottom: 4 }, "test:scoped");
    await flush();
    const smallScoped = small.app.getLastFrame()?.widgetsRendered ?? 0;

    const big = await mountApp(tree, { cols: 30, rows: N });
    await big.settle();
    big.app.queueRepaint({ y: 2, bottom: 4 }, "test:scoped");
    await flush();
    const bigScoped = big.app.getLastFrame()?.widgetsRendered ?? 0;

    // Same 2-row band over a 10- vs 40-item stack: scoped cost tracks the band,
    // so the two counts are close — not 4× apart like a full render would be.
    expect(Math.abs(bigScoped - smallScoped)).toBeLessThanOrEqual(2);
  });
});

describe("subtree-damage: geometry-verified queueRepaintWidget", () => {
  const rows = Array.from({ length: 40 }, (_, i) => `row ${i}`);
  const tree = (
    <VBox>
      {rows.map((r) => (
        <Label key={r}>{r}</Label>
      ))}
    </VBox>
  );

  test("scopes to the widget's region when a fresh layout shows nothing moved", async () => {
    const t = await mountApp(tree, { cols: 30, rows: 40 });
    await t.settle();
    const w = findWidgets(t.app.activeScreen, "label")[10];

    t.app.queueRepaintWidget(w, "test");
    await flush();
    const f = t.app.getLastFrame();
    expect(f?.full).toBe(false); // downgraded to a scoped repaint
    expect(f?.damageY0).toBe(w.region.y);
    expect(f?.damageY1).toBe(w.region.bottom);
    // Only the widget's subtree re-rendered, not the whole 40-item stack.
    expect(f?.widgetsRendered).toBeLessThan(10);
  });

  test("a concurrent queueRender keeps the frame full", async () => {
    const t = await mountApp(tree, { cols: 30, rows: 40 });
    await t.settle();
    const w = findWidgets(t.app.activeScreen, "label")[10];

    t.app.queueRepaintWidget(w, "test");
    t.app.queueRender("test:full");
    await flush();
    expect(t.app.getLastFrame()?.full).toBe(true);
  });

  test("falls back to a full frame when the layout actually moves", async () => {
    const t = await mountApp(
      <HBox>
        <Label>a</Label>
        <Label>tail</Label>
      </HBox>,
      { cols: 40, rows: 3 },
    );
    await t.settle();
    const [a, b] = findWidgets(t.app.activeScreen, "label");
    const bxBefore = b.region.x;

    // Widen `a` imperatively so `b` must shift right — a real geometry change.
    (a.children[0] as TextNode).text = "aaaaaaaaaaaaaaaa";
    t.app.queueRepaintWidget(a, "test:resize");
    await flush();

    expect(b.region.x).not.toBe(bxBefore); // it genuinely moved
    expect(t.app.getLastFrame()?.full).toBe(true); // so we did NOT scope
  });

  test("typing into a focused fixed-width input repaints scoped, not full", async () => {
    const t = await mountApp(
      <VBox>
        <Input style={{ width: 20 }} />
        {rows.slice(0, 10).map((r) => (
          <Label key={r}>{r}</Label>
        ))}
      </VBox>,
      { cols: 30, rows: 12 },
    );
    await t.settle();
    const input = findWidgets(t.app.activeScreen, "input")[0];
    t.app.activeScreen.focusWidget(input);

    // Drive a character through the real key path (app → focused widget).
    t.app.input.handleKey({ key: "a", name: "a", ctrl: false, meta: false, shift: false });
    await flush();

    const f = t.app.getLastFrame();
    expect(f?.full).toBe(false); // the keystroke scoped to the input
    expect(f?.widgetsRendered).toBeLessThan(10); // not the whole 11-widget tree
  });

  test("a mouse press on a fixed-size control scopes end-to-end (focus + handle)", async () => {
    const t = await mountApp(
      <VBox>
        <Switch />
        {rows.slice(0, 10).map((r) => (
          <Label key={r}>{r}</Label>
        ))}
      </VBox>,
      { cols: 30, rows: 12 },
    );
    await t.settle();
    const sw = findWidgets(t.app.activeScreen, "switch")[0];

    // Drive a real press through the app: this runs focus:mouse-press AND the
    // widget's handler — both of which now scope rather than force a full frame.
    t.app.input.handleMouse({
      type: "press",
      button: "left",
      x: sw.region.x,
      y: sw.region.y,
    });
    await flush();

    const f = t.app.getLastFrame();
    expect(f?.full).toBe(false);
    expect(f?.widgetsRendered).toBeLessThan(10); // not the whole 11-widget tree
  });
});
