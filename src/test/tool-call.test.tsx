import { useEffect } from "react";
import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { Label, ToolCall } from "../react/components.tsx";
import { reconciler } from "../react/reconciler.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 50,
  rows: 12,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

describe("ToolCall", () => {
  test("collapsed: badge, name, args and summary visible; body hidden", async () => {
    const t = await mountApp(
      <ToolCall name="Read" args="src/app.ts" status="success" summary="120 lines">
        <Label>file body</Label>
      </ToolCall>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("✔"); // success badge
    expect(text).toContain("Read");
    expect(text).toContain("src/app.ts");
    expect(text).toContain("120 lines"); // summary shown while collapsed
    expect(text).toContain("▸"); // closed disclosure
    expect(text).not.toContain("file body");
  });

  test("defaultOpen: body and open marker shown; summary hidden", async () => {
    const t = await mountApp(
      <ToolCall name="Bash" status="success" summary="exit 0" defaultOpen>
        <Label>command output</Label>
      </ToolCall>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("▾"); // open disclosure
    expect(text).toContain("command output");
    expect(text).not.toContain("exit 0"); // summary only while collapsed
  });

  test("a multi-line body stacks vertically instead of overlapping", async () => {
    const t = await mountApp(
      <ToolCall name="Read" status="success" defaultOpen>
        <Label>first line</Label>
        <Label>second line</Label>
        <Label>third line</Label>
      </ToolCall>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    // All three must survive — overlapping children would clobber each other.
    expect(text).toContain("first line");
    expect(text).toContain("second line");
    expect(text).toContain("third line");
    // …and on distinct rows, in order.
    const lines = text.split("\n");
    const r1 = lines.findIndex((l) => l.includes("first line"));
    const r2 = lines.findIndex((l) => l.includes("second line"));
    const r3 = lines.findIndex((l) => l.includes("third line"));
    expect(r1).toBeGreaterThanOrEqual(0);
    expect(r2).toBe(r1 + 1);
    expect(r3).toBe(r2 + 1);
  });

  test("each status renders its own badge glyph", async () => {
    for (const [status, glyph] of [
      ["pending", "○"],
      ["running", "◐"],
      ["error", "✖"],
    ] as const) {
      const t = await mountApp(<ToolCall name="X" status={status} />, OPTS);
      await t.settle();
      expect(t.text()).toContain(glyph);
    }
  });

  test("clicking the header toggles an uncontrolled card and fires onToggle", async () => {
    const toggles: boolean[] = [];
    const t = await mountApp(
      <ToolCall id="tc" name="Read" onToggle={(o) => toggles.push(o)}>
        <Label>body text</Label>
      </ToolCall>,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("tc") as Widget;
    const header = root.children[0] as Widget; // the clickable HBox

    header.onClick?.({} as never);
    await t.settle();
    expect(toggles).toEqual([true]);
    expect(t.text()).toContain("body text");

    header.onClick?.({} as never);
    await t.settle();
    expect(toggles).toEqual([true, false]);
    expect(t.text()).not.toContain("body text");
  });

  test("controlled open prop drives the body and ignores internal toggles", async () => {
    const toggles: boolean[] = [];
    const ui = (open: boolean) => (
      <ToolCall id="tc" name="Read" open={open} onToggle={(o) => toggles.push(o)}>
        <Label>controlled body</Label>
      </ToolCall>
    );
    const t = await mountApp(ui(false), OPTS);
    await t.settle();
    const header = (t.findById<Widget>("tc") as Widget).children[0] as Widget;

    // Parent ignores onToggle → stays closed even after a click.
    header.onClick?.({} as never);
    await t.settle();
    expect(toggles).toEqual([true]);
    expect(t.text()).not.toContain("controlled body");

    // Parent flips the prop → now open.
    reconciler.updateContainer(ui(true), t.container, null, () => {});
    await t.settle();
    expect(t.text()).toContain("controlled body");
  });

  test("the body stays mounted while collapsed, not remounted on expand", async () => {
    // Regression: the body was only rendered when `hasBody && isOpen`, so a
    // collapsed card didn't just hide its body — it unmounted it, discarding
    // any internal state (e.g. a streaming child's buffered lines). This
    // contradicts the component's own documented contract ("The body stays
    // mounted while collapsed, so a streaming result keeps updating behind
    // the fold").
    let mounts = 0;
    function Probe() {
      useEffect(() => {
        mounts++;
      }, []);
      return <Label>probe</Label>;
    }
    const t = await mountApp(
      <ToolCall id="tc" name="Read" defaultOpen={false}>
        <Probe />
      </ToolCall>,
      OPTS,
    );
    await t.settle();
    expect(mounts).toBe(1);

    const header = (t.findById<Widget>("tc") as Widget).children[0] as Widget;
    header.onClick?.({} as never); // expand
    await t.settle();
    expect(t.text()).toContain("probe");
    expect(mounts).toBe(1); // still just the original mount, not remounted
  });

  test("a header with no body shows no disclosure triangle", async () => {
    const t = await mountApp(<ToolCall name="Done" status="success" />, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("Done");
    expect(text).not.toContain("▸");
    expect(text).not.toContain("▾");
  });

  test("renders a leading icon before the name", async () => {
    const t = await mountApp(<ToolCall name="Bash" icon={<Label>{">"}</Label>} />, OPTS);
    await t.settle();
    const text = t.text();
    const row = text.split("\n").find((l) => l.includes("Bash")) ?? "";
    // The icon glyph sits to the left of the name on the header row.
    expect(row.indexOf(">")).toBeGreaterThanOrEqual(0);
    expect(row.indexOf(">")).toBeLessThan(row.indexOf("Bash"));
  });

  test("accent={{color}} paints a left bar by default; side override flips it", async () => {
    const left = await mountApp(
      <ToolCall id="tc" name="Bash" accent={{ color: "$dimmed" }} />,
      OPTS,
    );
    await left.settle();
    const lcs = (left.findById<Widget>("tc") as Widget).computedStyle;
    expect(lcs.borderLeft).toBeTruthy();
    expect(lcs.borderRight).toBeFalsy();

    const right = await mountApp(
      <ToolCall id="tc" name="Bash" accent={{ color: "$dimmed", side: "right" }} />,
      OPTS,
    );
    await right.settle();
    const rcs = (right.findById<Widget>("tc") as Widget).computedStyle;
    expect(rcs.borderRight).toBeTruthy();
    expect(rcs.borderLeft).toBeFalsy();
  });

  test("no accent prop leaves the card border-free", async () => {
    const t = await mountApp(<ToolCall id="tc" name="Bash" />, OPTS);
    await t.settle();
    const cs = (t.findById<Widget>("tc") as Widget).computedStyle;
    expect(cs.borderLeft).toBeFalsy();
    expect(cs.borderRight).toBeFalsy();
  });
});
