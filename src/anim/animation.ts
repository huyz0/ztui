/**
 * The single capability an animation tick needs from the owning app: a way to
 * request a repaint. Declared structurally (not as `App`) so this module has
 * **zero** dependency on the core/app layer — no import edge, type or runtime —
 * keeping the animation primitive at the bottom of the dependency graph.
 */
interface Repaintable {
  queueRender(): void;
  /** Paint-only re-render that reuses the current layout, when available. */
  queueRepaint?(region?: { y: number; bottom: number } | null): void;
}

/** @internal Anything that can ask its owning app to repaint — every mounted widget. */
interface TickOwner {
  app?: Repaintable | null;
  /** The widget's laid-out region, used to scope a paint-only repaint's damage. */
  region?: { y: number; bottom: number };
}

/**
 * Owners (widgets) with an animation frame already booked, mapped to whether the
 * pending frame is paint-only. Keyed by identity so each animated widget drives
 * at most one pending timer regardless of how many times it renders per frame.
 * If any booking in a frame needs layout, the frame is upgraded to a full
 * render (paint-only can never mask a real layout change).
 */
const pending = new Map<object, boolean>();

/**
 * Ask for a re-render roughly `ms` from now, on a macrotask. Animated widgets
 * must use this instead of calling `App.queueRender()` from `render()` — that
 * queues a microtask, and a render that always re-queues itself forms an
 * unbroken microtask chain that starves timers and I/O.
 *
 * `paintOnly` marks an animation that changes only appearance, never geometry
 * (a breathing focus ring, an attention glow, a spinner glyph, a color tween).
 * Such ticks request a {@link Repaintable.queueRepaint}, which reuses the prior
 * layout instead of relaying out the whole tree every frame — the difference
 * between a focused screen idling cheaply and re-measuring everything ~60×/s.
 * Leave it false for scalar tweens that may drive size/scroll.
 *
 * The re-render is dispatched on the owner's own {@link App} (reached via
 * `owner.app`), so multiple live apps — tests, the web backend — each drive
 * their own tree. A detached owner (no app) is a no-op: there's nothing to
 * paint.
 */
export function requestAnimationTick(owner: TickOwner, ms: number, paintOnly = false): void {
  const existing = pending.get(owner);
  if (existing !== undefined) {
    // A frame is already booked; upgrade it to a full render if this caller
    // needs layout, so a coincident paint-only request can't suppress it.
    if (!paintOnly && existing) pending.set(owner, false);
    return;
  }
  pending.set(owner, paintOnly);
  const timer = setTimeout(
    () => {
      const wasPaintOnly = pending.get(owner) ?? false;
      pending.delete(owner);
      const app = owner.app;
      if (!app) return;
      // Scope a paint-only tick's damage to the animating widget's own rows, so
      // a single spinner/glow doesn't repaint the whole screen each frame.
      if (wasPaintOnly && app.queueRepaint) app.queueRepaint(owner.region ?? null);
      else app.queueRender();
    },
    Math.max(16, ms),
  );
  // Don't let a pending animation frame hold the process open (Node/Bun).
  (timer as { unref?: () => void }).unref?.();
}
