import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { Button, Input, Label, VBox } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = { cols: 40, rows: 10 };

describe("focusOnClick container", () => {
  test("clicking the container's chrome focuses its first focusable child", async () => {
    const t = await mountApp(
      <VBox id="panel" focusOnClick style={{ border: "rounded", padding: 1, width: 30, height: 6 }}>
        <Label>Heading</Label>
        <Input id="first" />
        <Input id="second" />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(t.screen.focusedWidget).toBeNull();

    // Click the container's border (top-left corner cell), not any field.
    const panel = t.findById<Widget>("panel") as Widget;
    const r = panel.region;
    t.driver.emit("mouse", { type: "press", button: "left", x: r.x, y: r.y });
    await t.settle();

    const focused = t.screen.focusedWidget as Widget | null;
    expect(focused).toBe(t.findById<Widget>("first"));
  });

  test("without focusOnClick a click on the chrome focuses nothing", async () => {
    const t = await mountApp(
      <VBox id="panel" style={{ border: "rounded", padding: 1, width: 30, height: 6 }}>
        <Input id="first" />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const panel = t.findById<Widget>("panel") as Widget;
    const r = panel.region;
    t.driver.emit("mouse", { type: "press", button: "left", x: r.x, y: r.y });
    await t.settle();
    expect(t.screen.focusedWidget).toBeNull();
  });

  test("clicking a real focusable child still focuses that child, not the first", async () => {
    const t = await mountApp(
      <VBox id="panel" focusOnClick style={{ padding: 1, width: 30, height: 6 }}>
        <Button id="a">A</Button>
        <Button id="b">B</Button>
      </VBox>,
      OPTS,
    );
    await t.settle();
    const b = t.findById<Widget>("b") as Widget;
    const r = b.region;
    t.driver.emit("mouse", { type: "press", button: "left", x: r.x, y: r.y });
    await t.settle();
    expect(t.screen.focusedWidget).toBe(b);
  });
});
