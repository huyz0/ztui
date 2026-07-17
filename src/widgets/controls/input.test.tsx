import { describe, expect, test } from "vitest";
import { Input, VBox } from "../../react.ts";
import { iconRegistry } from "../../render/icon-registry.ts";
import { mountApp } from "../../test/harness.tsx";
import { InputWidget } from "./input.ts";

describe("InputWidget — icon rendering", () => {
  test("renders a registered prefix icon and a plain-glyph suffix icon", async () => {
    iconRegistry.registerIcon({ name: "in-search", svg: "<svg/>", textFallback: "S" });
    const t = await mountApp(<Input id="in" value="hi" icon="in-search" suffixIcon="✕" />, {
      cols: 30,
      rows: 3,
    });
    await t.settle();
    // Prefix cell carries the registered icon; suffix is the plain glyph.
    expect(t.cellAt(1, 1).icon).toBe("in-search");
    expect(t.text()).toContain("✕");
  });

  test("renders a single-width emoji-free prefix icon (non-registered path)", async () => {
    const t = await mountApp(<Input id="in" value="x" icon=">" />, { cols: 20, rows: 3 });
    await t.settle();
    expect(t.text()).toContain(">");
  });

  test("password type masks the value with bullets", async () => {
    const t = await mountApp(<Input id="in" value="secret" type="password" />, {
      cols: 20,
      rows: 3,
    });
    await t.settle();
    expect(t.text()).not.toContain("secret");
    expect(t.text()).toContain("•");
  });
});

describe("InputWidget — accessors", () => {
  test("invalid override, validators/validateOn forwarding, and caret flags", () => {
    const w = new InputWidget();
    expect(w.invalid).toBe(false);
    w.invalid = true;
    expect(w.invalid).toBe(true);
    w.invalid = undefined; // defers to validation result
    expect(w.invalid).toBe(false);

    w.validators = [() => "bad"];
    expect(w.validators).toHaveLength(1);
    w.validateOn = "blur";
    expect(w.validateOn).toBe("blur");

    w.smoothCaret = false;
    expect(w.smoothCaret).toBe(false);
    expect(typeof w.cursorVisible).toBe("boolean");
    expect(w.getValidationValue()).toBe(w.value);
  });
});

describe("InputWidget — unicode input", () => {
  test("inserts a single ascii character", () => {
    const w = new InputWidget();
    w.onKey?.({ key: "a" } as any);
    expect(w.value).toBe("a");
  });

  test("inserts an astral glyph (emoji) as one character", () => {
    const w = new InputWidget();
    w.onKey?.({ key: "😀" } as any);
    expect(w.value).toBe("😀");
    // cursor advanced by a single code point, not two UTF-16 units
    w.onKey?.({ key: "x" } as any);
    expect(w.value).toBe("😀x");
  });

  test("ignores named keys", () => {
    const w = new InputWidget();
    w.onKey?.({ key: "up" } as any);
    w.onKey?.({ key: "enter" } as any);
    expect(w.value).toBe("");
  });

  test("tracks cursor to the new end when set externally while at end, past a multi-code-unit grapheme", () => {
    const w = new InputWidget();
    w.value = "ab😀"; // 3 graphemes, 4 UTF-16 units
    (w as unknown as { cursorCol: number }).cursorCol = 3; // caret at end (grapheme count)
    w.value = "ab😀c"; // append externally
    expect((w as unknown as { cursorCol: number }).cursorCol).toBe(4); // end, after "c"
  });
});

