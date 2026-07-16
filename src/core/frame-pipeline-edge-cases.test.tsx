import { describe, expect, test } from "vitest";
import { Widget } from "../dom/widget.ts";
import { Label } from "../react.ts";
import { flush, mountApp } from "../test/harness.tsx";

describe("frame pipeline: scoped-repaint edge cases", () => {
  test("queueRepaintWidget on a widget that isn't in the active tree stays a full frame", async () => {
    const t = await mountApp(<Label>hi</Label>, { cols: 20, rows: 5 });
    await t.settle();

    // A widget with no parent chain reaching activeScreen — e.g. one queued for
    // repaint just before being detached/discarded. Its region is also still the
    // zero-size construction default, so neither half of the "does this widget
    // even count?" check passes: the union of dirty regions stays empty and the
    // frame can't downgrade to a scoped repaint.
    const orphan = new Widget("orphan");
    expect(() => t.app.queueRepaintWidget(orphan, "test:orphan")).not.toThrow();
    await flush();

    const f = t.app.getLastFrame();
    expect(f?.full).toBe(true);
  });
});
