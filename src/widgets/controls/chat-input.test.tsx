import { describe, expect, test } from "vitest";
import { Button, ChatInput, formatChatHints, VBox } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";
import type { Trigger } from "./chat/types.ts";
import type { ChatInputWidget } from "./chat-input.ts";

type Mounted = Awaited<ReturnType<typeof mountApp>>;

/** Build a normalized KeyEvent and dispatch it straight to the focused widget. */
function key(
  w: ChatInputWidget,
  spec: string,
  opts: { shift?: boolean; ctrl?: boolean } = {},
): void {
  const name = spec.includes("+") ? spec.split("+").pop()! : spec;
  w.handleKey({
    key: spec,
    name,
    ctrl: spec.startsWith("ctrl+") || !!opts.ctrl,
    meta: spec.startsWith("meta+"),
    shift: spec.startsWith("shift+") || !!opts.shift,
  });
}
function type(w: ChatInputWidget, text: string): void {
  for (const ch of text) key(w, ch);
}
const tabEv = (shift = false) => ({ key: "tab", name: "tab", ctrl: false, meta: false, shift });
function mouse(w: ChatInputWidget, x: number, y: number, type = "press"): void {
  (w as unknown as { handleMouse: (e: unknown) => void }).handleMouse({
    x,
    y,
    type,
    button: "left",
  });
}
/** The widget's content rectangle (drawable area inside the border). */
function content(w: ChatInputWidget): { x: number; y: number; right: number; bottom: number } {
  return (w as unknown as { getContentRect: () => any }).getContentRect();
}

async function mountChat(props: Record<string, unknown>, opts = { cols: 44, rows: 10 }) {
  const t = (await mountApp(<ChatInput id="chat" {...props} />, opts)) as Mounted;
  await t.settle();
  const w = t.findById("chat") as unknown as ChatInputWidget;
  t.screen.focusWidget(w as any);
  return { t, w };
}

