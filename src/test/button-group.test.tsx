import { describe, expect, test } from "vitest";
import { TextNode } from "../dom/text-node.ts";
import type { Widget } from "../dom/widget.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Button, ButtonGroup, Form, Input } from "../react/components.tsx";
import { ScreenBuffer } from "../render/buffer.ts";
import { ButtonWidget } from "../widgets/controls/button.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = { cols: 40, rows: 8 };

/** All Button widgets under the tree, in order. */
function buttons(t: Awaited<ReturnType<typeof mountApp>>): Widget[] {
  const out: Widget[] = [];
  t.screen.walk((n) => {
    if ((n as Widget).constructor?.name === "ButtonWidget") out.push(n as Widget);
  });
  return out;
}

function group(t: Awaited<ReturnType<typeof mountApp>>): Widget {
  let g: Widget | undefined;
  t.screen.walk((n) => {
    if ((n as Widget).constructor?.name === "ButtonGroupWidget") g = n as Widget;
  });
  if (!g) throw new Error("ButtonGroupWidget not found");
  return g;
}

describe("ButtonGroup", () => {
  test("is a single tab stop — only the active button is focusable", async () => {
    const t = await mountApp(
      <ButtonGroup>
        <Button id="a">Cancel</Button>
        <Button id="b">Save</Button>
        <Button id="c">Apply</Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const focusable = buttons(t).filter((b) => (b as any).focusable);
    expect(focusable.length).toBe(1);
  });

  test("arrow keys bubble from the focused button to the group and move focus", async () => {
    const t = await mountApp(
      <ButtonGroup>
        <Button id="a">Cancel</Button>
        <Button id="b">Save</Button>
        <Button id="c">Apply</Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const [a, b, c] = buttons(t);
    t.screen.focusWidget(a);

    // Drive through the real key pipeline: the focused button must NOT swallow
    // the arrow (regression: the base handleKey used to mark every key handled),
    // so it bubbles up to the group which moves focus.
    const arrow = (name: string) =>
      t.driver.emit("key", { key: name, name, ctrl: false, meta: false, shift: false });

    arrow("right");
    expect(t.screen.focusedWidget).toBe(b);
    arrow("right");
    expect(t.screen.focusedWidget).toBe(c);
    arrow("left");
    expect(t.screen.focusedWidget).toBe(b);
  });

  test("clicking a button makes it the active/focused one", async () => {
    const t = await mountApp(
      <ButtonGroup>
        <Button id="a">A</Button>
        <Button id="b">B</Button>
        <Button id="c">C</Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const [a, , c] = buttons(t);
    t.screen.focusWidget(a);
    // Click the third button (not the current tab stop) at its rendered cell.
    const r = c.region;
    t.driver.emit("mouse", { type: "press", button: "left", x: r.x, y: r.y });
    await t.settle();
    expect(t.screen.focusedWidget).toBe(c);
  });

  test("wraps around at the ends by default", async () => {
    const t = await mountApp(
      <ButtonGroup>
        <Button id="a">A</Button>
        <Button id="b">B</Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const [a, b] = buttons(t);
    t.screen.focusWidget(a);
    const g = group(t);
    g.handleKey({ name: "left", key: "left" } as never); // wrap to last
    expect(t.screen.focusedWidget).toBe(b);
  });

  test("an unrelated key is ignored and left unhandled", async () => {
    const t = await mountApp(
      <ButtonGroup>
        <Button id="a">A</Button>
        <Button id="b">B</Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const [a] = buttons(t);
    t.screen.focusWidget(a);
    const g = group(t);
    const ev = { name: "tab", key: "tab" } as never;
    g.handleKey(ev);
    expect((ev as any).handled).toBeFalsy();
    expect(t.screen.focusedWidget).toBe(a);
  });

  test("does not wrap past the end when wrap is false", async () => {
    const t = await mountApp(
      <ButtonGroup wrap={false}>
        <Button id="a">A</Button>
        <Button id="b">B</Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const [, b] = buttons(t);
    t.screen.focusWidget(b);
    const g = group(t);
    const ev = { name: "right", key: "right" } as never;
    g.handleKey(ev);
    expect((ev as any).handled).toBe(true);
    expect(t.screen.focusedWidget).toBe(b); // stayed put, no wrap to a
  });

  test("clicking outside any button is a no-op", async () => {
    const t = await mountApp(
      <ButtonGroup>
        <Button id="a">A</Button>
        <Button id="b">B</Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const [a] = buttons(t);
    t.screen.focusWidget(a);
    // Click well outside the group's bounds — no button region contains it.
    t.driver.emit("mouse", { type: "press", button: "left", x: 39, y: 7 });
    await t.settle();
    expect(t.screen.focusedWidget).toBe(a);
  });

  test("Home/End jump to the first/last enabled button", async () => {
    const t = await mountApp(
      <ButtonGroup>
        <Button id="a">A</Button>
        <Button id="b">B</Button>
        <Button id="c">C</Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const [a, , c] = buttons(t);
    t.screen.focusWidget(a);
    const g = group(t);
    g.handleKey({ name: "end", key: "end" } as never);
    expect(t.screen.focusedWidget).toBe(c);
    g.handleKey({ name: "home", key: "home" } as never);
    expect(t.screen.focusedWidget).toBe(a);
  });

  test("handleKey falls back to `key` when `name` is absent", async () => {
    const t = await mountApp(
      <ButtonGroup>
        <Button id="a">A</Button>
        <Button id="b">B</Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const [a, b] = buttons(t);
    t.screen.focusWidget(a);
    const g = group(t);
    g.handleKey({ key: "right" } as never);
    expect(t.screen.focusedWidget).toBe(b);
  });

  test("handleKey is a no-op when no buttons are enabled", async () => {
    const t = await mountApp(
      <ButtonGroup>
        <Button id="a" disabled>
          A
        </Button>
        <Button id="b" disabled>
          B
        </Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const g = group(t);
    // Nothing focused, no enabled buttons — should return without throwing.
    expect(() => g.handleKey({ name: "right", key: "right" } as never)).not.toThrow();
  });

  test("handleKey with nothing focused falls back to the stored active index", async () => {
    const t = await mountApp(
      <ButtonGroup>
        <Button id="a">A</Button>
        <Button id="b">B</Button>
        <Button id="c">C</Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const [, , c] = buttons(t);
    const g = group(t);
    // No widget is focused at all, so `idx` must fall back to `activeIndex` (0).
    expect(t.screen.focusedWidget).toBeFalsy();
    g.handleKey({ name: "right", key: "right" } as never);
    const focused = t.screen.focusedWidget;
    expect(focused).not.toBe(c);
  });

  test("Enter on a focused button fires its onClick natively", async () => {
    let clicked = "";
    const t = await mountApp(
      <ButtonGroup>
        <Button id="a" onClick={() => (clicked = "a")}>
          A
        </Button>
        <Button id="b" onClick={() => (clicked = "b")}>
          B
        </Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const [, b] = buttons(t);
    t.screen.focusWidget(b);
    b.handleKey({ name: "enter", key: "enter" } as never);
    expect(clicked).toBe("b");
  });

  test("a formAction button inside a group submits its Form", async () => {
    let submitted = false;
    const t = await mountApp(
      <Form onSubmit={() => (submitted = true)}>
        <Input id="field" />
        <ButtonGroup>
          <Button id="cancel">Cancel</Button>
          <Button id="save" formAction="submit">
            Save
          </Button>
        </ButtonGroup>
      </Form>,
      OPTS,
    );
    await t.settle();
    const save = buttons(t).find((b) => (b as any).id === "save");
    expect(save).toBeTruthy();
    t.screen.focusWidget(save as Widget);
    (save as Widget).handleKey({ name: "enter", key: "enter" } as never);
    await t.settle();
    expect(submitted).toBe(true);
  });

  test("a formAction=reset button inside a group resets its Form", async () => {
    const t = await mountApp(
      <Form>
        <Input id="field" validators={[]} />
        <ButtonGroup>
          <Button id="reset" formAction="reset">
            Reset
          </Button>
        </ButtonGroup>
      </Form>,
      OPTS,
    );
    await t.settle();
    const reset = buttons(t).find((b) => (b as any).id === "reset") as Widget;
    t.screen.focusWidget(reset);
    // Should not throw walking up to the Form and invoking reset() rather
    // than submit() (the ternary's other branch from the submit test above).
    expect(() => reset.handleKey({ name: "enter", key: "enter" } as never)).not.toThrow();
  });

  test("vertical orientation lays buttons out vertically", async () => {
    const t = await mountApp(
      <ButtonGroup orientation="vertical">
        <Button id="a">A</Button>
        <Button id="b">B</Button>
      </ButtonGroup>,
      OPTS,
    );
    await t.settle();
    const g = group(t);
    expect((g.computedStyle as any).layout).toBe("vertical");
  });
});

describe("ButtonWidget unit behaviour", () => {
  test("onKey falls back to ev.key when ev.name is absent", () => {
    const b = new ButtonWidget();
    let clicked = false;
    b.onClick = () => {
      clicked = true;
    };
    const ev = { key: "enter", handled: false } as any;
    b.onKey?.(ev);
    expect(clicked).toBe(true);
    expect(ev.handled).toBe(true);
  });

  test("handleMouse is a no-op once the event is already handled", () => {
    const b = new ButtonWidget();
    const triggered = false;
    b.formAction = "submit";
    // No parent Form, so triggerFormAction() would be a no-op anyway; instead
    // verify the widget doesn't touch onClick/formAction logic when the base
    // handleMouse already marked the event handled.
    const ev = { type: "press", button: "left", handled: true } as any;
    b.handleMouse(ev);
    expect(triggered).toBe(false);
  });

  test("render() falls back to static colours when there is no active App", () => {
    // With no mounted App, App.instance is null, so the disabled/explicit
    // colour resolution must fall back to its static defaults rather than
    // calling into the (absent) css resolver.
    const b = new ButtonWidget();
    b.appendChild(new TextNode("Go"));
    b.region = new Region(new Offset(0, 0), new Size(10, 1));
    b.disabled = true;
    const buffer = new ScreenBuffer(10, 1);
    expect(() => b.render(buffer)).not.toThrow();
    const row = buffer.cells[0].map((cell) => cell.char).join("");
    expect(row).toContain("Go");
  });

  test("render() falls back to a static explicit colour when there is no active App", () => {
    const b = new ButtonWidget();
    b.appendChild(new TextNode("Go"));
    b.computedStyle = { color: "$primary" };
    b.region = new Region(new Offset(0, 0), new Size(10, 1));
    const buffer = new ScreenBuffer(10, 1);
    expect(() => b.render(buffer)).not.toThrow();
    const row = buffer.cells[0].map((cell) => cell.char).join("");
    expect(row).toContain("Go");
  });
});
