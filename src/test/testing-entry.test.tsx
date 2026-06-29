import { describe, expect, test } from "vitest";
import { Button, Label, VBox } from "../react/components.tsx";
import {
  cleanupMountedApps,
  flush,
  mountApp,
  mountTestApp,
  VTEDriver,
  waitFor,
} from "../testing.ts";
import "../widgets/index.ts";

// Exercises the public, runner-agnostic harness (`@huyz0/ztui/testing`) directly
// — the same surface apps consume. Teardown here is explicit via
// `cleanupMountedApps()` (no Vitest `afterEach` wired inside the entry).

describe("@huyz0/ztui/testing entry", () => {
  test("exposes the public harness surface", () => {
    expect(typeof mountApp).toBe("function");
    expect(typeof mountTestApp).toBe("function");
    expect(typeof cleanupMountedApps).toBe("function");
    expect(typeof waitFor).toBe("function");
    expect(typeof flush).toBe("function");
    expect(typeof VTEDriver).toBe("function");
  });

  test("mountApp renders a tree and exposes query helpers", async () => {
    const t = await mountApp(
      <VBox>
        <Label>hello testing</Label>
        <Button id="go">Go</Button>
      </VBox>,
      { cols: 40, rows: 6 },
    );
    await t.settle();
    expect(t.text()).toContain("hello testing");
    expect(t.findById("go")).toBeTruthy();
    expect(t.driver).toBeInstanceOf(VTEDriver);
  });

  test("cleanupMountedApps tears down and is safe to call repeatedly", async () => {
    const a = await mountApp(<Label>one</Label>, { cols: 20, rows: 3 });
    await a.settle();
    cleanupMountedApps();
    expect(() => cleanupMountedApps()).not.toThrow(); // idempotent

    // A fresh mount works after teardown.
    const b = await mountApp(<Label>two</Label>, { cols: 20, rows: 3 });
    await b.settle();
    expect(b.text()).toContain("two");
    cleanupMountedApps();
  });
});