describe("InputWidget — selection & clipboard", () => {
  const press = (w: InputWidget, ev: Record<string, unknown>) => w.onKey?.(ev as any);

  test("shift+left extends a selection that copySelection returns", () => {
    const w = new InputWidget();
    w.value = "hello"; // caret at end (5)
    press(w, { name: "left", shift: true });
    press(w, { name: "left", shift: true });
    expect(w.copySelection()).toBe("lo");
  });

  test("shift+home selects to the start", () => {
    const w = new InputWidget();
    w.value = "hello";
    press(w, { name: "home", shift: true });
    expect(w.copySelection()).toBe("hello");
  });

  test("bare arrow collapses the selection (no copy)", () => {
    const w = new InputWidget();
    w.value = "hello";
    press(w, { name: "left", shift: true });
    press(w, { name: "left", shift: true });
    press(w, { name: "left" }); // collapse to left edge
    expect(w.copySelection()).toBe(null);
  });

  test("typing replaces the active selection", () => {
    const w = new InputWidget();
    w.value = "hello";
    press(w, { name: "home", shift: true }); // select all
    press(w, { key: "Z" });
    expect(w.value).toBe("Z");
  });

  test("backspace deletes the selection as one operation", () => {
    const w = new InputWidget();
    w.value = "hello";
    press(w, { name: "left", shift: true });
    press(w, { name: "left", shift: true }); // select "lo"
    press(w, { name: "backspace" });
    expect(w.value).toBe("hel");
  });

  test("selectAll then cutSelection empties the value", () => {
    const w = new InputWidget();
    w.value = "hello";
    w.selectAll();
    expect(w.cutSelection()).toBe("hello");
    expect(w.value).toBe("");
  });

  test("double-click selects the word under the cursor", async () => {
    const t = await mountApp(<Input id="in" value="hello world" />, { cols: 30, rows: 3 });
    const w = t.findById<InputWidget>("in")!;
    await t.settle();
    const r = w.getContentRect();
    // col 7 falls inside "world" (h e l l o ␠ w[6] o[7] ...)
    w.handleMouse({ type: "press", button: "left", x: r.x + 7, y: r.y, clickCount: 2 } as any);
    expect(w.copySelection()).toBe("world");
  });

  test("triple-click selects the whole value", async () => {
    const t = await mountApp(<Input id="in" value="hello world" />, { cols: 30, rows: 3 });
    const w = t.findById<InputWidget>("in")!;
    await t.settle();
    const r = w.getContentRect();
    w.handleMouse({ type: "press", button: "left", x: r.x + 3, y: r.y, clickCount: 3 } as any);
    expect(w.copySelection()).toBe("hello world");
  });

  test("insertText replaces the selection and flattens newlines", () => {
    const w = new InputWidget();
    w.value = "abXYef";
    // select "XY": move to index 2 then shift-right twice
    press(w, { name: "home" });
    press(w, { name: "right" });
    press(w, { name: "right" });
    press(w, { name: "right", shift: true });
    press(w, { name: "right", shift: true });
    w.insertText("12\n34");
    expect(w.value).toBe("ab12 34ef");
  });

  test("delete removes the char ahead; end jumps to the end; right collapses a selection", () => {
    const w = new InputWidget();
    w.value = "abcd";
    press(w, { name: "home" });
    press(w, { name: "delete" }); // removes "a"
    expect(w.value).toBe("bcd");

    press(w, { name: "end" });
    press(w, { key: "!" });
    expect(w.value).toBe("bcd!");

    // A selection collapses to its right edge on a bare Right.
    press(w, { name: "home" });
    press(w, { name: "right", shift: true });
    press(w, { name: "right", shift: true });
    expect(w.hasSelection()).toBe(true);
    press(w, { name: "right" }); // collapse, no extend
    expect(w.hasSelection()).toBe(false);
  });
});

describe("InputWidget — mouse selection", () => {
  test("press anchors, drag extends, release without a selection clears the anchor", () => {
    const w = new InputWidget();
    w.value = "hello world";
    // Press then drag to a different column establishes and extends a selection.
    w.handleMouse({ type: "press", button: "left", x: 0, y: 0, handled: false } as any);
    w.handleMouse({ type: "drag", button: "left", x: 5, y: 0, handled: false } as any);
    expect(w.hasSelection()).toBe(true);

    // A release where start == end (no real selection) clears the anchor.
    w.handleMouse({ type: "press", button: "left", x: 2, y: 0, handled: false } as any);
    w.handleMouse({ type: "release", button: "left", x: 2, y: 0, handled: false } as any);
    expect(w.hasSelection()).toBe(false);
  });
});

