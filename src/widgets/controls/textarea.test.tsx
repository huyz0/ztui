import { describe, expect, test } from "vitest";
import { TextArea, VBox } from "../../index.ts";
import { mountApp } from "../../test/harness.tsx";

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
