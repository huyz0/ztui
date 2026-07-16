import { describe, expect, test } from "vitest";
import { RichText, VBox } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";

describe("RichText", () => {
  test("renders styled markup and handles alignment", async () => {
    const { app } = await mountApp(
      <VBox>
        <RichText style={{ align: "left" }}>[bold]Bold[/] text</RichText>
        <RichText style={{ align: "center" }}>Center</RichText>
        <RichText style={{ align: "right" }}>Right</RichText>
        <RichText style={{ align: "left" }}></RichText> {/* Empty text */}
      </VBox>,
      {
        cols: 40,
        rows: 5,
        capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
      },
    );

    // Minimum screen width is enforced to 80 by App.
    const buffer = app.buffer;

    // Line 0: "Bold text" left-aligned.
    expect(buffer.cells[0][0].char).toBe("B");
    expect(buffer.cells[0][0].style.bold).toBe(true);

    // Line 1: "Center" centered on 80 columns. Length 6, padding (80-6)/2 = 37.
    expect(buffer.cells[1][37].char).toBe("C");

    // Line 2: "Right" right-aligned. Length 5, starts at 80 - 5 = 75.
    expect(buffer.cells[2][75].char).toBe("R");
  });
});
