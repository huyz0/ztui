import { App } from "./app.ts";

/**
 * Owners (widgets) with an animation frame already booked. Keyed by identity so
 * each animated widget drives at most one pending timer regardless of how many
 * times it renders per frame.
 */
const pending = new Set<object>();

/**
 * Ask for a re-render roughly `ms` from now, on a macrotask. Animated widgets
 * must use this instead of calling `App.queueRender()` from `render()` — that
 * queues a microtask, and a render that always re-queues itself forms an
 * unbroken microtask chain that starves timers and I/O.
 */
export function requestAnimationTick(owner: object, ms: number): void {
  if (pending.has(owner)) return;
  pending.add(owner);
  const timer = setTimeout(
    () => {
      pending.delete(owner);
      App.instance?.queueRender();
    },
    Math.max(16, ms),
  );
  // Don't let a pending animation frame hold the process open (Node/Bun).
  (timer as { unref?: () => void }).unref?.();
}
