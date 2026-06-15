import { describe, expect, test } from "vitest";
import { ChatInputWidget } from "./chat-input.ts";
import { InputWidget } from "./input.ts";
import { TextAreaWidget } from "./textarea.ts";

describe("control animation defaults", () => {
  test("input and textarea disable smooth caret by default", () => {
    expect(new InputWidget().smoothCaret).toBe(false);
    expect(new TextAreaWidget().smoothCaret).toBe(false);
  });

  test("chat input disables smooth caret by default", () => {
    const w = new ChatInputWidget();
    expect((w as any).caret.smooth).toBe(false);
  });
});
