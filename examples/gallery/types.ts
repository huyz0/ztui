import type { ComponentType } from "react";

/** Terminal capabilities a demo needs to render fully. */
export type DemoCapability = "graphics" | "glyph";

/**
 * A demo is just its UI (`Component`, returns JSX — no `App`, no `run()`) plus
 * metadata. Bootstrapping (which driver, TUI vs web, inspector port) is the
 * launcher's job (`run.tsx`), so the same demo runs standalone or inside the
 * gallery, on either backend, with no per-demo duplication.
 */
export interface Demo {
  /** Stable id; also the CLI handle (`bun run demo <id>`). */
  id: string;
  title: string;
  /** Sidebar grouping, e.g. "Data", "Media", "Layout". */
  group: string;
  description?: string;
  /** Capabilities the demo needs; the gallery warns when the backend lacks them. */
  requires?: DemoCapability[];
  /**
   * After the demo mounts, focus the first widget with this tag name (e.g.
   * `"table"`, `"tree"`) so the keyboard drives it without a Tab first — the
   * launcher's generalization of the per-demo "auto-focus" boilerplate. The
   * sentinel `"@first"` focuses the first focusable widget instead.
   */
  autoFocusTag?: string;
  Component: ComponentType;
}
