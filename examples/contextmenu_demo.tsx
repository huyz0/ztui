import { useState } from "react";
import {
  Box,
  ContextMenu,
  Header,
  Label,
  type MenuItem,
  useContextMenu,
  VBox,
  View,
} from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";

const FILES = ["auth.ts", "server.py", "README.md", "config.json"];

function ContextMenuDemoApp() {
  const menu = useContextMenu();
  const [target, setTarget] = useState<string | null>(null);
  const [last, setLast] = useState("Right-click a file (or click it) for actions.");

  const items: MenuItem[] = [
    { label: "Open", icon: "📄", shortcut: "Enter" },
    { label: "Rename", icon: "✎", shortcut: "F2" },
    { label: "Copy path", icon: "⧉", shortcut: "Ctrl+C" },
    { label: "Duplicate", disabled: true },
    { separator: true },
    { label: "Delete", icon: "🗑", danger: true, shortcut: "Del" },
  ];

  return (
    <VBox style={{ padding: 1, height: "100%", background: "$background" }}>
      <Header>🗂 ZTUI Context Menu</Header>
      <View style={{ height: 1 }} />

      <VBox style={{ border: "rounded", padding: 1, background: "$surface", width: 40 }}>
        {FILES.map((f) => (
          <Box
            key={f}
            style={{ height: 1, padding: { left: 1 } }}
            onMouseDown={(ev) => {
              setTarget(f);
              menu.openAt(ev.x, ev.y);
            }}
          >
            <Label>{`  ${f}`}</Label>
          </Box>
        ))}
      </VBox>

      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>{last}</Label>

      <ContextMenu
        {...menu.props}
        items={items}
        menuStyle={{ minWidth: 24 }}
        onSelect={(item) => setLast(`${item.label} → ${target ?? "?"}`)}
      />

      <View style={{ height: 1 }} />
      <ExitButton style={{ margin: 0 }}>Exit</ExitButton>
    </VBox>
  );
}

import type { Demo } from "./gallery/types.ts";

export const contextMenuDemo: Demo = {
  id: "context-menu",
  title: "Context Menu",
  group: "Controls",
  description: "Right-click action menu: icons, shortcuts, separators, disabled and danger rows.",
  Component: ContextMenuDemoApp,
};
