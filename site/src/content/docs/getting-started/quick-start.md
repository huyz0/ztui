---
title: Quick Start
description: Build and run your first ztui app — a counter you can drive from the keyboard.
---

This walks through a complete, runnable app. Create `app.tsx`:

```tsx
// app.tsx
import { useState } from "react";
import { App } from "ztui";
import { Button, Label, render, VBox } from "ztui/react";

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <VBox style={{ width: 40, height: 10, align: "center", verticalAlign: "middle" }}>
      <Label style={{ bold: true, color: "cyan" }}>Count: {count}</Label>
      <Button onClick={() => setCount(count + 1)} style={{ background: "blue", color: "white" }}>
        Increment
      </Button>
    </VBox>
  );
}

// Mount the tree onto the App's screen, then start the render/event loop.
const app = new App();
render(<Counter />, app.activeScreen);
app.run();
```

Run it:

```bash
bun run app.tsx
```

Press `Tab` to focus the button, `Enter` / `Space` to increment, and `Ctrl+C` to quit.

## What just happened

1. **`render(<Counter />, app.activeScreen)`** mounts your React tree onto the
   App's root screen via the custom reconciler.
2. **`app.run()`** starts the event loop: it binds a `Driver` (the terminal
   `BunDriver` by default), probes terminal capabilities, and schedules frames.
3. State changes (`setCount`) re-render through React → the widget DOM → a fresh
   cell grid → an ANSI diff written to the terminal.

## Run it in a browser instead

The same tree renders to a browser `<canvas>` via the web backend — no code
changes, just a different `Driver`. See the [Architecture guide](/ztui/guides/architecture/)
for how the cell grid is handed off to each backend.

## Next steps

- [Architecture](/ztui/guides/architecture/) — the render pipeline and backends.
- More guides (layout, styling, theming), the widget gallery, and the React
  binding reference are coming as the docs expand.