describe("ChatInput", () => {
  test("Enter submits; Shift+Enter inserts a newline", async () => {
    let submitted: string | null = null;
    const { t, w } = await mountChat({ onSubmit: (v: string) => (submitted = v) });
    type(w, "hello");
    key(w, "enter", { shift: true }); // newline
    type(w, "world");
    expect(submitted).toBeNull();
    key(w, "enter"); // submit
    await t.settle();
    expect(submitted).toBe("hello\nworld");
  });

  test("Ctrl+J and Ctrl+Enter insert a newline without submitting", async () => {
    let submitted: string | null = null;
    let value = "";
    const { w } = await mountChat({
      onSubmit: (v: string) => (submitted = v),
      onChange: (v: string) => (value = v),
    });
    type(w, "a");
    key(w, "ctrl+j"); // literal LF newline (reliable on every terminal)
    type(w, "b");
    key(w, "enter", { ctrl: true }); // Ctrl+Enter newline
    type(w, "c");
    expect(submitted).toBeNull();
    expect(value).toBe("a\nb\nc");
  });

  test("a trailing backslash + Enter is a line continuation (not a send)", async () => {
    let submitted: string | null = null;
    let value = "";
    const { w } = await mountChat({
      onSubmit: (v: string) => (submitted = v),
      onChange: (v: string) => (value = v),
    });
    type(w, "one\\"); // ends with a backslash
    key(w, "enter"); // continuation: drop "\", add newline
    type(w, "two");
    expect(submitted).toBeNull();
    expect(value).toBe("one\ntwo");
    key(w, "enter"); // now sends
    expect(submitted).toBe("one\ntwo");
  });

  test("modifier-enter mode: plain Enter makes a newline, Shift+Enter sends", async () => {
    let submitted: string | null = null;
    const { w } = await mountChat({
      submitMode: "modifier-enter",
      onSubmit: (v: string) => (submitted = v),
    });
    type(w, "x");
    key(w, "enter"); // newline in this mode
    type(w, "y");
    expect(submitted).toBeNull();
    key(w, "enter", { shift: true }); // sends
    expect(submitted).toBe("x\ny");
  });

  test("busy state: Esc fires onInterrupt and the stop glyph renders", async () => {
    let interrupted = false;
    const { t } = await mountChat({ busy: true, onInterrupt: () => (interrupted = true) });
    expect(t.text()).toContain("■");
    const w = t.findById("chat") as unknown as ChatInputWidget;
    key(w, "escape");
    expect(interrupted).toBe(true);
  });

  test("send glyph appears once there is content", async () => {
    const { t, w } = await mountChat({});
    expect(t.text()).not.toContain("⏎");
    type(w, "hi");
    await t.settle();
    expect(t.text()).toContain("⏎");
  });

  test("undo reverts a typed run (Ctrl+Z)", async () => {
    let value = "";
    const { w } = await mountChat({ onChange: (v: string) => (value = v) });
    type(w, "abc");
    expect(value).toBe("abc");
    key(w, "ctrl+z");
    expect(value).toBe("");
  });

  test("history recall with Up/Down at the edge row", async () => {
    let value = "";
    const { w } = await mountChat({
      getHistory: () => ["first", "second"],
      onChange: (v: string) => (value = v),
    });
    key(w, "up");
    expect(value).toBe("second");
    key(w, "up");
    expect(value).toBe("first");
    key(w, "down");
    expect(value).toBe("second");
  });

  test("history only recalls at the buffer start (Up), not mid-edit", async () => {
    let value = "";
    const { w } = await mountChat({
      getHistory: () => ["older", "newer"],
      onChange: (v: string) => (value = v),
    });
    type(w, "line1");
    key(w, "ctrl+j"); // newline
    type(w, "line2"); // caret at very end, on the last row
    // Up from the bottom row (caret not at start) → moves the caret up a row,
    // does NOT recall history.
    key(w, "up");
    expect(value).toBe("line1\nline2");
    // Up again: now on the top row but caret mid-line → moves to buffer start.
    key(w, "up");
    expect(value).toBe("line1\nline2");
    // Up once more: caret is at position 0 → now history recalls.
    key(w, "up");
    expect(value).toBe("newer");
    // Browsing continues regardless of caret position.
    key(w, "up");
    expect(value).toBe("older");
  });

  test("a trigger opens a completion popup and accepts a chip (host serialized)", async () => {
    const trigger: Trigger = {
      char: "@",
      getCompletions: () => [{ label: "auth.ts" }, { label: "main.rs" }],
      onAccept: (c) => ({ kind: "chip", token: { label: c.label, kind: "file" } }),
    };
    let submitted = "";
    const { t, w } = await mountChat({
      triggers: [trigger],
      onSubmit: (v: string) => (submitted = v),
      serialize: (tok: { label: string }) => `<${tok.label}>`,
    });
    type(w, "see @au");
    await t.settle();
    expect(t.text()).toContain("auth.ts"); // popup row visible
    key(w, "enter"); // accept the chip
    await t.settle();
    key(w, "enter"); // submit
    await t.settle();
    expect(submitted).toBe("see <auth.ts>");
  });

  test("a slash command trigger fires onCommand", async () => {
    const trigger: Trigger = {
      char: "/",
      atLineStart: true,
      getCompletions: () => [{ label: "clear" }],
      onAccept: (c) => ({ kind: "command", name: c.label }),
    };
    let cmd = "";
    const { t, w } = await mountChat({ triggers: [trigger], onCommand: (n: string) => (cmd = n) });
    type(w, "/cl");
    await t.settle();
    key(w, "enter");
    await t.settle();
    expect(cmd).toBe("clear");
  });

  test("accepting a text completion is a single atomic undo step", async () => {
    // Regression: acceptCompletion's "text" case deleted the typed query and
    // inserted the result as two separate buffer mutations, each pushing its
    // own "structural" undo entry — one Ctrl+Z only undid the insert, leaving
    // the deleted query gone; a second Ctrl+Z was needed to fully revert.
    const trigger: Trigger = {
      char: "/",
      atLineStart: true,
      getCompletions: () => [{ label: "help" }],
      onAccept: (c) => ({ kind: "text", value: `[${c.label}]` }),
    };
    const { t, w } = await mountChat({ triggers: [trigger] });
    type(w, "/he");
    await t.settle();
    key(w, "enter"); // accept the "text" completion
    await t.settle();
    expect(w.value).toBe("[help]");
    key(w, "ctrl+z");
    await t.settle();
    expect(w.value).toBe("/he"); // one undo fully reverts the accept
  });

  test("ghost-text suggestion renders and Right accepts it at EOL", async () => {
    let value = "";
    const { t, w } = await mountChat({
      suggestionProvider: ({ value }: { value: string }) => (value === "co" ? "mplete" : null),
      onChange: (v: string) => (value = v),
    });
    type(w, "co");
    await t.settle();
    expect(t.text()).toContain("mplete");
    key(w, "right");
    await t.settle();
    expect(value).toBe("complete");
  });

  test('acceptSuggestionKey="tab": Tab accepts the ghost text, then a second Tab moves focus', async () => {
    let value = "";
    const { t, w } = await mountChat({
      acceptSuggestionKey: "tab",
      suggestionProvider: ({ value }: { value: string }) => (value === "co" ? "mplete" : null),
      onChange: (v: string) => (value = v),
    });
    type(w, "co");
    await t.settle();
    // A suggestion is showing → the widget claims Tab (the app dispatches it here
    // instead of moving focus) and accepts the ghost text. Shift+Tab, however,
    // always navigates backward, so the widget must not claim it.
    expect(w.wantsTab(tabEv())).toBe(true);
    expect(w.wantsTab(tabEv(true))).toBe(false);
    key(w, "tab");
    expect(value).toBe("complete");
    // Nothing left to accept → the widget no longer claims Tab, so the app's
    // focus traversal handles the next Tab.
    expect(w.wantsTab(tabEv())).toBe(false);
  });

  test("with an open completion popup the widget claims Tab (to accept), not focus", async () => {
    const trigger: Trigger = {
      char: "@",
      getCompletions: () => [{ label: "auth.ts" }],
      onAccept: (c) => ({ kind: "chip", token: { label: c.label } }),
    };
    const { t, w } = await mountChat({ triggers: [trigger] });
    type(w, "@au");
    await t.settle();
    expect(w.wantsTab(tabEv())).toBe(true); // popup open
    key(w, "tab"); // accept the completion
    await t.settle();
    expect(w.value).toBe("auth.ts");
    expect(w.wantsTab(tabEv())).toBe(false); // popup closed → Tab navigates again
  });

  test("attachments render in the strip and ride along with onSubmit", async () => {
    let payload: { id: string }[] = [];
    const { t, w } = await mountChat({
      onSubmit: (_v: string, a: { id: string }[]) => (payload = a),
    });
    w.addAttachment({ id: "img1", label: "screenshot.png", kind: "image" });
    await t.settle();
    expect(t.text()).toContain("screenshot.png");
    expect(t.text()).toContain("✕");
    type(w, "look at this");
    key(w, "enter");
    await t.settle();
    expect(payload.map((a) => a.id)).toEqual(["img1"]);
  });

  test("arrow keys, Home/End, and Delete edit at the right position", async () => {
    let value = "";
    const { w } = await mountChat({ onChange: (v: string) => (value = v) });
    type(w, "abc");
    key(w, "left");
    key(w, "left"); // caret between a and b
    type(w, "X");
    expect(value).toBe("aXbc");
    key(w, "home");
    key(w, "delete"); // delete "a"
    expect(value).toBe("Xbc");
    key(w, "end");
    type(w, "Z");
    expect(value).toBe("XbcZ");
    key(w, "right"); // no-op at end
  });

  test("Up/Down move the caret between text rows when not at the edge", async () => {
    let value = "";
    const { w } = await mountChat({ onChange: (v: string) => (value = v) });
    type(w, "aa");
    key(w, "ctrl+j"); // newline
    type(w, "bb");
    key(w, "up"); // to first row — no history provider, so caret moves up
    type(w, "X"); // inserts on the first row
    expect(value).toBe("aaX\nbb");
  });

  // Clipboard keys (Ctrl+C/Ctrl+Shift+C/Ctrl+X/Ctrl+A) are routed by the App to
  // these ClipboardWidget methods — the same contract as Input and TextArea — so
  // the unit test exercises the methods directly, like the other two widgets do.
  test("selection clipboard: copySelection / cutSelection / selectAll", async () => {
    const { t, w } = await mountChat({});
    type(w, "copyme");
    w.selectAll();
    expect(w.copySelection()).toBe("copyme");
    expect(await t.driver.clipboard.get()).toBe("copyme");
    w.selectAll();
    expect(w.cutSelection()).toBe("copyme");
    expect(w.value).toBe("");
    expect(await t.driver.clipboard.get()).toBe("copyme");
  });

  test("copySelection is null with no selection, so a bare Ctrl+C bubbles up to quit", async () => {
    const { w } = await mountChat({});
    type(w, "hi");
    expect(w.hasSelection()).toBe(false);
    expect(w.copySelection()).toBeNull();
    expect(w.cutSelection()).toBeNull();
  });

  test("mouse drag selects text and release copies it", async () => {
    const { t, w } = await mountChat({});
    type(w, "hello");
    await t.settle();
    const c = content(w);
    mouse(w, c.x, c.y, "press"); // anchor at column 0
    mouse(w, c.x + 3, c.y, "drag"); // extend over "hel"
    expect(w.hasSelection()).toBe(true);
    mouse(w, c.x + 3, c.y, "release"); // drag-release copies
    expect(await t.driver.clipboard.get()).toBe("hel");
  });

  test("a plain click (press+release, no drag) places the caret without selecting", async () => {
    const { t, w } = await mountChat({});
    type(w, "hello");
    await t.settle();
    const c = content(w);
    mouse(w, c.x + 2, c.y, "press");
    mouse(w, c.x + 2, c.y, "release");
    expect(w.hasSelection()).toBe(false);
    type(w, "X"); // inserts at the clicked caret (after "he")
    expect(w.value).toBe("heXllo");
  });

  test("imperative API: clear / insertText / appendStreaming / undo / redo", async () => {
    let value = "";
    const { w } = await mountChat({ onChange: (v: string) => (value = v) });
    w.insertText("hello");
    expect(value).toBe("hello");
    w.appendStreaming(" world");
    expect(value).toBe("hello world");
    w.clear();
    expect(value).toBe("");
    type(w, "redoable");
    w.undo();
    expect(w.value).toBe("");
    w.redo();
    expect(w.value).toBe("redoable");
  });

  test("controlled value prop sets the buffer without looping onChange", async () => {
    let changes = 0;
    const t = await mountApp(<ChatInput id="c" value="seed" onChange={() => changes++} />, {
      cols: 30,
      rows: 6,
    });
    await t.settle();
    const w = t.findById("c") as unknown as ChatInputWidget;
    expect(w.value).toBe("seed");
    expect(changes).toBe(0); // controlled set does not emit
  });

  test("a command keybinding fires onCommand and runs its handler", async () => {
    let ran = false;
    let named = "";
    const { w } = await mountChat({
      commands: [
        {
          name: "clear",
          key: "ctrl+l",
          run: () => {
            ran = true;
          },
        },
      ],
      onCommand: (n: string) => (named = n),
    });
    key(w, "ctrl+l");
    expect(ran).toBe(true);
    expect(named).toBe("clear");
  });

  test("popup: Down/Up move selection, Escape dismisses", async () => {
    const trigger: Trigger = {
      char: "@",
      getCompletions: () => [{ label: "auth.ts" }, { label: "main.rs" }],
      onAccept: (c) => ({ kind: "chip", token: { label: c.label } }),
    };
    const { t, w } = await mountChat({ triggers: [trigger] });
    type(w, "@");
    await t.settle();
    expect(t.text()).toContain("auth.ts");
    key(w, "down"); // select main.rs
    key(w, "enter"); // accept it
    await t.settle();
    expect(w.value).toBe("main.rs");
    // Open again then dismiss with Escape.
    type(w, " @a");
    await t.settle();
    expect(t.text()).toContain("auth.ts");
    key(w, "escape");
    await t.settle();
    expect(t.text()).not.toContain("auth.ts");
  });

  test("bracket chip style renders guillemet delimiters", async () => {
    const trigger: Trigger = {
      char: "@",
      getCompletions: () => [{ label: "auth.ts" }],
      onAccept: (c) => ({ kind: "chip", token: { label: c.label } }),
    };
    const { t, w } = await mountChat({ triggers: [trigger], chipStyle: "bracket" });
    type(w, "@au");
    await t.settle();
    key(w, "enter");
    await t.settle();
    expect(t.text()).toContain("‹auth.ts›");
  });

  test("clicking the send glyph submits; clicking text places the caret", async () => {
    let submitted: string | null = null;
    const { t, w } = await mountChat({ onSubmit: (v: string) => (submitted = v) });
    type(w, "abc");
    await t.settle();
    const c = content(w);
    // Click at column 0 of the first text row → caret to start; typing prepends.
    mouse(w, c.x, c.y);
    type(w, "Z");
    expect(w.value).toBe("Zabc");
    // Click the send glyph: right column, on the message's last line (row 0 here).
    mouse(w, c.right - 1, c.y);
    await t.settle();
    expect(submitted).toBe("Zabc");
  });

  test("clicking an attachment's ✕ removes it", async () => {
    let removed = "";
    const { t, w } = await mountChat({ onAttachRemove: (id: string) => (removed = id) });
    w.addAttachment({ id: "a1", label: "pic.png" });
    await t.settle();
    const c = content(w);
    // The ✕ sits just after " pic.png " on the strip row (content top).
    const x = c.x + " pic.png ".length;
    mouse(w, x, c.y);
    expect(removed).toBe("a1");
  });

  test("a typed chip is removed whole by one backspace", async () => {
    const trigger: Trigger = {
      char: "@",
      getCompletions: () => [{ label: "auth.ts" }],
      onAccept: (c) => ({ kind: "chip", token: { label: c.label } }),
    };
    let value = "";
    const { t, w } = await mountChat({ triggers: [trigger], onChange: (v: string) => (value = v) });
    type(w, "@au");
    await t.settle();
    key(w, "enter"); // accept chip
    await t.settle();
    expect(value).toBe("auth.ts");
    key(w, "backspace"); // remove the whole chip
    expect(value).toBe("");
  });
});

