import type { ReactNode } from "react";
import { afterEach } from "vitest";
import { App } from "../core/app.ts";
import type { Screen } from "../dom/screen.ts";
import type { Widget, WidgetStyles } from "../dom/widget.ts";
import type { TerminalCapabilities } from "../driver/driver.ts";
import { render, unmount } from "../react/reconciler.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { renderBufferToText } from "../render/html-renderer.ts";
import { VTEDriver } from "./vte-runner.ts";

export { VTEDriver } from "./vte-runner.ts";

// Apps mounted via `mountApp` are tracked here and torn down after each test so
// a forgotten `app.stop()` can't leak process listeners/timers between cases,
// and so a mounted React tree can't linger and keep reacting to global stores.
const activeApps = new Set<App>();
const activeContainers = new Set<unknown>();

afterEach(() => {
  for (const container of activeContainers) {
    try {
      unmount(container);
    } catch {
      // best-effort teardown
    }
  }
  activeContainers.clear();
  for (const app of activeApps) {
    try {
      app.stop();
    } catch {
      // best-effort teardown
    }
  }
  activeApps.clear();
});

/** Awaits the microtask + macrotask queue so React commits and a render frame settle. */
export async function flush(ms = 5): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface MountOptions {
  cols?: number;
  rows?: number;
  capabilities?: Partial<TerminalCapabilities>;
  /** Skip `app.run()` — useful when a test drives the lifecycle manually. */
  autoRun?: boolean;
  /** Style applied to the root screen before the first render (e.g. layout mode). */
  screenStyle?: WidgetStyles;
}

export interface MountResult {
  app: App;
  driver: VTEDriver;
  screen: Screen;
  /** The reconciler fiber container, for tests that re-render via `updateContainer`. */
  container: unknown;
  /**
   * Depth-first search for a widget by its `id`. Defaults to `any` for terse
   * test access to subclass fields; pass a type param for a checked result,
   * e.g. `findById<TextAreaWidget>("txt")`.
   */
  findById: <T extends Widget = any>(id: string) => T | undefined;
  /** Wait for renders/writes to settle, then flush the VTE write queue. */
  settle: (ms?: number) => Promise<void>;
  /** The most recently rendered frame buffer. */
  buffer: ScreenBuffer;
  /** The cell at (x, y) of the rendered buffer. */
  cellAt: (x: number, y: number) => ScreenBuffer["cells"][number][number];
  /** The rendered frame as plain text (one row per line). */
  text: () => string;
}

/**
 * Renders `ui` into a fresh {@link App} backed by a {@link VTEDriver}, starts the
 * event loop, and returns the app plus query helpers. The app is auto-stopped in
 * an `afterEach`, so tests never need their own teardown.
 *
 * This is the single canonical way to spin up the full
 * App ↔ React ↔ driver pipeline in a test; prefer it over hand-rolling the
 * `new VTEDriver` / `new App` / `render` / `run` / `sleep` dance.
 */
export async function mountApp(ui: ReactNode, opts: MountOptions = {}): Promise<MountResult> {
  const { cols = 80, rows = 24, capabilities, autoRun = true, screenStyle } = opts;
  const driver = new VTEDriver(cols, rows, capabilities);
  const app = new App(driver);
  activeApps.add(app);

  if (screenStyle) {
    app.activeScreen.style = { ...app.activeScreen.style, ...screenStyle };
  }

  const container = render(ui, app.activeScreen);
  activeContainers.add(container);
  if (autoRun) {
    app.run();
  }

  const findById = <T extends Widget = any>(id: string): T | undefined => {
    let found: T | undefined;
    app.activeScreen.walk((node) => {
      if ((node as Widget).id === id) found = node as T;
    });
    return found;
  };

  const settle = async (ms = 5): Promise<void> => {
    await flush(ms);
    await driver.waitWrite();
  };

  await settle();

  return {
    app,
    driver,
    screen: app.activeScreen,
    container,
    findById,
    settle,
    get buffer() {
      return app.buffer;
    },
    cellAt: (x: number, y: number) => app.buffer.cells[y][x],
    text: () => renderBufferToText(app.buffer),
  };
}
