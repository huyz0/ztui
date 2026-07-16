import { describe, expect, test } from "vitest";
import { atomsFromString, ChatBuffer, type ChipToken, isChip } from "./model.ts";

const chip = (label: string, id = label): ChipToken => ({ id, label });

describe("ChatBuffer", () => {
  test("insertText builds value and advances caret", () => {
    const b = new ChatBuffer();
    b.insertText("hello");
    expect(b.value).toBe("hello");
    expect(b.caret).toBe(5);
    expect(b.length).toBe(5);
  });

  test("a chip is one atom; caret steps over it as a unit", () => {
    const b = new ChatBuffer();
    b.insertText("see ");
    b.insertChip(chip("auth.ts"));
    b.insertText("!");
    expect(b.value).toBe("see auth.ts!");
    // atoms: s e e ' ' [chip] ! = 6 atoms (not the chip's label length)
    expect(b.length).toBe(6);
    // caret at end; one Left lands just after the chip, another just before it
    b.moveHorizontal(-1, false); // before "!"
    b.moveHorizontal(-1, false); // before chip (single step over the chip)
    expect(b.caret).toBe(4);
  });

  test("backspace deletes a whole chip in one keystroke", () => {
    const b = new ChatBuffer();
    b.insertText("a");
    b.insertChip(chip("file.rs"));
    expect(b.length).toBe(2);
    b.backspace(); // removes the chip atom
    expect(b.value).toBe("a");
    expect(b.length).toBe(1);
  });

  test("custom serializer controls how a chip becomes text", () => {
    const b = new ChatBuffer((t) => `<${t.label}>`);
    b.insertChip(chip("x.ts"));
    expect(b.value).toBe("<x.ts>");
  });

  test("selection range, selected text, and delete", () => {
    const b = new ChatBuffer();
    b.insertText("abcdef");
    b.caret = 1;
    b.moveHorizontal(1, true); // select "b"
    b.moveHorizontal(1, true); // select "bc"
    expect(b.selectionRange()).toEqual([1, 3]);
    expect(b.selectedText()).toBe("bc");
    b.backspace(); // deletes selection
    expect(b.value).toBe("adef");
    expect(b.hasSelection()).toBe(false);
  });

  test("undo coalesces typing but separates structural edits", () => {
    const b = new ChatBuffer();
    b.insertText("h");
    b.insertText("i"); // same "type" kind -> coalesced into the "hi" step
    b.insertChip(chip("c")); // structural -> its own step
    expect(b.value).toBe("hic");
    b.undo(); // remove chip
    expect(b.value).toBe("hi");
    b.undo(); // remove the whole coalesced "hi"
    expect(b.value).toBe("");
    b.redo();
    expect(b.value).toBe("hi");
  });

  test("replaceRangeWithChip is one undoable step (chip -> raw text)", () => {
    const b = new ChatBuffer();
    b.insertText("@aut");
    const q = b.triggerQuery("@", false);
    expect(q).toEqual({ start: 0, query: "aut" });
    b.replaceRangeWithChip(q!.start, b.caret, { id: "1", label: "auth.ts" });
    expect(b.value).toBe("auth.ts");
    expect(b.length).toBe(1);
    b.undo();
    expect(b.value).toBe("@aut");
  });

  test("triggerQuery respects whitespace boundaries and atLineStart", () => {
    const b = new ChatBuffer();
    b.insertText("hi @bob");
    expect(b.triggerQuery("@", false)).toEqual({ start: 3, query: "bob" });
    // atLineStart: "@" is not at column 0 here -> no match
    expect(b.triggerQuery("@", true)).toBeNull();

    const c = new ChatBuffer();
    c.insertText("/clear");
    expect(c.triggerQuery("/", true)).toEqual({ start: 0, query: "clear" });

    const d = new ChatBuffer();
    d.insertText("a @b c"); // caret after "c"; nearest token has no trigger char
    expect(d.triggerQuery("@", false)).toBeNull();
  });

  test("line edges and start/end over multiline", () => {
    const b = new ChatBuffer();
    b.insertText("ab\ncd");
    expect(b.caret).toBe(5);
    b.moveLineEdge(-1, false);
    expect(b.caret).toBe(3); // start of second line
    b.moveLineEdge(1, false);
    expect(b.caret).toBe(5); // end of buffer
    expect(b.lineStart(1)).toBe(0);
    expect(b.lineEnd(0)).toBe(2);
  });

  test("setValue resets history; selectAll spans the buffer", () => {
    const b = new ChatBuffer();
    b.setValue("xyz");
    expect(b.undo()).toBe(false); // history cleared
    b.selectAll();
    expect(b.selectionRange()).toEqual([0, 3]);
  });

  test("atomsFromString and isChip helpers", () => {
    expect(atomsFromString("ab")).toEqual(["a", "b"]);
    expect(isChip("a")).toBe(false);
    expect(isChip(chip("x"))).toBe(true);
  });

  test("deleteForward removes the atom at the caret (and the selection first)", () => {
    const b = new ChatBuffer();
    b.insertText("abc");
    b.caret = 0;
    b.deleteForward();
    expect(b.value).toBe("bc");
    b.caret = 0;
    b.moveHorizontal(1, true); // select "b"
    b.deleteForward();
    expect(b.value).toBe("c");
    b.deleteForward(); // delete "c"
    b.deleteForward(); // no-op at end
    expect(b.value).toBe("");
  });

  test("moveHorizontal collapses a selection to the correct edge without extend", () => {
    const b = new ChatBuffer();
    b.insertText("abcd");
    b.caret = 1;
    b.anchor = 3; // selection [1,3)
    b.moveHorizontal(-1, false);
    expect(b.caret).toBe(1);
    expect(b.hasSelection()).toBe(false);
    b.anchor = 1;
    b.caret = 3;
    b.moveHorizontal(1, false);
    expect(b.caret).toBe(3);
  });

  test("moveLineEdge extends a selection; clearSelection + clear", () => {
    const b = new ChatBuffer();
    b.insertText("abc");
    b.moveLineEdge(-1, true);
    expect(b.selectionRange()).toEqual([0, 3]);
    b.clearSelection();
    expect(b.hasSelection()).toBe(false);
    b.clear();
    expect(b.value).toBe("");
    b.undo(); // clear is undoable
    expect(b.value).toBe("abc");
  });

  test("insertChip replaces an active selection; serializeChip uses the host fn", () => {
    const b = new ChatBuffer((t) => `@${t.label}`);
    b.insertText("abc");
    b.anchor = 0;
    b.caret = 3; // select all
    b.insertChip(chip("x"));
    expect(b.value).toBe("@x");
    expect(b.serializeChip(chip("y"))).toBe("@y");
  });

  test("redo after undo restores the state", () => {
    const b = new ChatBuffer();
    b.insertText("hi");
    b.undo();
    expect(b.value).toBe("");
    expect(b.redo()).toBe(true);
    expect(b.value).toBe("hi");
    expect(b.redo()).toBe(false);
  });

  test("undo history is capped so a long session can't grow without bound", () => {
    const b = new ChatBuffer();
    // Each insertText below is its own "structural"-coalescing boundary via a
    // distinct kind, forcing 205 separate undo steps to push past the 200 cap.
    for (let i = 0; i < 205; i++) {
      b.insertText(String(i), `kind-${i}`);
    }
    // The oldest steps were shifted out; undoing everything available should
    // land short of the full "empty buffer" state (proving the cap kicked in)
    // rather than throwing or growing unbounded.
    let undone = 0;
    while (b.undo()) undone++;
    expect(undone).toBe(200);
    expect(b.value).not.toBe("");
  });

  test("selectedText is empty with no active selection", () => {
    const b = new ChatBuffer();
    b.insertText("abc");
    expect(b.hasSelection()).toBe(false);
    expect(b.selectedText()).toBe("");
  });

  test("selectedText serializes a chip inside the selected range", () => {
    const b = new ChatBuffer((t) => `<${t.label}>`);
    b.insertText("a");
    b.insertChip(chip("x.ts"));
    b.insertText("b");
    b.anchor = 0;
    b.caret = 3; // select all 3 atoms: "a", chip, "b"
    expect(b.selectedText()).toBe("a<x.ts>b");
  });

  test("moveLineEdge(extend) keeps an existing anchor instead of resetting it", () => {
    const b = new ChatBuffer();
    b.insertText("abc");
    b.caret = 1;
    b.moveHorizontal(1, true); // anchor = 1, caret = 2
    b.moveLineEdge(1, true); // extend again: anchor must stay at 1, not reset to 2
    expect(b.selectionRange()).toEqual([1, 3]);
  });

  test('insertText("") is a no-op', () => {
    const b = new ChatBuffer();
    b.insertText("abc");
    const before = b.value;
    const undoDepth = (b as unknown as { undoStack: unknown[] }).undoStack.length;
    b.insertText("");
    expect(b.value).toBe(before);
    expect((b as unknown as { undoStack: unknown[] }).undoStack.length).toBe(undoDepth);
  });

  test("backspace at the start of the buffer is a no-op", () => {
    const b = new ChatBuffer();
    b.insertText("abc");
    b.caret = 0;
    b.backspace();
    expect(b.value).toBe("abc");
  });

  test("clear on an already-empty buffer is a no-op (doesn't push undo history)", () => {
    const b = new ChatBuffer();
    const undoDepth = (b as unknown as { undoStack: unknown[] }).undoStack.length;
    b.clear();
    expect(b.value).toBe("");
    expect((b as unknown as { undoStack: unknown[] }).undoStack.length).toBe(undoDepth);
  });

  test("moveHorizontal clamps the caret below the start of the buffer", () => {
    const b = new ChatBuffer();
    b.insertText("ab");
    b.caret = 0;
    b.moveHorizontal(-1, true); // dir -1 past 0, with extend so no selection to collapse into
    expect(b.caret).toBe(0);
  });
});
