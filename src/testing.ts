/**
 * `@huyz0/ztui/testing` — the test harness the framework uses on itself, made
 * public so apps can test their own ztui UIs the same way.
 *
 * Runner-agnostic: it imports no test framework. {@link mountApp} renders a tree
 * into a real {@link App} on a headless {@link VTEDriver} (a scriptable xterm.js
 * backend — no TTY), and returns query helpers (`findById`, `text()`, `settle()`,
 * `cellAt`, plus the `app`/`driver`). Drive input with `driver.emit("key" | …)`.
 *
 * Wire teardown to your runner once — e.g. with Vitest/Jest:
 *
 * ```ts
 * import { afterEach } from "vitest";
 * import { mountApp, cleanupMountedApps } from "@huyz0/ztui/testing";
 * afterEach(cleanupMountedApps);
 *
 * test("clicking increments", async () => {
 *   const t = await mountApp(<Counter />);
 *   await t.settle();
 *   t.driver.emit("mouse", { type: "press", button: "left", x: 1, y: 1 });
 *   await t.settle();
 *   expect(t.text()).toContain("1");
 * });
 * ```
 */
import type { ReactNode } from "react";
import type { App } from "./core/app.ts";
import { HotkeyRegistry } from "./core/hotkeys.ts";
import { unmount } from "./react/reconciler.ts";
import { flush, type MountOptions, type MountResult, mountTestApp } from "./tools/app-mount.tsx";

export { VTEDriver } from "./test/vte-runner.ts";
export type { MountOptions, MountResult } from "./tools/app-mount.tsx";
export { flush, mountTestApp } from "./tools/app-mount.tsx";

// Apps mounted via `mountApp` are tracked so `cleanupMountedApps` can tear them
// down — stopping the event loop and unmounting the React tree — between tests,
// so a forgotten `app.stop()` can't leak timers/listeners or let a stale tree
// keep reacting to global stores.
const activeApps = new Set<App>();
const activeContainers = new Set<unknown>();

/**
 * Render `ui` into a fresh {@link App} on a {@link VTEDriver}, start the loop,
 * and return the app plus query helpers. The mount is tracked for
 * {@link cleanupMountedApps}.
 */
export async function mountApp(ui: ReactNode, opts: MountOptions = {}): Promise<MountResult> {
  const mounted = await mountTestApp(ui, opts);
  activeApps.add(mounted.app);
  activeContainers.add(mounted.container);
  return mounted;
}

/**
 * Stop and unmount every app created by {@link mountApp}, and reset the global
 * hotkey registry. Call from your runner's `afterEach` so tests don't leak.
 */
export function cleanupMountedApps(): void {
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
  HotkeyRegistry.reset();
}

/**
 * Poll `check` until it returns true, or throw after `timeout`. Prefer this over
 * a single fixed `settle` for anything that resolves on its own schedule (a React
 * effect, an async rasterize) so a test isn't a flaky race against one timer.
 * `poke` runs before each wait (e.g. `app.queueRender()` to force a retry).
 */
export async function waitFor(
  check: () => boolean,
  opts: { timeout?: number; interval?: number; poke?: () => void } = {},
): Promise<void> {
  const { timeout = 1000, interval = 10, poke } = opts;
  const start = Date.now();
  for (;;) {
    if (check()) return;
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor: condition not met within ${timeout}ms`);
    }
    poke?.();
    await flush(interval);
  }
}

/**
 * Find the sole widget instance of `className` (its concrete class name, e.g.
 * `"TableWidget"`) under `t.screen` — for reaching into a widget a test needs
 * the concrete instance of (to call its own methods/read its own state)
 * without threading an `id` through every fixture that mounts one. Throws if
 * none is found, so a rename of the widget class fails loudly instead of the
 * test silently operating on `undefined`.
 */
export function findWidgetByType<T>(
  t: { screen: { walk(fn: (n: unknown) => void): void } },
  className: string,
): T {
  let found: T | undefined;
  t.screen.walk((n: any) => {
    if (n?.constructor?.name === className) found = n as T;
  });
  if (!found) throw new Error(`${className} not found`);
  return found;
}
