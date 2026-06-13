import { useState } from "react";
import { Spacing } from "../src/core.ts";
import {
  Button,
  Dock,
  Footer,
  HBox,
  Header,
  JSONUI,
  Label,
  Markdown,
  VBox,
  View,
} from "../src/react.ts";
import { ExitButton, quitHint } from "./exit-button.tsx";
import "../src/markdown.ts";

const MARKDOWN_PAYLOAD = `# 🤖 Generative AI Response

Here is a dynamically rendered markdown response containing an interactive TUI widget:

> **Generative UI Feature:**
> The button below is created inside a custom code fence block and routes actions to the parent.

\`\`\`ztui-button
{
  "id": "md-action-btn",
  "text": "Activate System (Markdown Widget)",
  "action": "activate-sys",
  "style": { "background": "$accent", "color": "black", "margin": {"top": 1, "bottom": 1} }
}
\`\`\`

Here is the YAML configuration that was processed:

\`\`\`yaml
app: ztui-service
version: 1.0.0
settings:
  theme: catppuccin-mocha
  interactive: true
  features:
    - markdown-streaming
    - json-generative-ui
\`\`\`

* Fully portable at TUI DOM level.
* Supports recursive custom layouts.
`;

const JSONUI_PAYLOAD = `{
  "type": "ztui-box",
  "id": "root-box",
  "style": { "layout": "vertical", "padding": {"top": 1, "bottom": 1} },
  "children": [
    {
      "type": "ztui-label",
      "id": "status-title",
      "text": "📊 Live Streaming UI Tree:"
    },
    {
      "type": "ztui-button",
      "id": "jsonui-btn",
      "text": "Approve Allocation (JSONUI Widget)",
      "action": "approve-alloc",
      "style": { "background": "$primary", "color": "black", "margin": {"top": 1} }
    }
  ]
}`;

function GenerativeUIApp() {
  const [mdText, setMdText] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [logs, setLogs] = useState<string[]>(["[System] Ready. Press Stream to begin."]);

  // Handle action event routing
  const handleAction = (name: string, data: any) => {
    setLogs((prev) => [
      `[Action] Triggered "${name}" from ID "${data.id}" (${data.type})`,
      ...prev.slice(0, 4),
    ]);
  };

  const startStreaming = () => {
    setMdText("");
    setJsonText("");
    setLogs((prev) => ["[System] Starting stream...", ...prev]);

    // Stream Markdown characters in chunks
    let mdIndex = 0;
    const mdInterval = setInterval(() => {
      if (mdIndex < MARKDOWN_PAYLOAD.length) {
        const nextChunk = MARKDOWN_PAYLOAD.substring(mdIndex, mdIndex + 8);
        setMdText((prev) => prev + nextChunk);
        mdIndex += 8;
      } else {
        clearInterval(mdInterval);
      }
    }, 40);

    // Stream JSONUI characters (to highlight partial JSON repairing)
    let jsonIndex = 0;
    const jsonInterval = setInterval(() => {
      if (jsonIndex < JSONUI_PAYLOAD.length) {
        // Stream in chunks of 5 characters for visual pacing
        const nextChunk = JSONUI_PAYLOAD.substring(jsonIndex, jsonIndex + 5);
        setJsonText((prev) => prev + nextChunk);
        jsonIndex += 5;
      } else {
        clearInterval(jsonInterval);
      }
    }, 50);
  };

  return (
    <Dock style={{ background: "$background" }}>
      <Header>✨ ZTUI Generative UI & Streaming Demo</Header>
      <Footer>Tab: Cycle Focus │ Click: Interact{quitHint(" │ ")}</Footer>

      <VBox style={{ padding: 1, height: "100%" }}>
        {/* Top Split Layout */}
        <HBox style={{ height: "70%" }}>
          {/* Left Column: Markdown Stream */}
          <VBox
            style={{ width: "50%", border: "double", padding: 1, margin: new Spacing(0, 1, 0, 0) }}
          >
            <Label style={{ color: "$secondary", bold: true }}>📖 Markdown Stream Panel</Label>
            <View style={{ height: 1 }} />
            <Markdown onAction={handleAction}>{mdText}</Markdown>
          </VBox>

          {/* Right Column: JSONUI Stream */}
          <VBox style={{ width: "50%", border: "double", padding: 1 }}>
            <Label style={{ color: "$success", bold: true }}>🧱 JSONUI Stream Panel</Label>
            <View style={{ height: 1 }} />
            <JSONUI onAction={handleAction}>{jsonText}</JSONUI>
          </VBox>
        </HBox>

        {/* Bottom Panel: Logs & Controls */}
        <HBox
          style={{ height: "30%", border: "rounded", padding: 1, margin: new Spacing(1, 0, 0, 0) }}
        >
          {/* Logs Output */}
          <VBox style={{ width: "70%" }}>
            <Label style={{ color: "$foreground", bold: true }}>📋 Action Log Console:</Label>
            {logs.map((log, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: log array is read-only prepend list
              <Label key={i} style={{ color: log.startsWith("[Action]") ? "$warning" : "$dimmed" }}>
                {log}
              </Label>
            ))}
          </VBox>

          {/* Controls */}
          <VBox style={{ width: "30%", padding: new Spacing(0, 0, 0, 2) }}>
            <Button
              style={{ background: "$success", margin: new Spacing(0, 0, 1, 0) }}
              onClick={startStreaming}
            >
              ▶ Start Stream
            </Button>
            <ExitButton>🛑 Exit App</ExitButton>
          </VBox>
        </HBox>
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const generativeUiDemo: Demo = {
  id: "generative-ui",
  title: "Generative UI",
  group: "Overview",
  description: "JSON-driven dynamic UI.",
  Component: GenerativeUIApp,
};
