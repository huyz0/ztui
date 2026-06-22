import { describe, expect, test } from "vitest";
import { Label, VBox } from "../react.ts";
import { mountApp } from "../test/harness.tsx";
import { flush } from "../tools/app-mount.tsx";

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
