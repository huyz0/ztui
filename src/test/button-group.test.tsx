import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { Button, ButtonGroup, Form, Input } from "../react/components.tsx";
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
});
