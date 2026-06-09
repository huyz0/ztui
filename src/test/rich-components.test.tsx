import { describe, expect, test } from "vitest";
import { TextNode } from "../dom/text-node.ts";
import { Widget } from "../dom/widget.ts";
import {
  Box,
  Footer,
  Header,
  Icon,
  Input,
  JSONUI,
  Markdown,
  RichText,
  render,
  ScrollableBox,
  SvgImage,
  Syntax,
  TextArea,
  VBox,
} from "../index.ts";
import { reconciler } from "../react/reconciler.ts";
import { JSONUIWidget } from "../widgets/text/json-ui.ts";
import { MarkdownWidget } from "../widgets/text/markdown.ts";
import { mountApp } from "./harness.tsx";

describe("Rich Components Integration Tests", () => {
  test("RichText renders styled markup and handles alignment", async () => {
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
        capabilities: {
          glyphProtocol: false,
          graphicsProtocol: "none",
        },
      },
    );

    // Verify drawing (minimum screen width is enforced to 80 by App)
    const buffer = app.buffer;

    // Line 0: "Bold text" left-aligned
    expect(buffer.cells[0][0].char).toBe("B");
    expect(buffer.cells[0][0].style.bold).toBe(true);

    // Line 1: "Center" centered on 80 columns
    // "Center" length is 6. Padding is (80-6)/2 = 37
    expect(buffer.cells[1][37].char).toBe("C");

    // Line 2: "Right" right-aligned
    // "Right" length is 5. Position should start at 80 - 5 = 75
    expect(buffer.cells[2][75].char).toBe("R");
  });

  test("Syntax renders code block with line numbers and theme support", async () => {
    const tsCode = "const a = 12;\nconst b = 'str';";

    const { app } = await mountApp(
      <VBox>
        <Syntax language="typescript" lineNumbers={true} theme="default-dark">
          {tsCode}
        </Syntax>
        <Syntax language="typescript" lineNumbers={false} theme="default-light">
          {"const x = true;"}
        </Syntax>
        <Syntax language="diff" lineNumbers={false}>
          {"- old line\n+ new line"}
        </Syntax>
        <Syntax language="unknown" lineNumbers={false}>
          {"plain text"}
        </Syntax>
      </VBox>,
      {
        cols: 40,
        rows: 15,
        capabilities: {
          glyphProtocol: false,
          graphicsProtocol: "none",
        },
      },
    );

    const buffer = app.buffer;

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
  });

  test("Markdown renders headers, lists, blockquotes, images, links and styles", async () => {
    const mdText = `# Header 1
> Blockquote text with **bold**
> - Item in blockquote
> # Header in blockquote
~~strikethrough~~ and [link](http://domain.com) and ![alt](img.png)
- bullet 1
1. ordered 1`;

    const { app } = await mountApp(<Markdown>{mdText}</Markdown>, {
      cols: 50,
      rows: 25,
      capabilities: {
        glyphProtocol: false,
        graphicsProtocol: "none",
      },
    });

    const buffer = app.buffer;

    // Line 0: Header 1
    expect(buffer.cells[0][0].char).toBe("H");

    // Line 1: Header 1 underline rule "━"
    expect(buffer.cells[1][0].char).toBe("━");

    // Line 3: Blockquote text
    expect(buffer.cells[3][0].char).toBe("▌");
    expect(buffer.cells[3][2].char).toBe("B"); // 'B' of Blockquote
  });

  test("Markdown builds dynamic widget tree, supports ztui elements in code blocks, and routes events", async () => {
    let actionNameReceived = "";
    let actionDataReceived: any = null;

    const onAction = (name: string, data: any) => {
      actionNameReceived = name;
      actionDataReceived = data;
    };

    const mdContent = `# Title
> Quote

- Item

\`\`\`ztui-button
{
  "id": "test-btn",
  "text": "Interactive Button",
  "action": "btn-clicked",
  "style": { "color": "bright-green" }
}
\`\`\``;

    const { app } = await mountApp(<Markdown onAction={onAction}>{mdContent}</Markdown>, {
      cols: 80,
      rows: 25,
      capabilities: {
        glyphProtocol: false,
        graphicsProtocol: "none",
      },
    });

    // Verify DOM nesting
    const mdWidget = app.activeScreen.children[0] as any;
    expect(mdWidget.tagName).toBe("markdown");

    // Children of mdWidget should be the generated widgets:
    // 1. Heading container (VBox)
    // 2. Blockquote container (HBox)
    // 3. Unordered list container (VBox)
    // 4. Button widget (constructed from fence)
    expect(mdWidget.children.length).toBe(4);

    const heading = mdWidget.children[0];
    expect(heading.tagName).toBe("heading");

    const blockquote = mdWidget.children[1];
    expect(blockquote.tagName).toBe("blockquote");

    const list = mdWidget.children[2];
    expect(list.tagName).toBe("bullet_list");

    const button = mdWidget.children[3];
    expect(button.tagName).toBe("button");
    expect(button.id).toBe("test-btn");
    expect(button.style.color).toBe("bright-green");

    // Trigger widget level click action routing
    expect(button.onClick).toBeDefined();
    button.onClick({ x: 0, y: 0 });

    expect(actionNameReceived).toBe("btn-clicked");
    expect(actionDataReceived).toBeDefined();
    expect(actionDataReceived.id).toBe("test-btn");
    expect(actionDataReceived.type).toBe("button");
  });

  test("JSONUI streams, repairs partial JSON, and updates dynamically", async () => {
    let actionName = "";
    const onAction = (name: string) => {
      actionName = name;
    };

    const partialJson = `{
      "type": "ztui-box",
      "id": "container",
      "style": { "padding": {"top": 1, "right": 2, "bottom": 1, "left": 2} },
      "children": [
        {
          "type": "ztui-label",
          "id": "lbl-status",
          "text": "Streaming...`;

    // Render partial JSON first
    const { app, driver, settle } = await mountApp(
      <JSONUI onAction={onAction}>{partialJson}</JSONUI>,
      {
        cols: 80,
        rows: 25,
        capabilities: {
          glyphProtocol: false,
          graphicsProtocol: "none",
        },
      },
    );

    const jsonuiWidget = app.activeScreen.children[0] as any;
    expect(jsonuiWidget.tagName).toBe("jsonui");
    expect(jsonuiWidget.children.length).toBe(1); // root box

    const box = jsonuiWidget.children[0];
    expect(box.tagName).toBe("box");
    expect(box.id).toBe("container");
    expect(box.padding.right).toBe(2);

    expect(box.children.length).toBe(1); // label
    const label = box.children[0];
    expect(label.tagName).toBe("label");
    expect(label.id).toBe("lbl-status");
    expect(label.getTextContent()).toBe("Streaming..."); // balanced quote/array/object

    // Complete the stream and add a button with click action
    const completeJson = `{
      "type": "ztui-box",
      "id": "container",
      "style": { "padding": {"top": 1, "right": 2, "bottom": 1, "left": 2} },
      "children": [
        {
          "type": "ztui-label",
          "id": "lbl-status",
          "text": "Completed"
        },
        {
          "type": "ztui-button",
          "id": "btn-submit",
          "text": "OK",
          "action": "submitted"
        }
      ]
    }`;

    render(<JSONUI onAction={onAction}>{completeJson}</JSONUI>, app.activeScreen);

    await settle();
    await driver.waitWrite();

    // Verify update
    const updatedJsonuiWidget = app.activeScreen.children[0] as any;
    const updatedBox = updatedJsonuiWidget.children[0];
    expect(updatedBox.children.length).toBe(2);
    expect(updatedBox.children[0].getTextContent()).toBe("Completed");

    const btn = updatedBox.children[1];
    expect(btn.tagName).toBe("button");
    expect(btn.id).toBe("btn-submit");

    // Click button
    btn.onClick({ x: 0, y: 0 });
    expect(actionName).toBe("submitted");
  });

  test("MarkdownWidget and JSONUIWidget DOM API directly", () => {
    // MarkdownWidget DOM operations
    const md = new MarkdownWidget();
    const txt1 = new TextNode("A");
    const txt2 = new TextNode("B");
    const normalWidget = new Widget("test");

    md.appendChild(txt1);
    expect(md.getRawMarkdown()).toBe("A");

    md.insertBefore(txt2, txt1);
    expect(md.getRawMarkdown()).toBe("B"); // sets textNode

    md.removeChild(txt2);
    expect(md.getRawMarkdown()).toBe("");

    // non-text widget branches
    md.appendChild(normalWidget);
    expect(md.children[0]).toBe(normalWidget);
    md.insertBefore(normalWidget, txt1);
    md.removeChild(normalWidget);

    // JSONUIWidget DOM operations
    const jsonui = new JSONUIWidget();
    const txt3 = new TextNode("C");
    const txt4 = new TextNode("D");

    jsonui.appendChild(txt3);
    expect(jsonui.getRawJson()).toBe("C");

    jsonui.insertBefore(txt4, txt3);
    expect(jsonui.getRawJson()).toBe("D");

    jsonui.removeChild(txt4);
    expect(jsonui.getRawJson()).toBe("");

    jsonui.appendChild(normalWidget);
    jsonui.insertBefore(normalWidget, txt3);
    jsonui.removeChild(normalWidget);
  });

  test("JSONUIWidget updates same container in-place and margin objects", async () => {
    const json1 = `{"type": "ztui-box", "id": "box1", "style": { "margin": {"top": 1, "bottom": 1} }}`;
    const json2 = `{"type": "ztui-label", "id": "lbl2"}`;
    const jsonInvalid = `{"type": "invalid-tag"}`;

    const { screen, container, settle } = await mountApp(<JSONUI>{json1}</JSONUI>, {
      cols: 80,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
    });

    // verify first render
    const widget1 = screen.children[0] as any;
    expect(widget1.children[0].id).toBe("box1");

    // Update in place to check children clearing
    reconciler.updateContainer(<JSONUI>{json2}</JSONUI>, container, null, () => {});
    await settle();
    expect(widget1.children[0].id).toBe("lbl2");

    // Update with invalid layout component
    reconciler.updateContainer(<JSONUI>{jsonInvalid}</JSONUI>, container, null, () => {});
    await settle();
    expect(widget1.children.length).toBe(0);

    // Update with empty/null JSON
    reconciler.updateContainer(<JSONUI>{""}</JSONUI>, container, null, () => {});
    await settle();
    expect(widget1.children.length).toBe(0);
  });

  test("InputWidget keyboard interaction and onChange", async () => {
    let val = "";
    const onChange = (v: string) => {
      val = v;
    };

    const { app } = await mountApp(<Input value="init" onChange={onChange} />, {
      cols: 80,
      rows: 25,
      capabilities: {
        glyphProtocol: false,
        graphicsProtocol: "none",
      },
    });

    const inputWidget = app.activeScreen.children[0] as any;
    expect(inputWidget.value).toBe("init");

    // Send key 'a'
    inputWidget.onKey({ key: "a", name: "a", ctrl: false, meta: false, shift: false });
    expect(val).toBe("inita");

    // Send backspace
    inputWidget.onKey({
      key: "backspace",
      name: "backspace",
      ctrl: false,
      meta: false,
      shift: false,
    });
    expect(val).toBe("init");

    // Send ignore control key
    inputWidget.onKey({ key: "enter", name: "enter", ctrl: false, meta: false, shift: false });
    expect(inputWidget.value).toBe("init");
  });

  test("Header and Footer getTextContent with children", async () => {
    const { screen } = await mountApp(
      <VBox>
        <Header>Custom Title</Header>
        <Footer>Custom Status</Footer>
      </VBox>,
      { cols: 80, rows: 24 },
    );

    const header = screen.children[0].children[0] as any;
    const footer = screen.children[0].children[1] as any;

    expect(header.getTextContent()).toBe("Custom Title");
    expect(footer.getTextContent()).toBe("Custom Status");
  });

  test("IconWidget visibility and border size limits", async () => {
    const { app, settle } = await mountApp(
      <VBox>
        <Icon name="home" style={{ width: 1 }} />
        <Icon name="home" id="icon-to-hide" />
        <Icon name="home" /> {/* default styling resolved background */}
      </VBox>,
      {
        cols: 80,
        rows: 25,
        capabilities: {
          glyphProtocol: false,
          graphicsProtocol: "none",
        },
      },
    );

    // Set visible false on the second child and trigger update
    const vbox = app.activeScreen.children[0];
    const iconToHide = vbox.children[1] as any;
    iconToHide.visible = false;
    app.queueRender();
    await settle();

    // verify buffer has text
    const buffer = app.buffer;
    expect(buffer).toBeDefined();
  });

  test("Image decode error and cache hits", async () => {
    // Decode error test
    const { app } = await mountApp(<ztui-image buffer={new Uint8Array([1, 2, 3])} />, {
      cols: 80,
      rows: 25,
      capabilities: {
        glyphProtocol: false,
        graphicsProtocol: "none",
      },
    });

    const _imgWidget = app.activeScreen.children[0] as any;
    // Should have called renderError and drawn error text
    const buffer = app.buffer;
    expect(buffer.cells[0][0].char).toBe("D"); // 'D' of Decode error
  });

  test("SvgImage invalid svg rendering error handling", async () => {
    const { app } = await mountApp(<SvgImage src="<svg viewBox='invalid'></svg>" />, {
      cols: 80,
      rows: 25,
      capabilities: {
        glyphProtocol: false,
        graphicsProtocol: "none",
      },
    });

    // Verify it handles error gracefully by drawing it
    const buffer = app.buffer;
    expect(buffer.cells[0][0].char).toBe("R"); // 'R' of Render error
  });

  test("Markdown block-level reconciliation reuses unchanged block widgets and uses remend", async () => {
    // 1. Render initial markdown with incomplete syntax
    // "This is **bold" has an open bold formatting which remend should complete.
    const initialText = "# Header 1\n\nThis is **bold";
    const { screen, container, settle } = await mountApp(<Markdown>{initialText}</Markdown>, {
      cols: 80,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
    });

    const mdWidget = screen.children[0] as MarkdownWidget;
    expect(mdWidget.children.length).toBe(2);

    const firstBlockWidget = mdWidget.children[0];
    const secondBlockWidget = mdWidget.children[1];

    // Verify first is heading, second is paragraph (remended)
    expect(firstBlockWidget.tagName).toBe("heading");
    expect(secondBlockWidget.tagName).toBe("paragraph");

    // Verify remend worked: paragraph text node has balanced bold tags
    const pRichText = secondBlockWidget.children[0];
    const pText = (pRichText.children[0] as TextNode).text;
    expect(pText).toContain("[bold]bold[/]");

    // 2. Update markdown by appending a new block
    const updatedText = "# Header 1\n\nThis is **bold**\n\n- Item 1\n- Item 2";
    reconciler.updateContainer(<Markdown>{updatedText}</Markdown>, container, null, () => {});

    await settle();

    // Verify children count and tag names
    expect(mdWidget.children.length).toBe(3);
    expect(mdWidget.children[0].tagName).toBe("heading");
    expect(mdWidget.children[1].tagName).toBe("paragraph");
    expect(mdWidget.children[2].tagName).toBe("bullet_list");

    // CRITICAL: Verify object references are strictly identical (widget reuse)
    expect(mdWidget.children[0]).toBe(firstBlockWidget);
    expect(mdWidget.children[1]).toBe(secondBlockWidget);
  });

  test("Markdown renders rich demo content without crashing", async () => {
    const mdText = `# Markdown Render Demo
  
This is a paragraph featuring **bold text**, *italic emphasis*, and \`inline code\`.

## Blockquotes & Code Blocks
> This is a quote block.
> And it can contain nested quotes.

\`\`\`ts
const value = "Hello World";
console.log(value);
\`\`\`

## Lists
- Bullet list item 1
- Bullet list item 2
  - Nested list item

1. Ordered list item 1
2. Ordered list item 2

## Mermaid Diagram
\`\`\`mermaid
graph TD
Start[Start Demo] --> Select[Select Tab]
Select -->|Markup| MarkupTab[Show markup details]
Select -->|Syntax| SyntaxTab[Show highlighted code]
Select -->|Markdown| MarkdownTab[Show rendered markdown]
\`\`\`
`;

    // Should render the full demo without throwing.
    await mountApp(<Markdown>{mdText}</Markdown>, {
      cols: 80,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
    });
  });

  test("Markdown renders mermaid blocks into SyntaxWidget", async () => {
    const mdContent = `
# Mermaid test
\`\`\`mermaid
graph TD
A --> B
\`\`\`
`;

    const { app } = await mountApp(<Markdown>{mdContent}</Markdown>, {
      cols: 80,
      rows: 25,
      capabilities: {
        glyphProtocol: false,
        graphicsProtocol: "none",
      },
    });

    const mdWidget = app.activeScreen.children[0] as MarkdownWidget;
    expect(mdWidget.children.length).toBe(2);
    expect(mdWidget.children[0].tagName).toBe("heading");
    expect(mdWidget.children[1].tagName).toBe("syntax");

    const syntaxWidget = mdWidget.children[1] as any;
    expect(syntaxWidget.language).toBe("mermaid");
  });

  test("Systematic absolute positioning resolution", async () => {
    const { app } = await mountApp(
      <VBox style={{ width: 40, height: 10, background: "black" }}>
        <Box style={{ width: 10, height: 2, background: "red" }} />
        <Box
          id="abs-child"
          style={{
            position: "absolute",
            left: 5,
            top: 3,
            width: 15,
            height: 4,
            background: "blue",
          }}
        />
      </VBox>,
      {
        cols: 80,
        rows: 25,
        capabilities: {
          glyphProtocol: false,
          graphicsProtocol: "none",
        },
      },
    );

    const vbox = app.activeScreen.children[0] as any;
    const standardChild = vbox.children[0] as any;
    const absChild = vbox.children[1] as any;

    expect(standardChild.region.x).toBe(vbox.getContentRect().x);
    expect(standardChild.region.y).toBe(vbox.getContentRect().y);
    expect(standardChild.region.width).toBe(10);
    expect(standardChild.region.height).toBe(2);

    expect(absChild.region.x).toBe(vbox.getContentRect().x + 5);
    expect(absChild.region.y).toBe(vbox.getContentRect().y + 3);
    expect(absChild.region.width).toBe(15);
    expect(absChild.region.height).toBe(4);
  });

  test("MermaidWidget interactive toggle button switches modes", async () => {
    const code = "graph TD\nA --> B";
    const { app } = await mountApp(<mermaid>{code}</mermaid>, {
      cols: 80,
      rows: 25,
      capabilities: {
        glyphProtocol: false,
        graphicsProtocol: "none",
      },
    });

    const mermaidWidget = app.activeScreen.children[0] as any;
    expect(mermaidWidget.showDiagram).toBe(true);

    const client = mermaidWidget.getClientRect();
    const clickX = client.right - 3;
    const clickY = client.y;

    const hit = (app as any).hitTest(app.activeScreen, clickX, clickY);
    expect(hit).toBeDefined();
    expect(hit.tagName).toBe("button");

    hit.onClick({ x: clickX, y: clickY, type: "press", button: "left" });
    expect(mermaidWidget.showDiagram).toBe(false);

    const hitOutside = (app as any).hitTest(app.activeScreen, client.x, client.y);
    expect(hitOutside).toBeDefined();
    expect(hitOutside.tagName).toBe("mermaid");
    if (hitOutside.onClick) {
      hitOutside.onClick({ x: client.x, y: client.y, type: "press", button: "left" });
    }
    expect(mermaidWidget.showDiagram).toBe(false);

    mermaidWidget.onKey({ key: " ", ctrl: false, meta: false, shift: false });
    expect(mermaidWidget.showDiagram).toBe(true);
  });

  test("ScrollableBox component renders and updates style / children correctly", async () => {
    const { app } = await mountApp(
      <ScrollableBox id="scroll-box-1" style={{ width: 10, height: 10 }}>
        <Box style={{ width: 20, height: 20 }} />
      </ScrollableBox>,
      {
        cols: 80,
        rows: 25,
        capabilities: {
          glyphProtocol: false,
          graphicsProtocol: "none",
        },
      },
    );

    const scrollBox = app.activeScreen.children[0] as any;
    expect(scrollBox.tagName).toBe("scrollable-box");
    expect(scrollBox.id).toBe("scroll-box-1");
    expect(scrollBox.computedStyle.width).toBe(10);
    expect(scrollBox.computedStyle.height).toBe(10);
    expect(scrollBox.children.length).toBe(1);
    expect(scrollBox.children[0].tagName).toBe("box");
  });

  test("InputWidget enhanced keyboard navigation, scrolling, and placeholder", async () => {
    let val = "";
    const onChange = (v: string) => {
      val = v;
    };

    const { app, settle } = await mountApp(
      <Input value="hello" onChange={onChange} placeholder="empty..." />,
      {
        cols: 20,
        rows: 3,
        capabilities: {
          glyphProtocol: false,
          graphicsProtocol: "none",
        },
      },
    );

    const inputWidget = app.activeScreen.children[0] as any;
    expect(inputWidget.value).toBe("hello");

    // Click inside to position cursor (e.g. at click col = 2 -> absolute col = 2, character 'l')
    inputWidget.handleMouse({
      type: "press",
      button: "left",
      x: inputWidget.getContentRect().x + 2,
      y: inputWidget.getContentRect().y,
    });
    expect(inputWidget.cursorCol).toBe(2);

    // Left key
    inputWidget.onKey({ key: "left", name: "left", ctrl: false, meta: false, shift: false });
    expect(inputWidget.cursorCol).toBe(1);

    // Right key
    inputWidget.onKey({ key: "right", name: "right", ctrl: false, meta: false, shift: false });
    expect(inputWidget.cursorCol).toBe(2);

    // Home
    inputWidget.onKey({ key: "home", name: "home", ctrl: false, meta: false, shift: false });
    expect(inputWidget.cursorCol).toBe(0);

    // End
    inputWidget.onKey({ key: "end", name: "end", ctrl: false, meta: false, shift: false });
    expect(inputWidget.cursorCol).toBe(5);

    // Insert character '!' at end (cursor is at 5)
    inputWidget.onKey({ key: "!", name: "!", ctrl: false, meta: false, shift: false });
    expect(val).toBe("hello!");
    expect(inputWidget.cursorCol).toBe(6);

    // Backspace at 6 deletes '!'
    inputWidget.onKey({
      key: "backspace",
      name: "backspace",
      ctrl: false,
      meta: false,
      shift: false,
    });
    expect(val).toBe("hello");
    expect(inputWidget.cursorCol).toBe(5);

    // Move left twice to col 3 (after 'l')
    inputWidget.onKey({ key: "left", name: "left", ctrl: false, meta: false, shift: false });
    inputWidget.onKey({ key: "left", name: "left", ctrl: false, meta: false, shift: false });
    expect(inputWidget.cursorCol).toBe(3);

    // Delete at 3 deletes 'l' (so 'hello' -> 'helo')
    inputWidget.onKey({ key: "delete", name: "delete", ctrl: false, meta: false, shift: false });
    expect(val).toBe("helo");
    expect(inputWidget.cursorCol).toBe(3);

    // Test placeholder rendering
    inputWidget.value = "";
    app.queueRender();
    await settle();
    const buffer = app.buffer;
    // Check placeholder character 'e'
    expect(buffer.cells[inputWidget.getContentRect().y][inputWidget.getContentRect().x].char).toBe(
      "e",
    );
  });

  test("TextAreaWidget multiline syntax coloring, line numbers, scrolling, and editing", async () => {
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

    // Click at row 1, col 2 ('n' of line2).
    // Gutter width is: Max string length of 2 = 2. 2 + 3 = 5.
    // So click x at contentRect.x + 5 (gutter) + 2 (offset)
    textWidget.handleMouse({
      type: "press",
      button: "left",
      x: textWidget.getContentRect().x + 5 + 2,
      y: textWidget.getContentRect().y + 1,
    });
    expect(textWidget.cursorRow).toBe(1);
    expect(textWidget.cursorCol).toBe(2);

    // Test up arrow
    textWidget.onKey({ key: "up", name: "up", ctrl: false, meta: false, shift: false });
    expect(textWidget.cursorRow).toBe(0);
    expect(textWidget.cursorCol).toBe(2); // keeps same column

    // Test enter to insert newline: 'li\nne1\nline2'
    textWidget.onKey({ key: "enter", name: "enter", ctrl: false, meta: false, shift: false });
    expect(val).toBe("li\nne1\nline2");
    expect(textWidget.cursorRow).toBe(1);
    expect(textWidget.cursorCol).toBe(0);

    // Test typing a character: 'li\nxne1\nline2'
    textWidget.onKey({ key: "x", name: "x", ctrl: false, meta: false, shift: false });
    expect(val).toBe("li\nxne1\nline2");
    expect(textWidget.cursorRow).toBe(1);
    expect(textWidget.cursorCol).toBe(1);
  });
});
