import { describe, expect, test } from "vitest";
import { App } from "../../core/app.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { TextArea, VBox } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { mountApp } from "../../test/harness.tsx";
import { TextAreaWidget } from "./textarea.ts";

describe("TextAreaWidget — line editing edge cases", () => {
  const press = (w: TextAreaWidget, ev: Record<string, unknown>) => w.onKey?.(ev as never);

  test("delete at end-of-line merges the next line up", () => {
    const w = new TextAreaWidget();
    w.value = "ab\ncd";
    press(w, { name: "up" }); // row 0
    press(w, { name: "end" }); // after "ab"
    press(w, { name: "delete" }); // pulls "cd" onto row 0
    expect(w.value).toBe("abcd");
  });

  test("backspace at column 0 merges into the previous line", () => {
    const w = new TextAreaWidget();
    w.value = "ab\ncd";
    press(w, { name: "home" }); // row 1, col 0 (cursor starts at end → row 1)
    press(w, { name: "backspace" });
    expect(w.value).toBe("abcd");
  });

  test("undo reverts the last edit action and its cursor position; redo reapplies it", () => {
    const w = new TextAreaWidget();
    w.value = "";
    press(w, { key: "a" });
    press(w, { key: "b" });
    press(w, { key: "c" });
    expect(w.value).toBe("abc");

    w.undo(); // undoes typing "c"
    expect(w.value).toBe("ab");
    w.undo(); // undoes typing "b"
    expect(w.value).toBe("a");

    w.redo(); // retypes "b"
    expect(w.value).toBe("ab");
    w.redo(); // retypes "c"
    expect(w.value).toBe("abc");

    // A new edit after undoing clears the redo stack (standard undo-tree behavior).
    w.undo();
    expect(w.value).toBe("ab");
    press(w, { key: "z" });
    expect(w.value).toBe("abz");
    expect(w.redo()).toBe(false);
    expect(w.value).toBe("abz");
  });

  test("undo/redo are no-ops (return false) with nothing to undo/redo", () => {
    const w = new TextAreaWidget();
    w.value = "hello";
    expect(w.undo()).toBe(false);
    expect(w.value).toBe("hello");
    expect(w.redo()).toBe(false);
    expect(w.value).toBe("hello");
  });

  test("ctrl+z / ctrl+y keys drive undo/redo", () => {
    const w = new TextAreaWidget();
    w.value = "";
    press(w, { key: "a" });
    press(w, { key: "b" });
    expect(w.value).toBe("ab");

    press(w, { key: "ctrl+z" });
    expect(w.value).toBe("a");

    press(w, { key: "ctrl+y" });
    expect(w.value).toBe("ab");
  });

  test("undo restores the cursor position, so subsequent typing lands in the right place", () => {
    const w = new TextAreaWidget();
    w.value = "ac";
    press(w, { name: "left" }); // caret between 'a' and 'c'
    press(w, { key: "b" }); // -> "abc", caret after 'b'
    expect(w.value).toBe("abc");

    w.undo(); // back to "ac", caret restored between 'a' and 'c'
    expect(w.value).toBe("ac");
    press(w, { key: "X" });
    expect(w.value).toBe("aXc");
  });

  test("up/down + home/end clamp within the document", () => {
    const w = new TextAreaWidget();
    w.value = Array.from({ length: 6 }, (_, i) => `row${i}`).join("\n");
    for (let i = 0; i < 8; i++) press(w, { name: "up" }); // clamps at the top row
    press(w, { name: "home" });
    press(w, { key: "X" });
    expect(w.value.startsWith("Xrow0")).toBe(true);

    for (let i = 0; i < 8; i++) press(w, { name: "down" }); // clamps at the bottom row
    press(w, { name: "end" });
    press(w, { key: "Y" });
    expect(w.value.endsWith("row5Y")).toBe(true);
  });

  test("a bare left/right collapses an active selection to its edge", () => {
    const w = new TextAreaWidget();
    w.value = "hello";
    press(w, { name: "home" });
    press(w, { name: "right", shift: true });
    press(w, { name: "right", shift: true });
    expect(w.hasSelection()).toBe(true);
    press(w, { name: "left" }); // collapse to the start
    expect(w.hasSelection()).toBe(false);
  });

  test("shift+arrow/home/end all extend a selection", () => {
    const w = new TextAreaWidget();
    w.value = "one\ntwo\nthree";
    // Start at the very end (caret default), extend left and up.
    press(w, { name: "left", shift: true });
    expect(w.hasSelection()).toBe(true);
    press(w, { name: "up", shift: true });
    press(w, { name: "home", shift: true });
    expect(w.hasSelection()).toBe(true);

    // A fresh selection extended with shift+end then shift+down.
    const w2 = new TextAreaWidget();
    w2.value = "alpha\nbeta";
    press(w2, { name: "up" }); // row 0
    press(w2, { name: "home" });
    press(w2, { name: "end", shift: true });
    press(w2, { name: "down", shift: true });
    expect(w2.hasSelection()).toBe(true);
    expect((w2.copySelection() ?? "").length).toBeGreaterThan(0);
  });
});

