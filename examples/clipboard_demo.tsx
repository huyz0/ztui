import { useState } from "react";
import { App } from "../src/core.ts";
import {
  Button,
  Dock,
  Footer,
  HBox,
  Header,
  Input,
  Label,
  TextArea,
  VBox,
  View,
} from "../src/react.ts";
import { canQuit, ExitButton } from "./exit-button.tsx";

/**
 * Demonstrates first-class text selection + clipboard:
 *   - Shift + Arrows / Home / End / PageUp / PageDown → extend a selection
 *   - Mouse drag → select; release copies the selection to the clipboard
 *   - Ctrl+C copies the selection (and quits when there is no selection)
 *   - Ctrl+V paste · Ctrl+A select all · Ctrl+Shift+C/X copy/cut (Kitty terminals)
 *   - Native terminal paste (Cmd/Ctrl+Shift+V) flows in via bracketed paste
 */
function ClipboardDemo() {
  const [name, setName] = useState("select-me-with-shift-arrows");
  const [code, setCode] = useState(
    "// Drag to select, then release to copy.\n" +
      "// Or Shift+Arrow to select, Ctrl+Shift+C to copy.\n" +
      "const greeting = 'paste me elsewhere with Ctrl+V';\n" +
      "console.log(greeting);",
  );
  const [clip, setClip] = useState("(nothing read yet)");

  const showClipboard = async () => {
    const text = (await App.instance?.driver.clipboard.get()) ?? "";
    setClip(text === "" ? "(clipboard empty)" : text);
  };

  return (
    <Dock style={{ background: "$background" }}>
      <Header>📋 ZTUI Copy / Paste & Selection Demo</Header>

      <Footer>
        Shift+Arrows: select · Drag+release: copy · Ctrl+C: copy selection
        {canQuit() ? " / quit" : ""} · Ctrl+V: paste · Ctrl+A: all
      </Footer>

      <HBox style={{ padding: 1 }}>
        <VBox style={{ width: "50%", border: "rounded", padding: 1 }}>
          <Label style={{ color: "$primary", bold: true }}>Single-line Input</Label>
          <View style={{ height: 1 }} />
          <Input
            style={{ height: 3, background: "$panel", color: "$accent" }}
            value={name}
            onChange={setName}
            placeholder="Type, then select with Shift+Arrows…"
          />

          <View style={{ height: 1 }} />
          <Button style={{ background: "$secondary", margin: 1 }} onClick={showClipboard}>
            Read framework clipboard
          </Button>
          <Label style={{ color: "$secondary" }}>Clipboard now holds:</Label>
          <Label style={{ color: "$warning" }}>{clip}</Label>

          <View style={{ height: 1 }} />
          <ExitButton style={{ margin: 1 }}>Exit (or Ctrl+C with no selection)</ExitButton>
        </VBox>

        <VBox style={{ width: "50%", border: "rounded", padding: 1 }}>
          <Label style={{ color: "$primary", bold: true }}>Multi-line TextArea</Label>
          <View style={{ height: 1 }} />
          <TextArea
            style={{ height: 12, background: "$surface", color: "$foreground" }}
            value={code}
            onChange={setCode}
            language="typescript"
            lineNumbers={true}
          />
        </VBox>
      </HBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const clipboardDemo: Demo = {
  id: "clipboard",
  title: "Clipboard",
  group: "Text",
  description: "OSC 52 copy/paste & selection.",
  Component: ClipboardDemo,
};