describe("ChatInput contextual hints", () => {
  const labels = (w: ChatInputWidget) =>
    (w as unknown as { getHints: () => Array<{ label: string }> }).getHints().map((h) => h.label);

  test("default set advertises send/newline/history/completions and keyed commands", async () => {
    const trig: Trigger = {
      char: "@",
      getCompletions: () => [],
      onAccept: () => ({ kind: "dismiss" }),
    };
    const { w } = await mountChat({
      getHistory: () => ["a"],
      triggers: [trig],
      commands: [{ name: "palette", label: "palette", key: "ctrl+k" }],
    });
    expect(labels(w)).toEqual(["send", "newline", "history", "completions", "palette"]);
  });

  test("history hint shows only on a pristine composer (tracks first input, not length)", async () => {
    const { t, w } = await mountChat({ getHistory: () => ["earlier"] });
    expect(labels(w)).toContain("history"); // pristine
    type(w, "x");
    expect(labels(w)).not.toContain("history"); // dirtied
    key(w, "backspace"); // back to empty, but still dirty for this turn
    expect(w.value).toBe("");
    expect(labels(w)).not.toContain("history");
    // Submitting starts a fresh turn → pristine again.
    type(w, "send me");
    key(w, "enter");
    await t.settle();
    expect(labels(w)).toContain("history");
  });

  test("busy shows interrupt", async () => {
    const { w } = await mountChat({ busy: true });
    expect(labels(w)).toContain("interrupt");
    expect(labels(w)).not.toContain("send");
  });

  test("a selection swaps in copy/cut", async () => {
    const { w } = await mountChat({});
    type(w, "hello");
    key(w, "home", { shift: true });
    expect(labels(w)).toEqual(expect.arrayContaining(["copy", "cut"]));
  });

  test("formatChatHints renders theme-coloured markup (keys vs labels vs separator)", () => {
    const mk = formatChatHints([
      { keys: "⏎", label: "send" },
      { keys: "^j", label: "newline" },
    ]);
    expect(mk).toBe("[$accent]⏎[/] send[$dimmed] │ [/][$accent]^j[/] newline");
    // Custom styling + markup metacharacters in keys are escaped.
    const custom = formatChatHints([{ keys: "[", label: "x" }], {
      keyStyle: "cyan",
      labelStyle: "dim",
      sepStyle: undefined,
    });
    expect(custom).toBe("[cyan]\\[[/] [dim]x[/]");
  });

  test("extraHints are appended", async () => {
    const { w } = await mountChat({ extraHints: [{ keys: "^q", label: "quit" }] });
    expect(labels(w)).toContain("quit");
  });

  test("onHintsChange fires once per transition, not per keystroke", async () => {
    const sets: string[][] = [];
    const { t, w } = await mountChat({
      onHintsChange: (h: Array<{ label: string }>) => sets.push(h.map((x) => x.label)),
    });
    sets.length = 0;
    type(w, "hi"); // both keystrokes keep the same (default) hint set
    await t.settle();
    expect(sets.length).toBe(0);
    key(w, "home", { shift: true }); // now there's a selection → one emit
    await t.settle();
    expect(sets.length).toBe(1);
    expect(sets[0]).toEqual(expect.arrayContaining(["copy", "cut"]));
  });
});

