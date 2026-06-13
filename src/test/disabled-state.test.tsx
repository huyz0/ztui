import { describe, expect, test } from "vitest";
import { Button, Checkbox, Input, Select, VBox } from "../index.ts";
import type { InputWidget } from "../widgets/controls/input.ts";
import { mountApp } from "./harness.tsx";

describe("Disabled widget state", () => {
  test("a disabled widget is excluded from the focus order", async () => {
    const { screen, findById } = await mountApp(
      <VBox>
        <Input id="a" />
        <Input id="b" disabled />
        <Input id="c" />
      </VBox>,
      { cols: 30, rows: 8 },
    );
    const focusables = screen.getFocusableWidgets().map((w) => w.id);
    expect(focusables).toContain("a");
    expect(focusables).toContain("c");
    expect(focusables).not.toContain("b");
    // Tabbing from a never lands on the disabled b.
    screen.focusWidget(findById("a")!);
    screen.focusNext();
    expect(screen.focusedWidget?.id).toBe("c");
  });

  test("focusWidget refuses a disabled widget", async () => {
    const { screen, findById } = await mountApp(<Input id="x" disabled />, { cols: 20, rows: 3 });
    screen.focusWidget(findById("x")!);
    expect(screen.focusedWidget).toBeNull();
  });

  test("a disabled input ignores typing", async () => {
    const { screen, findById, settle } = await mountApp(<Input id="inp" disabled />, {
      cols: 20,
      rows: 3,
    });
    // Force focus past the guard to prove key dispatch is also gated.
    const inp = findById<InputWidget>("inp")!;
    (screen as unknown as { _focusedWidget: unknown })._focusedWidget = inp;
    inp.focused = true;
    for (const ch of "hello") (screen.parent as any).driver?.simulateKey?.(ch, ch);
    await settle();
    expect(inp.value).toBe("");
  });

  test("a disabled widget inside a disabled container is disabled too", async () => {
    const { findById } = await mountApp(
      <VBox disabled>
        <Checkbox id="c" label="x" />
      </VBox>,
      { cols: 20, rows: 3 },
    );
    expect(findById("c")!.isDisabled()).toBe(true);
  });

  test("a disabled button does not fire onClick", async () => {
    let clicks = 0;
    const { findById } = await mountApp(
      <Button id="btn" disabled onClick={() => clicks++}>
        Go
      </Button>,
      { cols: 20, rows: 3 },
    );
    const btn = findById("btn")!;
    const r = btn.region;
    const ev: any = { type: "press", button: "left", x: r.x, y: r.y };
    // Route through the widget's own mouse handler; disabled short-circuits in
    // the app, but the widget must not self-activate either.
    btn.handleMouse?.(ev);
    expect(clicks).toBe(0);
  });

  test("disabled controls render in the muted color", async () => {
    const { cellAt, settle } = await mountApp(
      <VBox theme="default-dark" style={{ background: "$background" }}>
        <Select id="s" options={["One", "Two"]} value="One" disabled />
      </VBox>,
      { cols: 20, rows: 4 },
    );
    await settle();
    // The "One" label paints in $disabled (== $dimmed, #8a8a8a) for default-dark.
    let labelCell: any = null;
    for (let y = 0; y < 4 && !labelCell; y++)
      for (let x = 0; x < 20; x++) {
        const c = cellAt(x, y);
        if (c.char === "O") {
          labelCell = c;
          break;
        }
      }
    expect(labelCell?.style?.color).toBe("#8a8a8a");
  });
});
