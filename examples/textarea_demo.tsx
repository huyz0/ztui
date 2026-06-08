import { useState } from "react";
import {
  App,
  Button,
  Dock,
  Footer,
  HBox,
  Header,
  Input,
  Label,
  render,
  TextArea,
  VBox,
  View,
} from "../src/index.ts";

function TextDemoApp() {
  const [inputText, setInputText] = useState("");
  const [editorText, setEditorText] = useState(
    "// Type TypeScript code here\nconst msg: string = 'Hello ZTUI!';\nconsole.log(msg);\n\nfunction add(a: number, b: number): number {\n  return a + b;\n}",
  );

  const handleExit = () => {
    App.instance?.stop();
    process.exit(0);
  };

  return (
    <Dock style={{ background: "#1e1e2e" }}>
      <Header>🚀 ZTUI Rich Text Editor Demo</Header>

      <Footer>Tab: Cycle Focus │ Click: Position Cursor │ Press Exit to Quit</Footer>

      <HBox style={{ padding: 1 }}>
        {/* Left column: input fields */}
        <VBox style={{ width: "50%", border: "double", padding: 1 }}>
          <Label style={{ color: "#cba6f7", bold: true }}>Single-line Input Widget</Label>
          <View style={{ height: 1 }} />

          <Label style={{ color: "#a6e3a1" }}>Enter username:</Label>
          <Input
            style={{ height: 3, background: "#313244", color: "#f5c2e7" }}
            value={inputText}
            onChange={(val) => setInputText(val)}
            placeholder="Type your username..."
          />

          <View style={{ height: 2 }} />
          <Label style={{ color: "#89b4fa" }}>Current Input Value:</Label>
          <Label style={{ color: "#f9e2af" }}>{inputText || "(empty)"}</Label>

          <View style={{ height: 4 }} />
          <Button style={{ background: "#f38ba8", color: "black", margin: 1 }} onClick={handleExit}>
            Exit Application
          </Button>
        </VBox>

        {/* Right column: Multi-line editor */}
        <VBox style={{ width: "50%", border: "double", padding: 1 }}>
          <Label style={{ color: "#cba6f7", bold: true }}>Multiline Code Editor (TextArea)</Label>
          <View style={{ height: 1 }} />

          <TextArea
            style={{ height: 12, background: "#181825", color: "#cdd6f4" }}
            value={editorText}
            onChange={(val) => setEditorText(val)}
            placeholder="Type code here..."
            language="typescript"
            lineNumbers={true}
          />

          <View style={{ height: 1 }} />
          <Label style={{ color: "#89b4fa" }}>
            Lines: {editorText.split("\n").length} │ Characters: {editorText.length}
          </Label>
        </VBox>
      </HBox>
    </Dock>
  );
}

const app = new App();
render(<TextDemoApp />, app.activeScreen);
app.run();
