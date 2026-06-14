import { describe, expect, test } from "vitest";
import { ChatInput } from "../../react.ts";
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

  test("select-all + Ctrl+C copies; Ctrl+X cuts", async () => {
    const { t, w } = await mountChat({});
    type(w, "copyme");
    key(w, "ctrl+a");
    key(w, "ctrl+c");
    expect(await t.driver.clipboard.get()).toBe("copyme");
    key(w, "ctrl+a");
    key(w, "ctrl+x");
    expect(w.value).toBe("");
    expect(await t.driver.clipboard.get()).toBe("copyme");
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
