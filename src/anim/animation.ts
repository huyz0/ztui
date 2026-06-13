/**
 * The single capability an animation tick needs from the owning app: a way to
 * request a repaint. Declared structurally (not as `App`) so this module has
 * **zero** dependency on the core/app layer — no import edge, type or runtime —
 * keeping the animation primitive at the bottom of the dependency graph.
 */
interface Repaintable {
  queueRender(): void;
}

/** Anything that can ask its owning app to repaint — every mounted widget. */
interface TickOwner {
  app?: Repaintable | null;
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
