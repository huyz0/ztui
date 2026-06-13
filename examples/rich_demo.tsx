import { useState } from "react";
import {
  Button,
  Dock,
  Footer,
  HBox,
  Header,
  Label,
  Markdown,
  RichText,
  Syntax,
  VBox,
} from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";
import "../src/markdown.ts";
import "../src/syntax.ts";

function RichDemoApp() {
  const [tab, setTab] = useState<"markup" | "syntax" | "markdown">("markup");

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

## Mermaid Diagram
\`\`\`mermaid
graph TD
Start[Start Demo] --> Select[Select Tab]
Select -->|Markup| MarkupTab[Show markup details]
Select -->|Syntax| SyntaxTab[Show highlighted code]
Select -->|Markdown| MarkdownTab[Show rendered markdown]
\`\`\`
`;

  return (
    <Dock style={{ background: "$background" }}>
      <Header>🚀 ZTUI Rich Rendering Engine Demo</Header>
      <Footer>
        Switch tabs with the buttons │ Drag to select text, release to copy │ Exit to Quit
      </Footer>

      <HBox style={{ padding: 1 }}>
        {/* Navigation Sidebar */}
        <VBox style={{ width: "30%", border: "rounded", padding: 1 }}>
          <Button
            style={{
              background: tab === "markup" ? "$secondary" : "$panel",
              color: tab === "markup" ? "black" : "white",
              margin: 1,
            }}
            onClick={() => setTab("markup")}
          >
            [1] Markup Demo
          </Button>
          <Button
            style={{
              background: tab === "syntax" ? "$success" : "$panel",
              color: tab === "syntax" ? "black" : "white",
              margin: 1,
            }}
            onClick={() => setTab("syntax")}
          >
            [2] Syntax Demo
          </Button>
          <Button
            style={{
              background: tab === "markdown" ? "$warning" : "$panel",
              color: tab === "markdown" ? "black" : "white",
              margin: 1,
            }}
            onClick={() => setTab("markdown")}
          >
            [3] Markdown Demo
          </Button>

          <VBox style={{ flexGrow: 1 }} />
          <ExitButton style={{ margin: 1 }}>Exit App</ExitButton>
        </VBox>

        {/* Content Viewer Panel */}
        <VBox style={{ width: "70%", border: "rounded", padding: 1 }}>
          {tab === "markup" && (
            <VBox>
              <RichText style={{ color: "$primary", bold: true, align: "center" }}>
                [bold cyan]CONSOLE MARKUP DEMO[/]
              </RichText>
              <RichText>[bold]Bold Text:[/] [bold]Hello World[/]</RichText>
              <RichText>[italic]Italic Text:[/] [italic]This is slanted[/]</RichText>
              <RichText>[underline]Underlined Text:[/] [underline]Underline this line[/]</RichText>
              <RichText>
                [bold]Underline shapes:[/] [undercurl]undercurl[/], [double-underline]double[/],
                [dotted-underline]dotted[/], [dashed-underline]dashed[/]
              </RichText>
              <RichText>
                [bold]Coloured underlines:[/] [undercurl underline=red]misspeled[/], [undercurl
                underline=yellow]warning[/], [underline underline=$secondary]info[/]
              </RichText>
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
              <Label markup>
                [dim]Plain Label, [/][bold]markup[/][dim] prop:[/] [green]no[/] [undercurl
                underline=red]RichText[/] [green]needed[/]
              </Label>
            </VBox>
          )}

          {tab === "syntax" && (
            <VBox>
              <RichText style={{ color: "$success", bold: true }}>
                TypeScript Highlighting (Gutter Enabled):
              </RichText>
              <Syntax
                language="typescript"
                lineNumbers={true}
                style={{ border: "dashed", margin: 1 }}
              >
                {codeSnippet}
              </Syntax>
              <RichText style={{ color: "$warning", bold: true }}>Diff Highlighting:</RichText>
              <Syntax language="diff" lineNumbers={false} style={{ border: "dashed", margin: 1 }}>
                {diffSnippet}
              </Syntax>
            </VBox>
          )}

          {tab === "markdown" && <Markdown style={{ flexGrow: 1 }}>{mdText}</Markdown>}
        </VBox>
      </HBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const richDemo: Demo = {
  id: "rich",
  title: "Rich Text",
  group: "Text",
  description: "Styled rich text & syntax highlighting.",
  Component: RichDemoApp,
};