describe("ChatInput async completion/suggestion races", () => {
  test("a stale completion result is dropped when a newer query supersedes it", async () => {
    // Hand back manually-controlled promises so we can resolve the *older*
    // query after the newer one and prove the req-id guard ignores it.
    const resolvers: Array<(items: Array<{ label: string }>) => void> = [];
    const trigger: Trigger = {
      char: "@",
      getCompletions: () => new Promise((res) => resolvers.push(res)),
      onAccept: (c) => ({ kind: "chip", token: { label: c.label } }),
    };
    const { t, w } = await mountChat({ triggers: [trigger] });
    type(w, "@ab"); // three keystrokes → three in-flight completion requests
    const latest = resolvers.length - 1;
    resolvers[latest]([{ label: "newer.ts" }]); // newest resolves first
    await t.settle();
    expect(t.text()).toContain("newer.ts");
    resolvers[0]([{ label: "stale.ts" }]); // an older request lands late
    await t.settle();
    expect(t.text()).toContain("newer.ts");
    expect(t.text()).not.toContain("stale.ts");
  });

  test("a stale ghost suggestion is dropped when a newer keystroke supersedes it", async () => {
    const resolvers: Array<(s: string | null) => void> = [];
    const { t, w } = await mountChat({
      suggestionProvider: () => new Promise((res) => resolvers.push(res)),
    });
    type(w, "ab"); // two requests; caret stays at the buffer end
    resolvers[resolvers.length - 1]("-newer"); // newest first
    await t.settle();
    expect(t.text()).toContain("-newer");
    resolvers[0]("-stale"); // older request resolves late → must be ignored
    await t.settle();
    expect(t.text()).not.toContain("-stale");
  });

  test("a completion resolving after its trigger text is deleted does not reopen the popup", async () => {
    const resolvers: Array<(items: Array<{ label: string }>) => void> = [];
    const trigger: Trigger = {
      char: "@",
      getCompletions: () => new Promise((res) => resolvers.push(res)),
      onAccept: (c) => ({ kind: "chip", token: { label: c.label } }),
    };
    const { t, w } = await mountChat({ triggers: [trigger] });
    type(w, "@a"); // in-flight completion request for "@a"
    key(w, "backspace");
    key(w, "backspace"); // trigger text fully deleted before the request resolves
    await t.settle();
    resolvers[resolvers.length - 1]([{ label: "auth.ts" }]); // late arrival
    await t.settle();
    expect(t.text()).not.toContain("auth.ts");
  });
});

