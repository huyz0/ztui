import { describe, expect, test } from "vitest";
import { App, Markdown, RichText, render, Syntax, VBox } from "../index.ts";
import { VTEDriver } from "./vte-runner.ts";

describe("Rich Components Integration Tests", () => {
  test("RichText renders styled markup and handles alignment", async () => {
    const driver = new VTEDriver(40, 5, {
      glyphProtocol: false,
      graphicsProtocol: "none",
    });
    const app = new App(driver);

    render(
      <VBox>
        <RichText style={{ align: "left" }}>[bold]Bold[/] text</RichText>
        <RichText style={{ align: "center" }}>Center</RichText>
        <RichText style={{ align: "right" }}>Right</RichText>
        <RichText style={{ align: "left" }}></RichText> {/* Empty text */}
      </VBox>,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    // Verify drawing (minimum screen width is enforced to 80 by App)
    const buffer = (app as any).currentBuffer;

    // Line 0: "Bold text" left-aligned
    expect(buffer.cells[0][0].char).toBe("B");
    expect(buffer.cells[0][0].style.bold).toBe(true);

    // Line 1: "Center" centered on 80 columns
    // "Center" length is 6. Padding is (80-6)/2 = 37
    expect(buffer.cells[1][37].char).toBe("C");

    // Line 2: "Right" right-aligned
    // "Right" length is 5. Position should start at 80 - 5 = 75
    expect(buffer.cells[2][75].char).toBe("R");

    app.stop();
  });

  test("Syntax renders code block with line numbers and theme support", async () => {
    const driver = new VTEDriver(40, 15, {
      glyphProtocol: false,
      graphicsProtocol: "none",
    });
    const app = new App(driver);

    const tsCode = "const a = 12;\nconst b = 'str';";

    render(
      <VBox>
        <Syntax language="typescript" lineNumbers={true} theme="ansi_dark">
          {tsCode}
        </Syntax>
        <Syntax language="typescript" lineNumbers={false} theme="ansi_light">
          {"const x = true;"}
        </Syntax>
        <Syntax language="diff" lineNumbers={false}>
          {"- old line\n+ new line"}
        </Syntax>
        <Syntax language="unknown" lineNumbers={false}>
          {"plain text"}
        </Syntax>
      </VBox>,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    const buffer = (app as any).currentBuffer;

    // tsCode with line numbers: Line 0 should start with " 1 │ const a = 12;"
    // Width of gutter: max of line count 2 is 2 digits + 3 chars " │ " = 5 chars
    // Cells 0-4 are gutter " 1 │ "
    expect(buffer.cells[0][0].char).toBe(" ");
    expect(buffer.cells[0][1].char).toBe("1");
    expect(buffer.cells[0][2].char).toBe(" ");
    expect(buffer.cells[0][3].char).toBe("│");

    // Line 2: theme="ansi_light" no line numbers
    // const x = true;
    expect(buffer.cells[2][0].char).toBe("c");

    // Line 3: diff
    expect(buffer.cells[3][0].char).toBe("-");

    app.stop();
  });

  test("Markdown renders headers, lists, blockquotes, images, links and styles", async () => {
    const driver = new VTEDriver(50, 25, {
      glyphProtocol: false,
      graphicsProtocol: "none",
    });
    const app = new App(driver);

    const mdText = `# Header 1
> Blockquote text with **bold**
> - Item in blockquote
> # Header in blockquote
~~strikethrough~~ and [link](http://domain.com) and ![alt](img.png)
- bullet 1
1. ordered 1`;

    render(<Markdown theme="ansi_dark">{mdText}</Markdown>, app.activeScreen);

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    const buffer = (app as any).currentBuffer;

    // Line 0: Header 1
    expect(buffer.cells[0][0].char).toBe("H");

    // Line 1: Header 1 underline rule "━"
    expect(buffer.cells[1][0].char).toBe("━");

    // Line 3: Blockquote text
    expect(buffer.cells[3][0].char).toBe("▌");
    expect(buffer.cells[3][2].char).toBe("B"); // 'B' of Blockquote

    app.stop();
  });
});
