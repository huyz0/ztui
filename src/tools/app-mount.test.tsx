import { describe, expect, test } from "vitest";
import { Label } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountTestApp } from "./app-mount.tsx";

describe("mountTestApp", () => {
  test("autoRun: false mounts without starting the app loop", async () => {
    const t = await mountTestApp(<Label>hi</Label>, { cols: 20, rows: 3, autoRun: false });
    // The tree is still rendered/queryable even though app.run() was never called.
    expect(t.findById).toBeInstanceOf(Function);
    expect(t.screen).toBeTruthy();
    // Manually starting it afterwards should work fine.
    t.app.run();
    await t.settle();
    expect(t.text()).toContain("hi");
  });

  test("screenStyle merges onto the active screen's style", async () => {
    const t = await mountTestApp(<Label>styled</Label>, {
      cols: 20,
      rows: 3,
      screenStyle: { background: "blue" },
    });
    await t.settle();
    expect(t.screen.style?.background).toBe("blue");
  });
});