describe("ChatInput wrapping, scrolling, history-edge", () => {
  const layout = (w: ChatInputWidget) => {
    const ww = w as unknown as { layoutRows: (n: number) => unknown[]; innerWidth: () => number };
    return ww.layoutRows(ww.innerWidth());
  };

  // The test screen stretches a *root* widget to full size, which would defeat a
  // fixed-width/height box; wrap in a VBox so the composer's own dimensions hold.
  async function mountBoxed(props: Record<string, unknown>) {
    const t = (await mountApp(
      <VBox>
        <ChatInput id="chat" {...props} />
      </VBox>,
    )) as Mounted;
    await t.settle();
    const w = t.findById("chat") as unknown as ChatInputWidget;
    t.screen.focusWidget(w as any);
    return { t, w };
  }

  test("soft-wraps a long line into multiple visual rows", async () => {
    // inner ≈ 20 − 2 border − 1 gutter = 17, so a 36-char run must wrap.
    const { t, w } = await mountBoxed({ softWrap: true, style: { width: 20 } });
    type(w, "abcdefghijklmnopqrstuvwxyz0123456789");
    await t.settle();
    expect(layout(w).length).toBeGreaterThan(1);
  });

  test("scrolls vertically once content exceeds the visible height, keeping the caret in view", async () => {
    // height 5 → 2 border + 3 visible text rows.
    const { t, w } = await mountBoxed({ style: { width: 30, height: 5 } });
    for (let i = 0; i < 6; i++) {
      type(w, `line${i}`);
      key(w, "ctrl+j");
    }
    await t.settle();
    // Caret is on the last row, well past the 3 visible rows → the view scrolled.
    expect((w as unknown as { scrollRow: number }).scrollRow).toBeGreaterThan(0);
  });

  test('historyEdge "row" recalls from anywhere on the first row (not just the buffer start)', async () => {
    let value = "";
    const { w } = await mountChat({
      historyEdge: "row",
      getHistory: () => ["past"],
      onChange: (v: string) => (value = v),
    });
    type(w, "ab");
    key(w, "left"); // caret mid-line on the first (and last) row — not at index 0
    key(w, "up"); // "row" mode recalls here; "bump" would only move the caret
    expect(value).toBe("past");
  });
});