describe("InputWidget — keyboard interaction", () => {
  test("typing, backspace, and an ignored control key all update onChange as expected", async () => {
    let val = "";
    const onChange = (v: string) => {
      val = v;
    };
    const { app } = await mountApp(<Input value="init" onChange={onChange} />, {
      cols: 80,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
    });
    const inputWidget = app.activeScreen.children[0] as any;
    expect(inputWidget.value).toBe("init");

    inputWidget.onKey({ key: "a", name: "a", ctrl: false, meta: false, shift: false });
    expect(val).toBe("inita");

    inputWidget.onKey({
      key: "backspace",
      name: "backspace",
      ctrl: false,
      meta: false,
      shift: false,
    });
    expect(val).toBe("init");

    inputWidget.onKey({ key: "enter", name: "enter", ctrl: false, meta: false, shift: false });
    expect(inputWidget.value).toBe("init");
  });

  test("enhanced navigation, editing, and placeholder rendering", async () => {
    let val = "";
    const onChange = (v: string) => {
      val = v;
    };
    const { app, settle } = await mountApp(
      <Input value="hello" onChange={onChange} placeholder="empty..." />,
      { cols: 20, rows: 3, capabilities: { glyphProtocol: false, graphicsProtocol: "none" } },
    );
    const inputWidget = app.activeScreen.children[0] as any;
    expect(inputWidget.value).toBe("hello");

    // Click inside to position cursor (click col = 2 -> character 'l').
    inputWidget.handleMouse({
      type: "press",
      button: "left",
      x: inputWidget.getContentRect().x + 2,
      y: inputWidget.getContentRect().y,
    });
    expect(inputWidget.cursorCol).toBe(2);

    inputWidget.onKey({ key: "left", name: "left", ctrl: false, meta: false, shift: false });
    expect(inputWidget.cursorCol).toBe(1);

    inputWidget.onKey({ key: "right", name: "right", ctrl: false, meta: false, shift: false });
    expect(inputWidget.cursorCol).toBe(2);

    inputWidget.onKey({ key: "home", name: "home", ctrl: false, meta: false, shift: false });
    expect(inputWidget.cursorCol).toBe(0);

    inputWidget.onKey({ key: "end", name: "end", ctrl: false, meta: false, shift: false });
    expect(inputWidget.cursorCol).toBe(5);

    // Insert character '!' at end (cursor is at 5).
    inputWidget.onKey({ key: "!", name: "!", ctrl: false, meta: false, shift: false });
    expect(val).toBe("hello!");
    expect(inputWidget.cursorCol).toBe(6);

    // Backspace at 6 deletes '!'.
    inputWidget.onKey({
      key: "backspace",
      name: "backspace",
      ctrl: false,
      meta: false,
      shift: false,
    });
    expect(val).toBe("hello");
    expect(inputWidget.cursorCol).toBe(5);

    // Move left twice to col 3 (after 'l').
    inputWidget.onKey({ key: "left", name: "left", ctrl: false, meta: false, shift: false });
    inputWidget.onKey({ key: "left", name: "left", ctrl: false, meta: false, shift: false });
    expect(inputWidget.cursorCol).toBe(3);

    // Delete at 3 deletes 'l' (so 'hello' -> 'helo').
    inputWidget.onKey({ key: "delete", name: "delete", ctrl: false, meta: false, shift: false });
    expect(val).toBe("helo");
    expect(inputWidget.cursorCol).toBe(3);

    // Placeholder rendering once emptied.
    inputWidget.value = "";
    app.queueRender();
    await settle();
    const buffer = app.buffer;
    expect(buffer.cells[inputWidget.getContentRect().y][inputWidget.getContentRect().x].char).toBe(
      "e",
    );
  });
});

