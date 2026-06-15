import type { ReactNode } from "react";
import { afterEach } from "vitest";
import type { App } from "../core/app.ts";
import { HotkeyRegistry } from "../core/hotkeys.ts";
import { unmount } from "../react/reconciler.ts";
import { flush, type MountOptions, type MountResult, mountTestApp } from "../tools/app-mount.tsx";

export { flush } from "../tools/app-mount.tsx";
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
  // Drop the global hotkey registry singleton so handlers from this test's
  // (now unmounted) components can't linger and shadow the next test's — React
  // effect cleanups don't always flush synchronously on teardown.
  HotkeyRegistry.reset();
});

/** Awaits the microtask + macrotask queue so React commits and a render frame settle. */
/**
 * Polls `check` until it returns true, or throws after `timeout`. Prefer this
 * over a single fixed `flush`/`settle` for anything that settles on its own
 * schedule — a React effect firing, an async rasterize completing — so the test
 * isn't a flaky race against one short timer under CI load. `poke` runs before
 * each wait (e.g. `queueRender` to force a re-render and retry).
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
 * Renders `ui` into a fresh {@link App} backed by a {@link VTEDriver}, starts the
 * event loop, and returns the app plus query helpers. The app is auto-stopped in
 * an `afterEach`, so tests never need their own teardown.
 */
export async function mountApp(ui: ReactNode, opts: MountOptions = {}): Promise<MountResult> {
  const mounted = await mountTestApp(ui, opts);
  activeApps.add(mounted.app);
  activeContainers.add(mounted.container);
  return mounted;
}
