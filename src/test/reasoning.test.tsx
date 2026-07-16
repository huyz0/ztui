import { useEffect } from "react";
import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { Label, Reasoning } from "../react/components.tsx";
import { reconciler } from "../react/reconciler.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 50,
  rows: 12,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

describe("Reasoning", () => {
  test("active: expands by default and shows the label + body", async () => {
    const t = await mountApp(
      <Reasoning active label="Thinking">
        <Label>chain of thought</Label>
      </Reasoning>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("✻");
    expect(text).toContain("Thinking");
    expect(text).toContain("▾"); // expanded
    expect(text).toContain("chain of thought");
  });

  test("done: shows the duration instead of a spinner", async () => {
    const t = await mountApp(
      <Reasoning active={false} duration="thought for 3s" defaultOpen={false}>
        <Label>hidden thought</Label>
      </Reasoning>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("thought for 3s");
    expect(text).toContain("▸"); // collapsed
    expect(text).not.toContain("hidden thought");
  });

  test("collapseWhenDone: folds itself when active flips false", async () => {
    const ui = (active: boolean) => (
      <Reasoning id="r" active={active} collapseWhenDone>
        <Label>secret reasoning</Label>
      </Reasoning>
    );
    const t = await mountApp(ui(true), OPTS);
    await t.settle();
    expect(t.text()).toContain("secret reasoning"); // expanded while active

    reconciler.updateContainer(ui(false), t.container, null, () => {});
    await t.settle();
    expect(t.text()).not.toContain("secret reasoning"); // auto-collapsed
  });

  test("clicking the header toggles an uncontrolled block", async () => {
    const toggles: boolean[] = [];
    const t = await mountApp(
      <Reasoning id="r" active onToggle={(o) => toggles.push(o)}>
        <Label>body</Label>
      </Reasoning>,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("r") as Widget;
    const header = root.children[0] as Widget;

    header.onClick?.({} as never);
    await t.settle();
    expect(toggles).toEqual([false]); // started open (active), now closed
    expect(t.text()).not.toContain("body");
  });

  test("with no children, the header shows a blank disclosure and isn't clickable", async () => {
    const t = await mountApp(<Reasoning id="r" label="Thinking" />, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("Thinking");
    expect(text).not.toContain("▸");
    expect(text).not.toContain("▾");
    const root = t.findById<Widget>("r") as Widget;
    const header = root.children[0] as Widget;
    expect(header.onClick).toBeUndefined();
  });

  test("without collapseWhenDone, finishing does not auto-collapse the body", async () => {
    const ui = (active: boolean) => (
      <Reasoning id="r" active={active}>
        <Label>still visible</Label>
      </Reasoning>
    );
    const t = await mountApp(ui(true), OPTS);
    await t.settle();
    expect(t.text()).toContain("still visible");

    reconciler.updateContainer(ui(false), t.container, null, () => {});
    await t.settle();
    // collapseWhenDone defaults to false, so the body stays expanded.
    expect(t.text()).toContain("still visible");
  });

  test("controlled mode: the active→done transition does not drive open state", async () => {
    let toggled = false;
    const ui = (active: boolean) => (
      <Reasoning id="r" active={active} open={true} onToggle={() => (toggled = true)}>
        <Label>controlled body</Label>
      </Reasoning>
    );
    const t = await mountApp(ui(true), OPTS);
    await t.settle();
    expect(t.text()).toContain("controlled body");

    reconciler.updateContainer(ui(false), t.container, null, () => {});
    await t.settle();
    // Controlled: the effect must not call setOpenSilently, so no onToggle fires
    // and the caller-supplied `open` continues to govern visibility.
    expect(toggled).toBe(false);
    expect(t.text()).toContain("controlled body");
  });

  test("uncontrolled: active flipping false→true auto-expands the body", async () => {
    const ui = (active: boolean) => (
      <Reasoning id="r" active={active} defaultOpen={false}>
        <Label>newly visible</Label>
      </Reasoning>
    );
    const t = await mountApp(ui(false), OPTS);
    await t.settle();
    expect(t.text()).not.toContain("newly visible");

    reconciler.updateContainer(ui(true), t.container, null, () => {});
    await t.settle();
    expect(t.text()).toContain("newly visible");
  });

  test("the body stays mounted while collapsed, not remounted on expand", async () => {
    // Regression: the body was only rendered when `hasBody && isOpen`, so
    // collapsing didn't just hide it — it unmounted it, discarding internal
    // state (e.g. streamed text accrued so far), contradicting the
    // documented "body stays mounted while collapsed" contract.
    let mounts = 0;
    function Probe() {
      useEffect(() => {
        mounts++;
      }, []);
      return <Label>probe</Label>;
    }
    const t = await mountApp(
      <Reasoning id="r" defaultOpen={false}>
        <Probe />
      </Reasoning>,
      OPTS,
    );
    await t.settle();
    expect(mounts).toBe(1);

    const header = (t.findById<Widget>("r") as Widget).children[0] as Widget;
    header.onClick?.({} as never); // expand
    await t.settle();
    expect(t.text()).toContain("probe");
    expect(mounts).toBe(1);
  });
});