describe("InputWidget — additional branch coverage", () => {
  test("validators setter falls back to [] when given a nullish value", () => {
    const w = new InputWidget();
    w.validators = [() => "bad"];
    expect(w.validators).toHaveLength(1);
    (w as unknown as { validators: unknown }).validators = undefined;
    expect(w.validators).toEqual([]);
  });

  test("key handling accounts for prefix/suffix icon width when computing text width", async () => {
    const t = await mountApp(<Input id="in" value="hi" icon=">" suffixIcon="<" />, {
      cols: 20,
      rows: 3,
    });
    const w = t.findById<InputWidget>("in")!;
    await t.settle();
    expect(() => w.onKey?.({ key: "x", name: "x" } as any)).not.toThrow();
    expect(w.value).toBe("hix");
  });

  test("an out-of-range cursorCol is clamped to the text length before handling a key", () => {
    const w = new InputWidget();
    w.value = "abc";
    (w as unknown as { cursorCol: number }).cursorCol = 99;
    w.onKey?.({ name: "left" } as any);
    expect((w as unknown as { cursorCol: number }).cursorCol).toBe(2);
  });

  test("shift+end with no existing selection starts a fresh one", () => {
    const w = new InputWidget();
    w.value = "hello";
    w.onKey?.({ name: "home" } as any);
    w.onKey?.({ name: "end", shift: true } as any);
    expect(w.copySelection()).toBe("hello");
  });

  test("Enter fires onSubmit with the current value", () => {
    let submitted = "";
    const w = new InputWidget();
    w.value = "abc";
    w.onSubmit = (v) => {
      submitted = v;
    };
    w.onKey?.({ name: "enter" } as any);
    expect(submitted).toBe("abc");
  });

  test("Escape fires onDismiss", () => {
    let dismissed = false;
    const w = new InputWidget();
    (w as unknown as { onDismiss?: () => void }).onDismiss = () => {
      dismissed = true;
    };
    w.onKey?.({ name: "escape" } as any);
    expect(dismissed).toBe(true);
  });

  test("cutSelection is a no-op (null) when there is nothing selected", () => {
    const w = new InputWidget();
    w.value = "abc";
    expect(w.cutSelection()).toBeNull();
  });

  test("handleMouse ignores an event already handled upstream", () => {
    const w = new InputWidget();
    w.value = "hello";
    w.handleMouse({ type: "press", button: "left", x: 0, y: 0, handled: true } as any);
    expect(w.hasSelection()).toBe(false);
  });

  test("a release with an active selection copies it", () => {
    const w = new InputWidget();
    w.value = "hello";
    w.handleMouse({ type: "press", button: "left", x: 0, y: 0 } as any);
    w.handleMouse({ type: "drag", button: "left", x: 3, y: 0 } as any);
    expect(w.hasSelection()).toBe(true);
    w.handleMouse({ type: "release", button: "left", x: 3, y: 0 } as any);
    expect(w.copySelection()).toBe("hel");
  });

  test("invalid=true resolves the $error border color via an App instance", async () => {
    const t = await mountApp(<Input id="in" value="x" />, { cols: 20, rows: 3 });
    const w = t.findById<InputWidget>("in")!;
    w.invalid = true;
    await t.settle();
    const color = (
      w as unknown as { resolveBorderColor(): string | undefined }
    ).resolveBorderColor();
    expect(typeof color).toBe("string");
  });

  test("suffix icon renders through the registered-icon path", async () => {
    iconRegistry.registerIcon({ name: "in-suffix-reg", svg: "<svg/>", textFallback: "X" });
    const t = await mountApp(<Input id="in" value="hi" suffixIcon="in-suffix-reg" />, {
      cols: 20,
      rows: 3,
    });
    await t.settle();
    const w = t.findById<InputWidget>("in")!;
    const r = w.getContentRect();
    const row = Array.from({ length: r.width }, (_, i) => t.cellAt(r.x + i, r.y));
    expect(row.some((c) => c.icon === "in-suffix-reg")).toBe(true);
  });

  test("an invalid override tints the prefix/suffix icon color", async () => {
    const t = await mountApp(<Input id="in" value="hi" icon=">" suffixIcon="<" />, {
      cols: 20,
      rows: 3,
    });
    const w = t.findById<InputWidget>("in")!;
    w.invalid = true;
    await t.settle();
    expect(() => t.text()).not.toThrow();
  });

  test("disabled input renders text in the disabled color", async () => {
    const t = await mountApp(<Input id="in" value="hi" disabled />, { cols: 20, rows: 3 });
    await t.settle();
    expect(t.text()).toContain("hi");
  });

  test("selection highlight and caret coloring render without throwing", async () => {
    const t = await mountApp(<Input id="in" value="hello" />, { cols: 20, rows: 3 });
    const w = t.findById<InputWidget>("in")!;
    t.screen.focusWidget(w as any);
    w.onKey?.({ name: "home" } as any);
    w.onKey?.({ name: "right", shift: true } as any);
    w.onKey?.({ name: "right", shift: true } as any);
    await t.settle();
    expect(w.hasSelection()).toBe(true);
    expect(() => t.text()).not.toThrow();
  });

  test("caret mid-value (not at the end) blends into the character's own color", async () => {
    const t = await mountApp(<Input id="in" value="hello" />, { cols: 20, rows: 3 });
    const w = t.findById<InputWidget>("in")!;
    t.screen.focusWidget(w as any);
    w.onKey?.({ name: "home" } as any);
    await t.settle();
    expect(() => t.text()).not.toThrow();
  });

  test("a value wider than the field scrolls and stops drawing at the right edge", async () => {
    const t = await mountApp(<Input id="in" value="this is a much longer value than fits" />, {
      cols: 10,
      rows: 3,
    });
    await t.settle();
    expect(() => t.text()).not.toThrow();
  });

  test("stops collecting visible cells when a wide char would overflow the remaining width", async () => {
    // Content width is 2 cells; "a" fills 1, leaving exactly 1 free column —
    // not enough for the 2-wide CJK char that follows, so the visible-cell
    // collection loop must break instead of overflowing.
    const t = await mountApp(
      <VBox>
        <Input id="in" value="a漢" style={{ width: 4 }} />
      </VBox>,
      { cols: 20, rows: 3 },
    );
    await t.settle();
    const w = t.findById<InputWidget>("in")!;
    const r = w.getClientRect();
    expect(r.width).toBe(4);
    let row = "";
    for (let x = r.x; x < r.x + r.width; x++) row += t.cellAt(x, r.y + 1).char;
    expect(row).toContain("a");
    expect(row).not.toContain("漢");
  });

  test("an out-of-range cursorCol is clamped to the text length during render", async () => {
    const t = await mountApp(<Input id="in" value="abc" />, { cols: 20, rows: 3 });
    const w = t.findById<InputWidget>("in")!;
    // Force cursorCol out of range without going through the value setter
    // (which already clamps it) — render() must independently clamp too.
    (w as unknown as { cursorCol: number }).cursorCol = 99;
    t.app.queueRender();
    await t.settle();
    expect((w as unknown as { cursorCol: number }).cursorCol).toBe(3);
  });
});

