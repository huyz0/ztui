import { describe, expect, test } from "vitest";
import { App, render, TextArea, VBox } from "../index.ts";
import { VTEDriver } from "./vte-runner.ts";

function findWidgetById(screen: any, id: string): any {
  let found: any;
  screen.walk((n: any) => {
    if (n.id === id) found = n;
  });
  return found;
}

describe("ZTUI TextArea Widget Suite", () => {
  test("TextArea values, keys and navigation", async () => {
    let currentVal = "Line 1\nLine 2";
    const driver = new VTEDriver(40, 10);
    const app = new App(driver);

    render(
      <TextArea
        id="txt"
        value={currentVal}
        placeholder="Type here..."
        onChange={(val) => {
          currentVal = val;
        }}
      />,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const txt = findWidgetById(app.activeScreen, "txt");
    expect(txt).toBeDefined();
    expect(txt.value).toBe("Line 1\nLine 2");

    // Focus the widget to start blinking
    app.activeScreen.focusWidget(txt);
    expect(txt.focused).toBe(true);

    // Let's test typing a letter 'a' at the end of the text
    // Cursor is initially placed at the end: row 1, col 6 ("Line 2" has length 6)
    txt.handleKey({ key: "a" });
    expect(currentVal).toBe("Line 1\nLine 2a");
    expect(txt.cursorCol).toBe(7);

    // Let's test arrow keys
    // Left arrow
    txt.handleKey({ key: "left" });
    expect(txt.cursorCol).toBe(6);

    // Up arrow
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

    // Down arrow
    txt.handleKey({ key: "down" });
    expect(txt.cursorRow).toBe(1);
    expect(txt.cursorCol).toBe(6);

    // Home key
    txt.handleKey({ key: "home" });
    expect(txt.cursorCol).toBe(0);

    // End key
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

    app.stop();
  });

  test("TextArea scroll, mouse click, and unmount", async () => {
    let currentVal = "";
    const driver = new VTEDriver(20, 5);
    const app = new App(driver);

    render(
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
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const txt = findWidgetById(app.activeScreen, "txt2");
    app.activeScreen.focusWidget(txt);

    // Set large text to trigger scrolling
    txt.value = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10";
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Move cursor down to trigger scrollY change
    txt.handleKey({ key: "down" });
    txt.handleKey({ key: "down" });
    txt.handleKey({ key: "down" });
    txt.handleKey({ key: "down" });
    txt.handleKey({ key: "down" });
    expect(txt.scrollY).toBeGreaterThan(0);

    // Move cursor right beyond viewport width to trigger scrollX change
    txt.value = "A very long line";
    txt.cursorRow = 0;
    txt.cursorCol = 0;
    for (let i = 0; i < 15; i++) {
      txt.handleKey({ key: "right" });
    }
    expect(txt.scrollX).toBeGreaterThan(0);

    // Test mouse click positioning
    const rect = txt.getContentRect();
    txt.handleMouse({
      type: "press",
      button: "left",
      x: rect.x + 8,
      y: rect.y + 1,
    });
    expect(txt.cursorVisible).toBe(true);

    // Wait for cursor blink interval to trigger
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(txt.cursorVisible).toBe(false);

    // Unmount
    app.stop();
    txt.onUnmount();
  });
});
