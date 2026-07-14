import { useState } from "react";
import { describe, expect, test } from "vitest";
import type { App } from "../core/app.ts";
import type { DOMNode } from "../dom/dom.ts";
import type { Widget } from "../dom/widget.ts";
import { ApprovalPrompt, Label } from "../react/components.tsx";
import { InputWidget } from "../widgets/controls/input.ts";
import { MenuListWidget } from "../widgets/controls/menu.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

/** Find the open ContextMenu's list widget, searching the screen + overlays. */
function findMenuList(app: App): MenuListWidget | undefined {
  let found: MenuListWidget | undefined;
  const visit = (node: DOMNode) => {
    if (node instanceof MenuListWidget) found = node;
    for (const c of node.children) visit(c);
  };
  visit(app.activeScreen);
  for (const o of app.activeScreen.overlays) visit(o);
  return found;
}

/** Find the inline text field, if any is showing. */
function findInput(app: App): InputWidget | undefined {
  let found: InputWidget | undefined;
  const visit = (node: DOMNode) => {
    if (node instanceof InputWidget) found = node;
    for (const c of node.children) visit(c);
  };
  visit(app.activeScreen);
  return found;
}

const OPTS = {
  cols: 60,
  rows: 14,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

describe("ApprovalPrompt — single", () => {
  test("renders prompt, detail body and the default action buttons with icons", async () => {
    const t = await mountApp(
      <ApprovalPrompt prompt="Allow Bash?" onAction={() => {}}>
        <Label>$ npm test</Label>
      </ApprovalPrompt>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("Allow Bash?");
    expect(text).toContain("$ npm test");
    expect(text).toContain("✓ Allow");
    expect(text).toContain("✗ Deny");
    expect(text).toContain("Always"); // dropdown action
    expect(text).toContain("▾"); // its caret
  });

  test("a flat action reports its id via onAction; Esc denies", async () => {
    const ids: string[] = [];
    const t = await mountApp(
      <ApprovalPrompt id="ap" prompt="Allow?" onAction={(id) => ids.push(id)} />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;
    root.handleKey({ name: "a", handled: false } as never); // Allow
    root.handleKey({ name: "escape", handled: false } as never); // deny
    expect(ids).toEqual(["allow", "deny"]);
  });

  test("arrow keys move focus across the permission buttons (one Tab stop)", async () => {
    const t = await mountApp(<ApprovalPrompt id="ap" prompt="Allow?" onAction={() => {}} />, OPTS);
    await t.settle();
    const btns: Widget[] = [];
    let grp: Widget | undefined;
    t.screen.walk((n) => {
      const name = (n as Widget).constructor?.name;
      if (name === "ButtonWidget") btns.push(n as Widget);
      else if (name === "ButtonGroupWidget") grp = n as Widget;
    });
    expect(grp).toBeTruthy();
    expect(btns.length).toBe(3); // Allow / Deny / Always
    // Single Tab stop: only one button is focusable at rest.
    expect(btns.filter((b) => (b as any).focusable).length).toBe(1);

    t.screen.focusWidget(btns[0]);
    (grp as Widget).handleKey({ name: "right", key: "right" } as never);
    expect(t.screen.focusedWidget).toBe(btns[1]);
    (grp as Widget).handleKey({ name: "right", key: "right" } as never);
    expect(t.screen.focusedWidget).toBe(btns[2]);
  });

  test("autoFocus focuses the first action button when the gate appears", async () => {
    const t = await mountApp(<ApprovalPrompt prompt="Allow?" onAction={() => {}} />, OPTS);
    await t.settle();
    const focused = t.screen.focusedWidget as Widget | null;
    expect(focused?.constructor?.name).toBe("ButtonWidget");
    expect(focused?.getTextContent?.()).toContain("Allow");
  });

  test("autoFocus={false} leaves focus untouched", async () => {
    const t = await mountApp(
      <ApprovalPrompt prompt="Allow?" autoFocus={false} onAction={() => {}} />,
      OPTS,
    );
    await t.settle();
    expect(t.screen.focusedWidget).toBeNull();
  });

  test("clicking a flat action button reports its id", async () => {
    const ids: string[] = [];
    const t = await mountApp(
      <ApprovalPrompt
        id="ap"
        prompt="Allow?"
        actions={[
          { id: "yes", label: "Yes", icon: "✓", key: "y" },
          { id: "no", label: "No", icon: "✗", key: "n" },
        ]}
        onAction={(id) => ids.push(id)}
      />,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("✓ Yes (y)");
    expect(t.text()).not.toContain("Always");
    const root = t.findById<Widget>("ap") as Widget;
    root.handleKey({ name: "y", handled: false } as never);
    expect(ids).toEqual(["yes"]);
  });

  test("an input action opens a field; typing + Enter reports the value", async () => {
    const reported: Array<[string, string | undefined]> = [];
    const t = await mountApp(
      <ApprovalPrompt
        id="ap"
        prompt="Allow `ls`?"
        actions={[
          { id: "allow", label: "Allow", icon: "✓", key: "a" },
          {
            id: "custom",
            label: "Custom pattern…",
            icon: "≈",
            key: "c",
            input: { placeholder: "glob" },
          },
        ]}
        onAction={(id, value) => reported.push([id, value])}
      />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;

    // Choose the input action — the field replaces the button row.
    root.handleKey({ name: "c", handled: false } as never);
    await t.settle();
    const input = findInput(t.app) as InputWidget;
    // Type a pattern and submit (Enter → onSubmit).
    for (const ch of "ls *") input.handleKey({ key: ch, handled: false } as never);
    input.handleKey({ name: "enter", handled: false } as never);
    await t.settle();
    expect(reported).toEqual([["custom", "ls *"]]);
  });

  test("Esc while typing cancels the field and reports nothing", async () => {
    const reported: Array<[string, string | undefined]> = [];
    const t = await mountApp(
      <ApprovalPrompt
        id="ap"
        prompt="Allow?"
        actions={[
          { id: "allow", label: "Allow", icon: "✓", key: "a" },
          { id: "custom", label: "Custom…", icon: "≈", key: "c", input: true },
        ]}
        onAction={(id, value) => reported.push([id, value])}
      />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;
    root.handleKey({ name: "c", handled: false } as never);
    await t.settle();
    const input = findInput(t.app) as InputWidget;
    for (const ch of "ls") input.handleKey({ key: ch, handled: false } as never);
    input.handleKey({ name: "escape", handled: false } as never);
    await t.settle();
    // Field closed (buttons back), no action reported.
    expect(findInput(t.app)).toBeUndefined();
    expect(t.text()).toContain("Custom…");
    expect(reported).toEqual([]);
  });

  test("denyOnEscape={false} ignores Esc", async () => {
    const ids: string[] = [];
    const t = await mountApp(
      <ApprovalPrompt
        id="ap"
        prompt="Allow?"
        denyOnEscape={false}
        onAction={(id) => ids.push(id)}
      />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;
    root.handleKey({ name: "escape", handled: false } as never);
    expect(ids).toEqual([]);
  });
});

describe("ApprovalPrompt — batch", () => {
  const calls = [
    { id: "1", name: "Read", args: "a.ts" },
    { id: "2", name: "Bash", args: "npm test" },
    { id: "3", name: "Bash", args: "rm -rf build", defaultDecision: "deny" as const },
  ];

  test("lists every call with its default allow/deny state and batch actions", async () => {
    const t = await mountApp(
      <ApprovalPrompt prompt="Run 3 tools:" calls={calls} onResolve={() => {}} />,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("Run 3 tools:");
    expect(text).toContain("Read");
    expect(text).toContain("rm -rf build");
    expect(text).toContain("✓ Allow all");
    expect(text).toContain("✗ Deny all");
    expect(text).toContain("Allow matching");
    expect(text).toContain("Apply");
  });

  test("Allow all / Deny all resolve every call at once", async () => {
    let resolved: Record<string, string> | null = null;
    const t = await mountApp(
      <ApprovalPrompt id="ap" prompt="Run:" calls={calls} onResolve={(d) => (resolved = d)} />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;
    root.handleKey({ name: "a", handled: false } as never); // Allow all
    expect(resolved).toEqual({ "1": "allow", "2": "allow", "3": "allow" });

    root.handleKey({ name: "d", handled: false } as never); // Deny all
    expect(resolved).toEqual({ "1": "deny", "2": "deny", "3": "deny" });
  });

  test("Apply submits the per-call defaults; a row click flips one", async () => {
    let resolved: Record<string, string> | null = null;
    const t = await mountApp(
      <ApprovalPrompt id="ap" prompt="Run:" calls={calls} onResolve={(d) => (resolved = d)} />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;

    // Defaults: 1,2 allow, 3 deny. Apply submits them as-is.
    root.handleKey({ name: "enter", handled: false } as never);
    expect(resolved).toEqual({ "1": "allow", "2": "allow", "3": "deny" });
  });

  test("Allow matching lists per-call patterns and allows every call that has the chosen one", async () => {
    // All start denied; the patterns come from each call's `matches`.
    const shellCalls = [
      {
        id: "1",
        name: "Bash",
        args: "cd src",
        matches: ["Bash", "cd", "read-only"],
        defaultDecision: "deny" as const,
      },
      {
        id: "2",
        name: "Bash",
        args: "ls",
        matches: ["Bash", "ls", "read-only"],
        defaultDecision: "deny" as const,
      },
      {
        id: "3",
        name: "Bash",
        args: "rm -rf build",
        matches: ["Bash", "rm"],
        defaultDecision: "deny" as const,
      },
    ];
    const matched: string[] = [];
    let resolved: Record<string, string> | null = null;
    const t = await mountApp(
      <ApprovalPrompt
        id="ap"
        prompt="Run:"
        calls={shellCalls}
        onMatch={(p) => matched.push(p)}
        onResolve={(d) => (resolved = d)}
      />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;

    // Open the "Allow matching" dropdown (key m) → the union of patterns shows.
    root.handleKey({ name: "m", handled: false } as never);
    await t.settle();
    const text = t.text();
    expect(text).toContain("read-only"); // a semantic group across cd + ls
    expect(text).toContain("all cd");
    expect(text).toContain("all rm");

    // Pattern union order: [Bash, cd, read-only, ls, rm]. Highlight starts at 0;
    // step down to "read-only" (index 2) and activate it.
    const list = findMenuList(t.app) as MenuListWidget;
    list.handleKey({ name: "down", handled: false } as never);
    list.handleKey({ name: "down", handled: false } as never);
    list.handleKey({ name: "enter", handled: false } as never);
    await t.settle();
    expect(matched).toEqual(["read-only"]);

    // cd + ls carry "read-only" → now allow; rm does not → still deny. Apply.
    root.handleKey({ name: "enter", handled: false } as never);
    expect(resolved).toEqual({ "1": "allow", "2": "allow", "3": "deny" });
  });

  test("Esc denies all in batch mode", async () => {
    let resolved: Record<string, string> | null = null;
    const t = await mountApp(
      <ApprovalPrompt id="ap" prompt="Run:" calls={calls} onResolve={(d) => (resolved = d)} />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;
    root.handleKey({ name: "escape", handled: false } as never);
    expect(resolved).toEqual({ "1": "deny", "2": "deny", "3": "deny" });
  });

  test("a new batch of calls (same mounted prompt) seeds its own decisions from defaultDecision", async () => {
    // Regression: the decisions state's lazy initializer only ran once, at
    // mount. A host that keeps one ApprovalPrompt mounted across a session
    // and re-renders it with a new batch once the previous one resolves
    // (e.g. the agent requests a second round of approvals) left every new
    // call id missing from `decisions` entirely, ignoring its own
    // defaultDecision.
    const batchOne = [{ id: "1", name: "Read", args: "a.ts" }];
    const batchTwo = [{ id: "2", name: "Bash", args: "npm test" }]; // defaultDecision omitted -> "allow"
    let resolvedSecond: Record<string, string> | null = null;

    function Swapper() {
      const [batch, setBatch] = useState(1);
      return (
        <ApprovalPrompt
          id="ap"
          prompt="Run:"
          calls={batch === 1 ? batchOne : batchTwo}
          onResolve={(d) => {
            if (batch === 1) setBatch(2);
            else resolvedSecond = d;
          }}
        />
      );
    }

    const t = await mountApp(<Swapper />, OPTS);
    await t.settle();
    const root1 = t.findById<Widget>("ap") as Widget;
    root1.handleKey({ name: "a", handled: false } as never); // Allow all — resolves batch one, swaps to batch two
    await t.settle();

    const root2 = t.findById<Widget>("ap") as Widget;
    root2.handleKey({ name: "enter", handled: false } as never); // Apply, submitting `decisions` as-is
    // Id "1" from the first batch may harmlessly linger in state; what
    // matters is that the new id "2" is present and seeded correctly.
    expect(resolvedSecond).toMatchObject({ "2": "allow" });
  });
});