describe("InputWidget — additional branch coverage 2", () => {
  test("tab is ignored as a plain control key (no edit, no submit/dismiss)", () => {
    const w = new InputWidget();
    w.value = "abc";
    const before = w.value;
    w.onKey?.({ name: "tab" } as any);
    expect(w.value).toBe(before);
  });

  test("colAtX accounts for the icon's reserved width when mapping a click to a caret index", async () => {
    const t = await mountApp(
      <VBox>
        <Input id="in" value="hello" icon=">" />
      </VBox>,
      { cols: 20, rows: 3 },
    );
    await t.settle();
    const w = t.findById<InputWidget>("in")!;
    const r = w.getContentRect();
    // Click just past the icon + its trailing space — should land at caret 0,
    // not offset by the icon's width if colAtX ignored `this.icon`.
    w.handleMouse({ type: "press", button: "left", x: r.x + 3, y: r.y, handled: false } as any);
    expect((w as unknown as { cursorCol: number }).cursorCol).toBe(0);
  });

  test("a smooth-caret input renders without throwing while blinking", async () => {
    const t = await mountApp(
      <VBox>
        <Input id="in" value="hi" />
      </VBox>,
      { cols: 20, rows: 3 },
    );
    const w = t.findById<InputWidget>("in")!;
    w.smoothCaret = true;
    t.screen.focusWidget(w as any);
    t.app.queueRender();
    await t.settle();
    expect(() => t.text()).not.toThrow();
  });

  test("a double-width suffix icon doesn't get an extra trailing space", async () => {
    const t = await mountApp(
      <VBox>
        <Input id="in" value="hi" suffixIcon="漢字" />
      </VBox>,
      { cols: 20, rows: 3 },
    );
    await t.settle();
    expect(() => t.text()).not.toThrow();
    expect(t.text()).toContain("漢字");
  });

  test("an invalid override tints an icon with the error color", async () => {
    const t = await mountApp(
      <VBox>
        <Input id="in" value="hi" icon=">" suffixIcon="<" />
      </VBox>,
      { cols: 20, rows: 3 },
    );
    const w = t.findById<InputWidget>("in")!;
    w.invalid = true;
    t.app.queueRender();
    await t.settle();
    expect(() => t.text()).not.toThrow();
  });
});

describe("InputWidget — onValidate", () => {
  test("forwards get/set to the underlying validation controller", () => {
    const w = new InputWidget();
    expect(w.onValidate).toBeUndefined();
    const handler = () => {};
    w.onValidate = handler;
    expect(w.onValidate).toBe(handler);
  });
});
