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

  test("clicking a flat action button (not just its key shortcut) reports its id", async () => {
    const ids: string[] = [];
    const t = await mountApp(
      <ApprovalPrompt id="ap" prompt="Allow?" onAction={(id) => ids.push(id)} />,
      OPTS,
    );
    await t.settle();
    const allText = (w: Widget): string => {
      let s = w.getTextContent?.() ?? "";
      for (const c of w.children) s += allText(c as Widget);
      return s;
    };
    let allowBtn: Widget | undefined;
    t.screen.walk((n) => {
      if ((n as Widget).onClick && allText(n as Widget).includes("Allow")) allowBtn = n as Widget;
    });
    (allowBtn as Widget).onClick?.({} as never);
    expect(ids).toEqual(["allow"]);
  });

  test("falls back to `ev.key` when a raw event carries no `.name`", async () => {
    const ids: string[] = [];
    const t = await mountApp(
      <ApprovalPrompt id="ap" prompt="Allow?" onAction={(id) => ids.push(id)} />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;
    root.handleKey({ key: "a", handled: false } as never); // Allow, via `.key` not `.name`
    expect(ids).toEqual(["allow"]);
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

  test("an action without a single-char key renders with no (key) suffix, and bordered={false} drops the border", async () => {
    const t = await mountApp(
      <ApprovalPrompt
        prompt="Allow?"
        bordered={false}
        actions={[
          { id: "yes", label: "Yes", icon: "✓" }, // no `key` at all
          { id: "later", label: "Later", key: "esc" }, // multi-char key
        ]}
        onAction={() => {}}
      />,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("✓ Yes");
    expect(text).not.toContain("Yes (");
    expect(text).toContain("Later");
    expect(text).not.toContain("Later (");
  });

  test("Esc is a no-op in single mode when the actions have no `deny` id", async () => {
    const ids: string[] = [];
    const t = await mountApp(
      <ApprovalPrompt
        id="ap"
        prompt="Pick one"
        actions={[{ id: "yes", label: "Yes", key: "y" }]}
        onAction={(id) => ids.push(id)}
      />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;
    root.handleKey({ name: "escape", handled: false } as never);
    expect(ids).toEqual([]);
  });

  test("submitting an empty field cancels without reporting anything", async () => {
    const reported: Array<[string, string | undefined]> = [];
    const t = await mountApp(
      <ApprovalPrompt
        id="ap"
        prompt="Allow?"
        actions={[
          { id: "allow", label: "Allow", key: "a" },
          { id: "custom", label: "Custom…", key: "c", input: true },
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
    input.handleKey({ name: "enter", handled: false } as never); // nothing typed
    await t.settle();
    expect(findInput(t.app)).toBeUndefined(); // field closed
    expect(reported).toEqual([]);
  });

  test("onKey ignores already-handled events and events while the input field is open", async () => {
    const ids: string[] = [];
    const t = await mountApp(
      <ApprovalPrompt
        id="ap"
        prompt="Allow?"
        actions={[
          { id: "allow", label: "Allow", key: "a" },
          { id: "custom", label: "Custom…", key: "c", input: true },
        ]}
        onAction={(id) => ids.push(id)}
      />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;

    // Already handled elsewhere -> ignored even though "a" matches an action.
    root.handleKey({ name: "a", handled: true } as never);
    expect(ids).toEqual([]);

    // Open the inline field, then a shortcut key reaching the root must be ignored.
    root.handleKey({ name: "c", handled: false } as never);
    await t.settle();
    root.handleKey({ name: "a", handled: false } as never);
    expect(ids).toEqual([]);
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

  test("clicking a row toggles its own decision (and calls without args render without a preview)", async () => {
    let resolved: Record<string, string> | null = null;
    const noArgsCalls = [
      { id: "1", name: "Read" }, // no `args`
      { id: "2", name: "Bash", args: "npm test" },
    ];
    const t = await mountApp(
      <ApprovalPrompt
        id="ap"
        prompt="Run:"
        calls={noArgsCalls}
        onResolve={(d) => (resolved = d)}
      />,
      OPTS,
    );
    await t.settle();
    const allText = (w: Widget): string => {
      let s = w.getTextContent?.() ?? "";
      for (const c of w.children) s += allText(c as Widget);
      return s;
    };
    let row: Widget | undefined;
    t.screen.walk((n) => {
      if ((n as Widget).onClick && allText(n as Widget).includes("Read")) row = n as Widget;
    });
    (row as Widget).onClick?.({} as never);
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;
    root.handleKey({ name: "enter", handled: false } as never); // Apply
    expect(resolved).toEqual({ "1": "deny", "2": "allow" }); // row 1 flipped from its default allow
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

  test("a call without `matches` falls back to grouping by its tool name", async () => {
    const noMatches = [
      { id: "1", name: "Read", args: "a.ts", defaultDecision: "deny" as const }, // no `matches`
    ];
    let resolved: Record<string, string> | null = null;
    const t = await mountApp(
      <ApprovalPrompt id="ap" prompt="Run:" calls={noMatches} onResolve={(d) => (resolved = d)} />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;
    root.handleKey({ name: "m", handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("all Read"); // grouped by name, since no `matches` given
    const list = findMenuList(t.app) as MenuListWidget;
    list.handleKey({ name: "enter", handled: false } as never); // choose it
    await t.settle();
    root.handleKey({ name: "enter", handled: false } as never); // Apply
    expect(resolved).toEqual({ "1": "allow" });
  });

  test("a match pattern containing a space is shown verbatim (not grouped)", async () => {
    const spacedCalls = [
      { id: "1", name: "Bash", args: "git commit -m x", matches: ["git commit -m x"] },
    ];
    const t = await mountApp(
      <ApprovalPrompt id="ap" prompt="Run:" calls={spacedCalls} onResolve={() => {}} />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;
    root.handleKey({ name: "m", handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("git commit -m x");
    expect(t.text()).not.toContain("all git commit -m x");
  });

  test("Allow matching's custom… glob allows every call whose args match the typed pattern", async () => {
    const shellCalls = [
      { id: "1", name: "Bash", args: "rm -rf build", defaultDecision: "deny" as const },
      { id: "2", name: "Bash", args: "rm -rf dist", defaultDecision: "deny" as const },
      { id: "3", name: "Bash", args: "ls", defaultDecision: "deny" as const },
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
    root.handleKey({ name: "m", handled: false } as never); // open Allow matching
    await t.settle();
    // The union of patterns for these calls is just ["Bash"]; "custom…" is last.
    const list = findMenuList(t.app) as MenuListWidget;
    list.handleKey({ name: "up", handled: false } as never); // wrap to the last row: "custom…"
    list.handleKey({ name: "enter", handled: false } as never);
    await t.settle();
    const input = findInput(t.app) as InputWidget;
    for (const ch of "rm -rf *") input.handleKey({ key: ch, handled: false } as never);
    input.handleKey({ name: "enter", handled: false } as never);
    await t.settle();
    expect(matched).toEqual(["rm -rf *"]);
    root.handleKey({ name: "enter", handled: false } as never); // Apply
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

  test("a different action's hotkey while a submenu is open is ignored, not fired behind an orphaned menu", async () => {
    // Regression: activate() opens the "Allow matching" ContextMenu and sets
    // `openMenu`, but onKey only guarded on `inputAction`. Pressing "d" (Deny
    // all) while the submenu was open fired the top-level action via
    // onResolve without ever closing the menu, so a host that keeps the
    // ApprovalPrompt mounted after a decision (e.g. a batch-approval log)
    // was left with an orphaned ContextMenu overlay and a decision resolved
    // "behind" it. The hotkey must be a no-op while the submenu is open —
    // same as while the inline input field is open.
    let resolved: Record<string, string> | null = null;
    const t = await mountApp(
      <ApprovalPrompt id="ap" prompt="Run:" calls={calls} onResolve={(d) => (resolved = d)} />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;

    root.handleKey({ name: "m", handled: false } as never); // open "Allow matching"
    await t.settle();
    expect(findMenuList(t.app)).toBeDefined();

    root.handleKey({ name: "d", handled: false } as never); // Deny all, while submenu open
    await t.settle();

    expect(findMenuList(t.app)).toBeDefined(); // submenu still open, not orphaned mid-close
    expect(resolved).toBeNull(); // and the unrelated hotkey never fired
  });

  test("Escape still denies (and closes the menu) while a submenu is open", async () => {
    // Regression: guarding onKey's whole body on `openMenu` (to fix the test
    // above) also swallowed denyOnEscape — Escape while a submenu was open
    // no longer denied at all, only the ContextMenu's own layer closed it,
    // requiring a second Escape press. Escape must still work as a universal
    // "get me out of here" key even with a submenu open, unlike other
    // top-level action hotkeys.
    let resolved: Record<string, string> | null = null;
    const t = await mountApp(
      <ApprovalPrompt id="ap" prompt="Run:" calls={calls} onResolve={(d) => (resolved = d)} />,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("ap") as Widget;

    root.handleKey({ name: "m", handled: false } as never); // open "Allow matching"
    await t.settle();
    expect(findMenuList(t.app)).toBeDefined();

    root.handleKey({ name: "escape", handled: false } as never);
    await t.settle();

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
