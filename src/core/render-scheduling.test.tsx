import { describe, expect, test, vi } from "vitest";
import { Icon, Label, VBox } from "../react.ts";
import { flush, mountApp } from "../test/harness.tsx";

describe("render scheduling: queueRepaint reuses layout", () => {
  test("queueRepaint skips measure/layout; queueRender forces it", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();

    // Spy on the screen's measure pass (the entry point of the layout walk).
    const measureSpy = vi.spyOn(t.screen, "measure");

    // A paint-only frame must not re-run layout.
    t.app.queueRepaint();
    await flush();
    expect(measureSpy).not.toHaveBeenCalled();

    // A full frame must.
    t.app.queueRender();
    await flush();
    expect(measureSpy).toHaveBeenCalledTimes(1);

    measureSpy.mockRestore();
  });

  test("queueRepaint reuses resolved styles when no stylesheet is loaded", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();
    const styleSpy = vi.spyOn(
      t.app as unknown as { resolveAllStyles: () => void },
      "resolveAllStyles",
    );

    t.app.queueRepaint();
    await flush();
    expect(styleSpy).not.toHaveBeenCalled(); // styles reused

    t.app.queueRender();
    await flush();
    expect(styleSpy).toHaveBeenCalled(); // full frame restyles
    styleSpy.mockRestore();
  });

  test("with a stylesheet loaded, repaint still re-resolves styles (time-varying rules)", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    t.app.loadStyles("label { color: $focus; }");
    await t.settle();
    const styleSpy = vi.spyOn(
      t.app as unknown as { resolveAllStyles: () => void },
      "resolveAllStyles",
    );
    t.app.queueRepaint();
    await flush();
    expect(styleSpy).toHaveBeenCalled();
    styleSpy.mockRestore();
  });

  test("queueRepaint(region) clears only the damaged rows; queueRender clears all", async () => {
    const t = await mountApp(
      <VBox>
        <Label>row0</Label>
        <Label>row1</Label>
        <Label>row2</Label>
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await t.settle();
    const clearSpy = vi.spyOn(t.app.buffer, "clear");

    t.app.queueRepaint({ y: 1, bottom: 2 }); // damage row 1 only
    await flush();
    expect(clearSpy).toHaveBeenLastCalledWith(1, 2);

    t.app.queueRender(); // full
    await flush();
    expect(clearSpy).toHaveBeenLastCalledWith(); // whole-grid clear

    clearSpy.mockRestore();
  });

  test("queueRepaint with a zero-height region is a no-op, not a full-frame repaint", async () => {
    // Regression: only `region.bottom > region.y` took the scoped-damage
    // branch; a caller-supplied region with bottom === y (e.g. a collapsed or
    // not-yet-measured widget's blinking caret) fell into the "no region"
    // else-branch and forced repaintFull = true — a full-frame repaint on
    // every blink tick instead of the harmless no-op the zero-height region
    // actually calls for.
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();
    const clearSpy = vi.spyOn(t.app.buffer, "clear");

    t.app.queueRepaint({ y: 3, bottom: 3 }); // zero height
    await flush();
    expect(clearSpy).not.toHaveBeenCalled();

    clearSpy.mockRestore();
  });

  test("inline graphics force a full frame (no damage-scoped partial repaint)", async () => {
    const t = await mountApp(
      <VBox>
        <Label>a</Label>
        <Label>b</Label>
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await t.settle();
    // Simulate the previous frame having drawn an icon/image.
    t.app.buffer.containsGraphics = true;
    const clearSpy = vi.spyOn(t.app.buffer, "clear");
    t.app.queueRepaint({ y: 1, bottom: 2 }); // would be partial, but graphics force full
    await flush();
    expect(clearSpy).toHaveBeenLastCalledWith(); // whole-grid clear, not (1, 2)
    clearSpy.mockRestore();
  });

  test("a steady-state re-render of a static graphic does not erase/flicker", async () => {
    const t = await mountApp(<Icon name="cog" />, { cols: 20, rows: 6 });
    await t.settle();
    // The icon is already on screen; re-rendering with the same graphic set must
    // not wipe the terminal (no \x1b[2J), or static graphics would flicker.
    const writeSpy = vi.spyOn(t.driver, "writeFrame");
    t.app.queueRender();
    await flush();
    const written = writeSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).not.toContain("\x1b[2J");
    writeSpy.mockRestore();
  });

  test("a damage-scoped repaint retains content outside the damaged rows", async () => {
    const t = await mountApp(
      <VBox>
        <Label>alpha</Label>
        <Label>bravo</Label>
        <Label>charlie</Label>
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await t.settle();
    // A partial repaint scoped to the middle row must not blank the others.
    t.app.queueRepaint({ y: 1, bottom: 2 });
    await flush();
    const text = t.text();
    expect(text).toContain("alpha");
    expect(text).toContain("bravo");
    expect(text).toContain("charlie");
  });

  test("a queueRender in the same tick wins over a queueRepaint (no stale layout)", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();

    const measureSpy = vi.spyOn(t.screen, "measure");
    // Both requested before the microtask runs → must take the full path.
    t.app.queueRepaint();
    t.app.queueRender();
    await flush();
    expect(measureSpy).toHaveBeenCalledTimes(1);
    measureSpy.mockRestore();
  });
});
