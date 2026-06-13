// Demonstrates the global hotkey system:
//   • hotkeys.register — named, described, grouped bindings (imperative API).
//   • useHotkey       — component-scoped registration with auto-cleanup.
//   • Contexts        — switch between "editor" / "browser" and watch the
//                       active bindings (and the palette listing) change.
//   • <HotkeyPalette> — Ctrl+Space opens a filterable, grouped command list.
import { useState } from "react";
import { hotkeys, toast } from "../src/core.ts";
import { HBox, Header, HotkeyPalette, Label, ToastHost, useHotkey, VBox } from "../src/react.ts";

// App-lifetime bindings registered once, outside React.
hotkeys.register({
  key: "ctrl+s",
  name: "Save",
  description: "Write the current buffer to disk",
  group: "File",
  handler: () => toast.success("Saved!"),
});
hotkeys.register({
  key: "ctrl+o",
  name: "Open",
  description: "Open a file picker",
  group: "File",
  handler: () => toast.info("Open file…"),
});
hotkeys.register({
  key: "ctrl+b",
  name: "Toggle bold",
  description: "Only active in the editor context",
  group: "Format",
  context: "editor",
  handler: () => toast.show({ message: "Bold toggled (editor-only)" }),
});
hotkeys.register({
  key: "ctrl+r",
  name: "Reload page",
  description: "Only active in the browser context",
  group: "Navigation",
  context: "browser",
  handler: () => toast.show({ message: "Reloading (browser-only)" }),
});

function HotkeysDemo() {
  const [context, setContext] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const switchContext = (ctx: string | null) => {
    hotkeys.setContext(ctx);
    setContext(ctx);
  };

  // Component-scoped hotkeys: registered on mount, removed on unmount, and the
  // handlers see fresh state without re-registering.
  useHotkey({
    key: "ctrl+up",
    name: "Increment",
    description: "Bump the counter",
    group: "Counter",
    handler: () => setCount((c) => c + 1),
  });
  useHotkey({
    key: "ctrl+down",
    name: "Decrement",
    description: "Lower the counter (disabled at zero)",
    group: "Counter",
    enabled: () => count > 0,
    handler: () => setCount((c) => c - 1),
  });
  useHotkey({
    key: "f2",
    name: "Editor context",
    description: "Activate editor-scoped bindings",
    group: "Context",
    handler: () => switchContext("editor"),
  });
  useHotkey({
    key: "f3",
    name: "Browser context",
    description: "Activate browser-scoped bindings",
    group: "Context",
    handler: () => switchContext("browser"),
  });
  useHotkey({
    key: "f4",
    name: "No context",
    description: "Deactivate every context-scoped binding",
    group: "Context",
    handler: () => switchContext(null),
  });

  return (
    <VBox style={{ padding: 1 }}>
      <Header>Hotkeys demo</Header>
      <Label style={{ bold: true, color: "$primary", margin: { top: 1 } }}>
        Press Ctrl+Space to open the command palette.
      </Label>
      <HBox style={{ margin: { top: 1 } }}>
        <Label>Active context: </Label>
        <Label style={{ bold: true, color: "$success" }}>{context ?? "(none)"}</Label>
        <Label style={{ dim: true }}> — F2 editor · F3 browser · F4 none</Label>
      </HBox>
      <HBox>
        <Label>Counter: </Label>
        <Label style={{ bold: true, color: "$accent" }}>{String(count)}</Label>
        <Label style={{ dim: true }}> — Ctrl+Up / Ctrl+Down</Label>
      </HBox>
      <Label style={{ dim: true, margin: { top: 1 } }}>
        Try Ctrl+S, Ctrl+O anywhere; Ctrl+B only works in the editor context.
      </Label>
      <ToastHost position="bottom-right" />
      <HotkeyPalette />
    </VBox>
  );
}

import type { Demo } from "./gallery/types.ts";

export const hotkeysDemo: Demo = {
  id: "hotkeys",
  title: "Hotkeys",
  group: "Input",
  description: "Global hotkey palette & bindings.",
  Component: HotkeysDemo,
};
