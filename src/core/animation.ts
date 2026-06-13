// Type-only: avoids a runtime import of app.ts, which would form an evaluation
// cycle (app → screen → widget → animation → app) and leave Widget undefined
// when Screen extends it. The owner reaches its App structurally at call time.
import type { App } from "./app.ts";

/** Anything that can ask its owning app to repaint — every mounted widget. */
interface TickOwner {
  app?: App | null;
}

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
 *
 * The re-render is dispatched on the owner's own {@link App} (reached via
 * `owner.app`), so multiple live apps — tests, the web backend — each drive
 * their own tree. A detached owner (no app) is a no-op: there's nothing to
 * paint.
 */
export function requestAnimationTick(owner: TickOwner, ms: number): void {
  if (pending.has(owner)) return;
  pending.add(owner);
  const timer = setTimeout(
    () => {
      pending.delete(owner);
      owner.app?.queueRender();
    },
    Math.max(16, ms),
  );
  // Don't let a pending animation frame hold the process open (Node/Bun).
  (timer as { unref?: () => void }).unref?.();
}
