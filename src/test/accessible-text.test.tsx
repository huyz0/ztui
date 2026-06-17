import { describe, expect, test } from "vitest";
import { Button, Checkbox, Input, Label, VBox } from "../react.ts";
import { mountApp } from "./harness.tsx";

describe("Screen.toAccessibleText", () => {
  test("renders a semantic, indented snapshot of meaningful widgets", async () => {
    const { screen } = await mountApp(
      <VBox>
        <Label>Settings</Label>
        <Checkbox label="Enable" checked />
        <Button>Save</Button>
      </VBox>,
      { cols: 30, rows: 10 },
    );
    const text = screen.toAccessibleText();
    expect(text).toContain('label: "Settings"');
    expect(text).toContain('checkbox: "Enable"');
    expect(text).toContain("[checked]");
    expect(text).toContain('button: "Save"');
  });

  test("reports a control's value and focus state", async () => {
    const { screen, findById } = await mountApp(
      <VBox>
        <Input id="name" value="Ada" />
      </VBox>,
      { cols: 30, rows: 6 },
    );
    const input = findById("name");
    if (input) screen.focusWidget(input);
    const text = screen.toAccessibleText();
    expect(text).toContain("=Ada");
    expect(text).toContain("[focused]");
  });

  test("skips anonymous layout containers", async () => {
    const { screen } = await mountApp(
      <VBox>
        <VBox>
          <Label>Deep</Label>
        </VBox>
      </VBox>,
      { cols: 20, rows: 6 },
    );
    const lines = screen.toAccessibleText().split("\n").filter(Boolean);
    // Only the label is meaningful; the nested vboxes don't each emit a line.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('label: "Deep"');
  });
});