describe("ChatInput selected-chip rendering", () => {
  test("a selected chip tints its chrome with the selection background", async () => {
    const trigger: Trigger = {
      char: "@",
      getCompletions: () => [{ label: "auth.ts" }],
      onAccept: (c) => ({ kind: "chip", token: { label: c.label } }),
    };
    const { t, w } = await mountChat({ triggers: [trigger] });
    type(w, "@au");
    await t.settle();
    key(w, "enter"); // accept → chip "auth.ts" (1 pad + 7 label + 1 pad = 9 cells)
    await t.settle();
    type(w, "x"); // a plain text atom right after the chip
    w.selectAll(); // Ctrl+A is app-routed to selectAll()
    await t.settle();
    const c = content(w);
    const chipLabelBg = t.cellAt(c.x + 1, c.y).style.background; // inside the pill
    const textBg = t.cellAt(c.x + 9, c.y).style.background; // the selected "x"
    // The selected chip now shares the selection background with selected text.
    expect(chipLabelBg).toBe(textBg);
  });
});

describe("ChatInput Tab routing through the app", () => {
  async function mountWithNeighbor(props: Record<string, unknown> = {}) {
    const t = (await mountApp(
      <VBox>
        <ChatInput id="chat" {...props} />
        <Button id="btn">Go</Button>
      </VBox>,
      { cols: 40, rows: 12 },
    )) as Mounted;
    await t.settle();
    const w = t.findById("chat") as unknown as ChatInputWidget;
    return { t, w };
  }

  test("a pristine composer lets Tab move focus to the next widget", async () => {
    const { t, w } = await mountWithNeighbor();
    t.screen.focusWidget(w as any);
    t.driver.simulateKey("tab", "tab");
    await t.settle();
    expect(t.screen.focusedWidget?.id).toBe("btn");
  });

  test("with an open popup the app routes Tab into the widget (accept), not focus", async () => {
    const trigger: Trigger = {
      char: "@",
      getCompletions: () => [{ label: "auth.ts" }],
      onAccept: (c) => ({ kind: "chip", token: { label: c.label } }),
    };
    const { t, w } = await mountWithNeighbor({ triggers: [trigger] });
    t.screen.focusWidget(w as any);
    type(w, "@au");
    await t.settle();
    t.driver.simulateKey("tab", "tab"); // app-level dispatch
    await t.settle();
    expect(w.value).toBe("auth.ts"); // completion accepted
    expect(t.screen.focusedWidget?.id).toBe("chat"); // focus did not move
    // Now there's nothing to claim → Tab navigates away.
    t.driver.simulateKey("tab", "tab");
    await t.settle();
    expect(t.screen.focusedWidget?.id).toBe("btn");
  });

  test("Shift+Tab always navigates, even with a popup open", async () => {
    const trigger: Trigger = {
      char: "@",
      getCompletions: () => [{ label: "auth.ts" }],
      onAccept: (c) => ({ kind: "chip", token: { label: c.label } }),
    };
    const { t, w } = await mountWithNeighbor({ triggers: [trigger] });
    t.screen.focusWidget(w as any);
    type(w, "@au");
    await t.settle();
    t.driver.simulateKey("tab", "tab", false, true); // Shift+Tab
    await t.settle();
    expect(w.value).toBe("@au"); // not accepted
    expect(t.screen.focusedWidget?.id).not.toBe("chat"); // focus moved
  });

  test("a mouse click focuses the chat input (like Input/TextArea)", async () => {
    const { t, w } = await mountWithNeighbor();
    t.screen.focusWidget(t.findById("btn") as any);
    expect(t.screen.focusedWidget?.id).toBe("btn");
    // A left press inside the composer must focus it — the caret-placement press
    // is left unhandled so the App's focus-on-click runs.
    const c = content(w);
    t.driver.simulateMouse(c.x, c.y, "press", "left");
    await t.settle();
    expect(t.screen.focusedWidget?.id).toBe("chat");
  });
});
