import { useState } from "react";
import {
  App,
  Button,
  Dock,
  Footer,
  HBox,
  Header,
  Markdown,
  RichText,
  render,
  Syntax,
  VBox,
} from "../src/index.ts";

function RichDemoApp() {
  const [tab, setTab] = useState<"markup" | "syntax" | "markdown">("markup");

  const handleExit = () => {
    App.instance?.stop();
    process.exit(0);
  };

  const codeSnippet = `// TypeScript Syntax Highlighting Demonstration
interface User {
  id: number;
  name: string;
  active: boolean;
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}`;

  const diffSnippet = `@@ -1,5 +1,6 @@
- const version = "0.1.0";
+ const version = "0.2.0";
  const projectName = "ztui";
+ // added rich text support
- // old code here`;

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
`;

  return (
    <Dock style={{ background: "#1e1e2e" }}>
      <Header>🚀 ZTUI Rich Rendering Engine Demo</Header>
      <Footer>Use buttons to switch tabs │ Press Exit to Quit</Footer>

      <HBox style={{ padding: 1 }}>
        {/* Navigation Sidebar */}
        <VBox style={{ width: "30%", border: "solid", padding: 1 }}>
          <Button
            style={{
              background: tab === "markup" ? "#89b4fa" : "#313244",
              color: tab === "markup" ? "black" : "white",
              margin: 1,
            }}
            onClick={() => setTab("markup")}
          >
            [1] Markup Demo
          </Button>
          <Button
            style={{
              background: tab === "syntax" ? "#a6e3a1" : "#313244",
              color: tab === "syntax" ? "black" : "white",
              margin: 1,
            }}
            onClick={() => setTab("syntax")}
          >
            [2] Syntax Demo
          </Button>
          <Button
            style={{
              background: tab === "markdown" ? "#f9e2af" : "#313244",
              color: tab === "markdown" ? "black" : "white",
              margin: 1,
            }}
            onClick={() => setTab("markdown")}
          >
            [3] Markdown Demo
          </Button>

          <VBox style={{ flexGrow: 1 }} />
          <Button style={{ background: "#f38ba8", color: "black", margin: 1 }} onClick={handleExit}>
            Exit App
          </Button>
        </VBox>

        {/* Content Viewer Panel */}
        <VBox style={{ width: "70%", border: "solid", padding: 1 }}>
          {tab === "markup" && (
            <VBox>
              <RichText style={{ color: "#cba6f7", bold: true, align: "center" }}>
                [bold cyan]CONSOLE MARKUP DEMO[/]
              </RichText>
              <RichText>[bold]Bold Text:[/] [bold]Hello World[/]</RichText>
              <RichText>[italic]Italic Text:[/] [italic]This is slanted[/]</RichText>
              <RichText>[underline]Underlined Text:[/] [underline]Underline this line[/]</RichText>
              <RichText>
                [red]Colored Text:[/] [red]Red[/], [green]Green[/], [yellow]Yellow[/], [blue]Blue[/]
              </RichText>
              <RichText>
                [bold yellow on magenta]Complex Styling:[/] Bold yellow text on magenta background!
              </RichText>
              <RichText>[reverse]Reversed Colors:[/] This text is reversed</RichText>
              <RichText>[dim]Dimmed Text:[/] This is a dimmed message</RichText>
              <RichText>[strikethrough]Strikethrough:[/] Crossed out text</RichText>
              <RichText>
                [link=https://github.com/huyz0/ztui]Hyperlink:[/]
                [link=https://github.com/huyz0/ztui]ztui Repository[/]
              </RichText>
            </VBox>
          )}

          {tab === "syntax" && (
            <VBox>
              <RichText style={{ color: "#a6e3a1", bold: true }}>
                TypeScript Highlighting (Gutter Enabled):
              </RichText>
              <Syntax
                language="typescript"
                lineNumbers={true}
                style={{ border: "dashed", margin: 1 }}
              >
                {codeSnippet}
              </Syntax>
              <RichText style={{ color: "#f9e2af", bold: true }}>Diff Highlighting:</RichText>
              <Syntax language="diff" lineNumbers={false} style={{ border: "dashed", margin: 1 }}>
                {diffSnippet}
              </Syntax>
            </VBox>
          )}

          {tab === "markdown" && (
            <VBox>
              <Markdown style={{ flexGrow: 1 }}>{mdText}</Markdown>
            </VBox>
          )}
        </VBox>
      </HBox>
    </Dock>
  );
}

const app = new App();
render(<RichDemoApp />, app.activeScreen);
app.run();
