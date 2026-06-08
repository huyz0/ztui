import { describe, expect, test } from "vitest";
import { Size } from "../geometry/size.ts";
import { App, View } from "../index.ts";
import { reconciler, render } from "../react/reconciler.ts";
import { VTEDriver } from "./vte-runner.ts";

function findWidgetById(screen: any, id: string): any {
  let found: any;
  screen.walk((n: any) => {
    if (n.id === id) found = n;
  });
  return found;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("host-config — prop clearing on re-render", () => {
  test("removed onClick / className / style / id are cleared from the reused widget", async () => {
    const driver = new VTEDriver(80, 24);
    const app = new App(driver);

    function Comp({ active }: { active: boolean }) {
      return (
        <View
          id={active ? "target" : undefined}
          className={active ? "active box" : undefined}
          style={active ? { color: "red" } : undefined}
          onClick={active ? () => {} : undefined}
        />
      );
    }

    const container = render(<Comp active={true} />, app.activeScreen);
    app.run();
    await tick();

    const widget = findWidgetById(app.activeScreen, "target");
    expect(widget).toBeDefined();
    expect(typeof widget.onClick).toBe("function");
    expect(widget.classes.has("active")).toBe(true);
    expect(widget.classes.has("box")).toBe(true);
    expect(widget.style.color).toBe("red");

    // Re-render with all of those props removed; the widget instance is reused.
    reconciler.updateContainer(<Comp active={false} />, container, null, () => {});
    await tick();

    expect(widget.onClick).toBeUndefined();
    expect(widget.classes.size).toBe(0);
    expect(widget.style.color).toBeUndefined();
    expect(widget.id).toBe("");

    app.stop();
  });

  test("empty className produces an empty class set (no bogus '' class)", async () => {
    const driver = new VTEDriver(80, 24);
    const app = new App(driver);

    render(<View id="t" className="" />, app.activeScreen);
    app.run();
    await tick();

    const widget = findWidgetById(app.activeScreen, "t");
    expect(widget.classes.size).toBe(0);
    expect(widget.classes.has("")).toBe(false);

    app.stop();
  });
});

describe("App — resize timer lifecycle", () => {
  test("pending resize debounce timer is cleared on stop()", async () => {
    const driver = new VTEDriver(80, 24);
    const app = new App(driver);

    render(<View />, app.activeScreen);
    app.run();
    await tick();

    // Fire a resize so the 30ms debounce timer is armed.
    (driver as any).emit("resize", new Size(100, 30));
    expect((app as any).resizeTimeout).not.toBeNull();

    app.stop();
    expect((app as any).resizeTimeout).toBeNull();
  });
});
