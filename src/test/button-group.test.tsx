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

  test("arrow keys move focus between the buttons", async () => {
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
    const g = group(t);

    g.handleKey({ name: "right", key: "right" } as never);
    expect(t.screen.focusedWidget).toBe(b);

    g.handleKey({ name: "right", key: "right" } as never);
    expect(t.screen.focusedWidget).toBe(c);

    g.handleKey({ name: "left", key: "left" } as never);
    expect(t.screen.focusedWidget).toBe(b);
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
