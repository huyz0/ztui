import React, { useState } from "react";
import {
  App,
  Button,
  Dock,
  Footer,
  HBox,
  Header,
  Input,
  Label,
  VBox,
  View,
  render,
} from "../src/index.ts";

function DemoApp() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState("");

  const handleExit = () => {
    App.instance?.stop();
    process.exit(0);
  };

  return (
    <Dock style={{ background: "#1e1e2e" }}>
      {/* Header with sensible defaults */}
      <Header>🚀 ZTUI React Demo App</Header>

      {/* Footer with sensible defaults */}
      <Footer>Tab: Cycle Focus │ Click: Select │ Press Exit Button to Quit</Footer>

      {/* Main Split Layout */}
      <HBox style={{ padding: 1 }}>
        {/* Left Stats Column */}
        <VBox style={{ width: "50%", border: "double" }}>
          <Label style={{ color: "#f5e0dc" }}>Stats & Info</Label>
          <View style={{ height: 1 }} />
          <Label style={{ color: "#a6e3a1" }}>Current Count: {count}</Label>
          <Label style={{ color: "#f9e2af" }}>Input Text: {text || "(empty)"}</Label>
        </VBox>

        {/* Right Action Column */}
        <VBox style={{ width: "50%", border: "double", padding: 1 }}>
          <Label style={{ color: "#cba6f7" }}>Interactive Panel</Label>

          <Button
            style={{ height: 5, background: "#89b4fa", color: "black", margin: 1 }}
            onClick={() => setCount(count + 1)}
          >
            Click to Increment
          </Button>

          <Input
            style={{ height: 5, background: "#45475a", color: "#f5c2e7", margin: 1 }}
            value={text}
            onChange={(val) => setText(val)}
          />

          <Button
            style={{ height: 5, background: "#f38ba8", color: "black", margin: 1 }}
            onClick={handleExit}
          >
            Exit Application
          </Button>
        </VBox>
      </HBox>
    </Dock>
  );
}

// Instantiate and run the App
const app = new App();
render(<DemoApp />, app.activeScreen);
app.run({ inspectorPort: 8000 });