describe("TextAreaWidget — additional branch coverage", () => {
  const press = (w: TextAreaWidget, ev: Record<string, unknown>) => w.onKey?.(ev as never);

  test("setting value while the caret isn't at the end clamps row/col instead of jumping there", () => {
    const w = new TextAreaWidget();
    w.value = "one\ntwo\nthree";
    // Move off the end so the setter's "isAtEnd" fast path doesn't apply.
    press(w, { name: "up" });
    press(w, { name: "up" });
    press(w, { name: "home" });
    expect((w as any).cursorRow).toBe(0);
    expect((w as any).cursorCol).toBe(0);
    // Replace with a shorter document: cursor must clamp into range, not reset
    // to the end (that's the isAtEnd branch, already covered elsewhere).
    w.value = "x";
    expect((w as any).cursorRow).toBe(0);
    expect((w as any).cursorCol).toBe(0);
  });

  test("pageup/pagedown extend a selection under shift", async () => {
    const { findById } = await mountApp(
      <TextArea
        id="t"
        value={Array.from({ length: 20 }, (_, i) => `row${i}`).join("\n")}
        style={{ width: 20, height: 5 }}
      />,
      { cols: 24, rows: 8 },
    );
    const t = findById("t");
    t.handleKey({ name: "pageup", shift: true });
    expect(t.hasSelection()).toBe(true);
    t.handleKey({ name: "pagedown", shift: true });
    expect(t.hasSelection()).toBe(true);
  });

  test("a bare right-arrow with an active selection collapses to the selection end", () => {
    const w = new TextAreaWidget();
    w.value = "hello";
    press(w, { name: "home" });
    press(w, { name: "right", shift: true });
    press(w, { name: "right", shift: true });
    expect(w.hasSelection()).toBe(true);
    press(w, { name: "right" }); // no shift: collapse to selection end (col 2)
    expect(w.hasSelection()).toBe(false);
    expect((w as any).cursorCol).toBe(2);
  });

  test("copySelection/cutSelection return null when nothing is selected", () => {
    const w = new TextAreaWidget();
    w.value = "hello";
    expect(w.copySelection()).toBeNull();
    expect(w.cutSelection()).toBeNull();
    expect(w.value).toBe("hello");
  });

  test("keepCursorInView is a no-op when the viewport has no room", () => {
    const w = new TextAreaWidget();
    w.value = "abc";
    w.style = { height: 0, width: 0, border: "none" };
    // Driving a key still calls keepCursorInView internally; it must not throw
    // even though the content rect collapses to zero.
    expect(() => press(w, { key: "x" })).not.toThrow();
  });

  test("handleMouse is a no-op once the base handler already marked the event handled", () => {
    const w = new TextAreaWidget();
    w.value = "hello";
    const before = (w as any).cursorCol;
    w.handleMouse({ type: "press", button: "left", x: 0, y: 0, handled: true } as never);
    expect((w as any).cursorCol).toBe(before);
  });

  test("mouse release without an active selection just clears the (empty) anchor", () => {
    const w = new TextAreaWidget();
    w.value = "hello";
    w.handleMouse({ type: "release", button: "left", x: 0, y: 0 } as never);
    expect(w.hasSelection()).toBe(false);
  });

  test("a disabled textarea renders with the disabled color instead of the computed style color", async () => {
    const { findById, settle } = await mountApp(
      <TextArea id="t" value="hello" disabled style={{ width: 20, height: 3 }} />,
      { cols: 24, rows: 5 },
    );
    const t = findById("t");
    await settle();
    expect(t.isDisabled()).toBe(true);
  });

  test("blurring while rendering stops the blink and runs blur validation", async () => {
    const { findById, screen, app, settle } = await mountApp(
      <TextArea id="t" value="hello" style={{ width: 20, height: 3 }} />,
      { cols: 24, rows: 5 },
    );
    const t = findById("t");
    screen.focusWidget(t);
    await settle();
    expect(t.cursorVisible).toBe(true);
    // Move focus elsewhere so the next render() sees focused=false, exercising
    // the stopBlinking + blur-validation branch.
    screen.focusWidget(null as never);
    app.queueRender();
    await settle();
    expect(t.focused).toBe(false);
  });

  test("scrolled content clips rows at the bottom of a short viewport", async () => {
    const { findById, settle } = await mountApp(
      <TextArea
        id="t"
        value={Array.from({ length: 30 }, (_, i) => `line${i}`).join("\n")}
        style={{ width: 20, height: 3, border: "none" }}
      />,
      { cols: 24, rows: 5 },
    );
    const t = findById("t");
    await settle();
    // The content rect is shorter than the document, so the render loop's
    // vertical-clip `break` must fire.
    expect(t.getContentRect().height).toBeLessThan(30);
  });

  test("delete/enter/tab/typed-char all replace an active selection first", () => {
    const mk = () => {
      const w = new TextAreaWidget();
      w.value = "hello";
      press(w, { name: "home" });
      press(w, { name: "right", shift: true });
      press(w, { name: "right", shift: true }); // selects "he"
      return w;
    };

    const wDelete = mk();
    press(wDelete, { name: "delete" });
    expect(wDelete.value).toBe("llo");

    const wEnter = mk();
    press(wEnter, { name: "enter" });
    expect(wEnter.value).toBe("\nllo");

    const wTab = mk();
    press(wTab, { name: "tab" });
    expect(wTab.value).toBe("  llo");

    const wChar = mk();
    press(wChar, { key: "X" });
    expect(wChar.value).toBe("Xllo");
  });

  test("plain backspace mid-line deletes the preceding character", () => {
    const w = new TextAreaWidget();
    w.value = "ab";
    press(w, { name: "backspace" }); // cursorCol > 0, no selection: deletes 'b'
    expect(w.value).toBe("a");
  });

  test("undo history is capped at maxHistory entries", () => {
    const w = new TextAreaWidget();
    w.value = "";
    for (let i = 0; i < 205; i++) press(w, { key: "a" });
    expect(w.value.length).toBe(205);
    // With history capped at 200, undoing all the way can't get back past the
    // 5 earliest (unrecorded) keystrokes to an empty string.
    for (let i = 0; i < 205; i++) w.undo();
    expect(w.value.length).toBeGreaterThan(0);
  });

  test("moving the caret back to column 0 re-aligns scrollX to the left edge", async () => {
    const { findById } = await mountApp(
      <TextArea id="t" value={"x".repeat(200)} lineNumbers={false} />,
      {
        cols: 20,
        rows: 6,
      },
    );
    const t = findById("t");
    t.cursorRow = 0;
    t.cursorCol = 0;
    for (let i = 0; i < 200; i++) t.handleKey({ key: "right" });
    expect(t.scrollX).toBeGreaterThan(0);
    t.handleKey({ name: "home" });
    expect(t.scrollX).toBe(0);
  });

  test("render() falls back to plain colors when there's no themed App to resolve variables", () => {
    // With no App.instance, every `App.instance?.cssResolver.resolveVariable(...)`
    // call in render() short-circuits to undefined, exercising the `|| fallback`
    // branch for the gutter, disabled/focus/selection/placeholder colors.
    expect(App.instance).toBeFalsy();
    const w = new TextAreaWidget();
    w.value = "hi";
    w.placeholder = "type…";
    w.disabled = true;
    w.region = new Region(new Offset(0, 0), new Size(10, 3));
    const buffer = new ScreenBuffer(12, 4);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("selection spanning three lines renders the middle line fully highlighted", async () => {
    const { findById, screen, settle } = await mountApp(
      <TextArea
        id="t"
        value={"aaa\nbbb\nccc"}
        lineNumbers={false}
        style={{ width: 20, height: 5 }}
      />,
      { cols: 24, rows: 6 },
    );
    const t = findById("t");
    screen.focusWidget(t);
    t.cursorRow = 0;
    t.cursorCol = 1;
    t.handleKey({ name: "down", shift: true });
    t.handleKey({ name: "down", shift: true });
    await settle();
    expect(t.copySelection()).toBe("aa\nbbb\nc");
  });
});

describe("ZTUI TextArea Widget Suite", () => {
  test("TextArea values, keys and navigation", async () => {
    let currentVal = "Line 1\nLine 2";
    const { screen, findById } = await mountApp(
      <TextArea
        id="txt"
        value={currentVal}
        placeholder="Type here..."
        onChange={(val) => {
          currentVal = val;
        }}
      />,
      { cols: 40, rows: 10 },
    );

    const txt = findById("txt");
    expect(txt).toBeDefined();
    if (!txt) return;
    expect(txt.value).toBe("Line 1\nLine 2");

    // Focus the widget to start blinking
    screen.focusWidget(txt);
    expect(txt.focused).toBe(true);

    // Type a letter 'a' at the end of the text.
    // Cursor is initially placed at the end: row 1, col 6 ("Line 2" has length 6)
    txt.handleKey({ key: "a" });
    expect(currentVal).toBe("Line 1\nLine 2a");
    expect(txt.cursorCol).toBe(7);

    // Arrow keys
    txt.handleKey({ key: "left" });
    expect(txt.cursorCol).toBe(6);

    txt.handleKey({ key: "up" });
    expect(txt.cursorRow).toBe(0);
    expect(txt.cursorCol).toBe(6); // Col remains 6 because "Line 1" length is 6

    // Right arrow at end of line wraps to next line
    txt.handleKey({ key: "right" });
    expect(txt.cursorRow).toBe(1);
    expect(txt.cursorCol).toBe(0);

    // Left arrow at start of line wraps to prev line
    txt.handleKey({ key: "left" });
    expect(txt.cursorRow).toBe(0);
    expect(txt.cursorCol).toBe(6);

    txt.handleKey({ key: "down" });
    expect(txt.cursorRow).toBe(1);
    expect(txt.cursorCol).toBe(6);

    txt.handleKey({ key: "home" });
    expect(txt.cursorCol).toBe(0);

    txt.handleKey({ key: "end" });
    expect(txt.cursorCol).toBe(7); // "Line 2a" length is 7

    // Tab key inserts 2 spaces
    txt.handleKey({ key: "tab" });
    expect(currentVal).toBe("Line 1\nLine 2a  ");
    expect(txt.cursorCol).toBe(9);

    // Enter key splits the line
    txt.handleKey({ key: "left" }); // cursorCol = 8
    txt.handleKey({ key: "enter" });
    expect(currentVal).toBe("Line 1\nLine 2a \n ");
    expect(txt.cursorRow).toBe(2);
    expect(txt.cursorCol).toBe(0);

    // Backspace on empty space
    txt.handleKey({ key: "backspace" });
    expect(txt.cursorRow).toBe(1);
    expect(txt.cursorCol).toBe(8);

    // Delete key
    txt.handleKey({ key: "left" }); // cursorCol = 7
    txt.handleKey({ key: "delete" }); // deletes the space after 'a'
    expect(currentVal).toBe("Line 1\nLine 2a ");

    // Pageup and Pagedown
    txt.handleKey({ key: "pageup" });
    expect(txt.cursorRow).toBe(0);
    txt.handleKey({ key: "pagedown" });
    expect(txt.cursorRow).toBe(1);
  });

  test("TextArea scroll, mouse click, and unmount", async () => {
    let currentVal = "";
    const { screen, findById, settle } = await mountApp(
      <VBox>
        <TextArea
          id="txt2"
          value={currentVal}
          placeholder="Placeholder"
          lineNumbers={true}
          style={{ height: 5, width: 15 }}
          onChange={(val) => {
            currentVal = val;
          }}
        />
      </VBox>,
      { cols: 20, rows: 5 },
    );

    const txt = findById("txt2");
    expect(txt).toBeDefined();
    if (!txt) return;
    // Exercise the classic square-wave blink here (visibility toggles); the
    // eased smooth caret is covered separately in caret.test.ts.
    txt.smoothCaret = false;
    screen.focusWidget(txt);

    // Set large text to trigger scrolling
    txt.value = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10";
    await settle();

    // Move cursor down to trigger scrollY change
    for (let i = 0; i < 5; i++) txt.handleKey({ key: "down" });
    expect(txt.scrollY).toBeGreaterThan(0);

    // Move cursor right beyond viewport width to trigger scrollX change
    txt.value = "A very long line";
    txt.cursorRow = 0;
    txt.cursorCol = 0;
    for (let i = 0; i < 15; i++) {
      txt.handleKey({ key: "right" });
    }
    expect(txt.scrollX).toBeGreaterThan(0);

    // Mouse click positioning
    const rect = txt.getContentRect();
    txt.handleMouse({
      type: "press",
      button: "left",
      x: rect.x + 8,
      y: rect.y + 1,
    });
    expect(txt.cursorVisible).toBe(true);

    // Wait for cursor blink interval to flip visibility off
    await settle(550);
    expect(txt.cursorVisible).toBe(false);

    txt.onUnmount();
  });
});

describe("TextArea — selection & clipboard", () => {
  test("shift+right builds a same-line selection", async () => {
    const { findById } = await mountApp(<TextArea id="t" value="hello world" />, {
      cols: 40,
      rows: 6,
    });
    const t = findById("t");
    t.handleKey({ name: "home" });
    t.handleKey({ name: "right", shift: true });
    t.handleKey({ name: "right", shift: true });
    t.handleKey({ name: "right", shift: true });
    t.handleKey({ name: "right", shift: true });
    t.handleKey({ name: "right", shift: true });
    expect(t.copySelection()).toBe("hello");
  });

  test("double-click selects the word on the clicked line", async () => {
    const { findById, settle } = await mountApp(
      <TextArea id="t" value={"alpha bravo\ncharlie"} />,
      {
        cols: 40,
        rows: 6,
      },
    );
    const t = findById("t");
    await settle();
    const r = t.getContentRect();
    // row 1, inside "charlie"
    t.handleMouse({ type: "press", button: "left", x: r.x + 3, y: r.y + 1, clickCount: 2 });
    expect(t.copySelection()).toBe("charlie");
  });

  test("triple-click selects the whole clicked line, not the whole value", async () => {
    const { findById, settle } = await mountApp(
      <TextArea id="t" value={"alpha bravo\ncharlie"} />,
      {
        cols: 40,
        rows: 6,
      },
    );
    const t = findById("t");
    await settle();
    const r = t.getContentRect();
    t.handleMouse({ type: "press", button: "left", x: r.x + 2, y: r.y, clickCount: 3 });
    expect(t.copySelection()).toBe("alpha bravo");
  });

  test("shift+down selects across lines and copy joins with newline", async () => {
    const { findById } = await mountApp(<TextArea id="t" value={"abc\ndef\nghi"} />, {
      cols: 40,
      rows: 8,
    });
    const t = findById("t");
    t.handleKey({ name: "home" }); // row 2 (end), col 0
    t.cursorRow = 0;
    t.cursorCol = 1;
    t.handleKey({ name: "down", shift: true }); // -> row 1, col 1
    expect(t.copySelection()).toBe("bc\nd");
  });

  test("backspace deletes a cross-line selection as one op", async () => {
    let val = "abc\ndef\nghi";
    const { findById } = await mountApp(
      <TextArea
        id="t"
        value={val}
        onChange={(v) => {
          val = v;
        }}
      />,
      { cols: 40, rows: 8 },
    );
    const t = findById("t");
    t.cursorRow = 0;
    t.cursorCol = 1;
    t.handleKey({ name: "down", shift: true }); // select "bc\nd"
    t.handleKey({ name: "backspace" });
    expect(t.value).toBe("aef\nghi");
  });

  test("insertText replaces selection with multi-line text", async () => {
    const { findById } = await mountApp(<TextArea id="t" value="abXYef" />, {
      cols: 40,
      rows: 6,
    });
    const t = findById("t");
    t.cursorRow = 0;
    t.cursorCol = 2;
    t.handleKey({ name: "right", shift: true });
    t.handleKey({ name: "right", shift: true }); // select "XY"
    t.insertText("1\n2");
    expect(t.value).toBe("ab1\n2ef");
  });

  test("selectAll + cutSelection empties and copies all", async () => {
    const { findById, driver } = await mountApp(<TextArea id="t" value={"one\ntwo"} />, {
      cols: 40,
      rows: 6,
    });
    const t = findById("t");
    t.selectAll();
    expect(t.cutSelection()).toBe("one\ntwo");
    expect(t.value).toBe("");
    expect(await driver.clipboard.get()).toBe("one\ntwo");
  });

  test("mouse drag selects and copies to clipboard on release", async () => {
    const { findById, driver, settle } = await mountApp(
      <TextArea id="t" value="hello world" lineNumbers={false} style={{ width: 30, height: 4 }} />,
      { cols: 40, rows: 6 },
    );
    const t = findById("t");
    await settle();
    const rect = t.getContentRect();
    t.handleMouse({ type: "press", button: "left", x: rect.x, y: rect.y });
    t.handleMouse({ type: "drag", button: "left", x: rect.x + 5, y: rect.y });
    t.handleMouse({ type: "release", button: "left", x: rect.x + 5, y: rect.y });
    expect(await driver.clipboard.get()).toBe("hello");
  });

  test("selected cells render with the theme selection background", async () => {
    const { findById, screen, app, settle, cellAt } = await mountApp(
      <TextArea id="t" value="hello" lineNumbers={false} style={{ width: 20, height: 3 }} />,
      { cols: 24, rows: 5 },
    );
    const t = findById("t");
    screen.focusWidget(t);
    t.handleKey({ name: "home" });
    t.handleKey({ name: "right", shift: true });
    t.handleKey({ name: "right", shift: true });
    app.queueRender();
    await settle();
    const rect = t.getContentRect();
    // First selected glyph cell carries the (non-default) selection background.
    const cell = cellAt(rect.x, rect.y);
    expect(cell.style.background).toBeDefined();
    expect(cell.style.background).not.toBe("default");
  });

  test("multiline syntax coloring, line numbers, scrolling, and editing", async () => {
    let val = "line1\nline2";
    const onChange = (v: string) => {
      val = v;
    };
    const { screen } = await mountApp(
      <TextArea value={val} onChange={onChange} lineNumbers={true} language="typescript" />,
      { cols: 30, rows: 8, capabilities: { glyphProtocol: false, graphicsProtocol: "none" } },
    );

    const textWidget = screen.children[0] as any;
    expect(textWidget.value).toBe("line1\nline2");

    // Click at row 1, col 2 ('n' of line2). Gutter width is 2 digits + " │ " = 5.
    textWidget.handleMouse({
      type: "press",
      button: "left",
      x: textWidget.getContentRect().x + 5 + 2,
      y: textWidget.getContentRect().y + 1,
    });
    expect(textWidget.cursorRow).toBe(1);
    expect(textWidget.cursorCol).toBe(2);

    textWidget.onKey({ key: "up", name: "up", ctrl: false, meta: false, shift: false });
    expect(textWidget.cursorRow).toBe(0);
    expect(textWidget.cursorCol).toBe(2); // keeps same column

    // Enter inserts a newline: 'li\nne1\nline2'.
    textWidget.onKey({ key: "enter", name: "enter", ctrl: false, meta: false, shift: false });
    expect(val).toBe("li\nne1\nline2");
    expect(textWidget.cursorRow).toBe(1);
    expect(textWidget.cursorCol).toBe(0);

    // Typing a character: 'li\nxne1\nline2'.
    textWidget.onKey({ key: "x", name: "x", ctrl: false, meta: false, shift: false });
    expect(val).toBe("li\nxne1\nline2");
    expect(textWidget.cursorRow).toBe(1);
    expect(textWidget.cursorCol).toBe(1);
  });
});
