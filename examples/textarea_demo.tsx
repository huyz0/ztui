import { useState } from "react";
import { Dock, Footer, HBox, Header, Input, Label, TextArea, VBox, View } from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";

function TextDemoApp() {
  const [inputText, setInputText] = useState("");
  const [editorText, setEditorText] = useState(
    "// Type TypeScript code here\nconst msg: string = 'Hello ZTUI!';\nconsole.log(msg);\n\nfunction add(a: number, b: number): number {\n  return a + b;\n}",
  );

  return (
    <Dock style={{ background: "$background" }}>
      <Header>🚀 ZTUI Rich Text Editor Demo</Header>

      <Footer>Tab: Cycle Focus │ Click: Position Cursor │ Press Exit to Quit</Footer>

      <HBox style={{ padding: 1 }}>
        {/* Left column: input fields */}
        <VBox style={{ width: "50%", border: "double", padding: 1 }}>
          <Label style={{ color: "$primary", bold: true }}>Single-line Input Widget</Label>
          <View style={{ height: 1 }} />

          <Label style={{ color: "$success" }}>Enter username:</Label>
          <Input
            style={{ height: 3, background: "$panel", color: "$accent" }}
            value={inputText}
            onChange={(val) => setInputText(val)}
            placeholder="Type your username..."
          />

          <View style={{ height: 2 }} />
          <Label style={{ color: "$secondary" }}>Current Input Value:</Label>
          <Label style={{ color: "$warning" }}>{inputText || "(empty)"}</Label>

          <View style={{ height: 4 }} />
          <ExitButton style={{ margin: 1 }}>Exit Application</ExitButton>
        </VBox>

        {/* Right column: Multi-line editor */}
        <VBox style={{ width: "50%", border: "double", padding: 1 }}>
          <Label style={{ color: "$primary", bold: true }}>Multiline Code Editor (TextArea)</Label>
          <View style={{ height: 1 }} />

          <TextArea
            style={{ height: 12, background: "$surface", color: "$foreground" }}
            value={editorText}
            onChange={(val) => setEditorText(val)}
            placeholder="Type code here..."
            language="typescript"
            lineNumbers={true}
          />

          <View style={{ height: 1 }} />
          <Label style={{ color: "$secondary" }}>
            Lines: {editorText.split("\n").length} │ Characters: {editorText.length}
          </Label>
        </VBox>
      </HBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const textareaDemo: Demo = {
  id: "textarea",
  title: "Text Area",
  group: "Text",
  description: "Multiline text editing.",
  Component: TextDemoApp,
};
