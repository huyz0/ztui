/**
 * The single capability an animation tick needs from the owning app: a way to
 * request a repaint. Declared structurally (not as `App`) so this module has
 * **zero** dependency on the core/app layer — no import edge, type or runtime —
 * keeping the animation primitive at the bottom of the dependency graph.
 */
interface Repaintable {
  queueRender(reason?: string): void;
  /** Paint-only re-render that reuses the current layout, when available. */
  queueRepaint?(region?: { y: number; bottom: number } | null, reason?: string): void;
}

/** @internal Anything that can ask its owning app to repaint — every mounted widget. */
interface TickOwner {
  app?: Repaintable | null;
  /** Human-readable owner label for diagnostics (widget tag, component kind, etc.). */
  tagName?: string;
  /** The widget's laid-out region, used to scope a paint-only repaint's damage. */
  region?: { y: number; bottom: number };
}

/** Shared cosmetic repaint cadence (10fps by default) for terminal-friendly batching. */
export const COSMETIC_REPAINT_MS = 100;

interface CosmeticEntry {
  owner: TickOwner;
  reasons: Set<string>;
}

/**
 * Owners (widgets) with an animation frame booked, to the absolute time it is due
 * and whether it is paint-only. Keyed by identity so each animated widget drives
 * at most one pending tick regardless of how many times it renders per frame. If
 * any booking in a frame needs layout, it is upgraded to a full render (paint-
 * only can never mask a real layout change).
 *
 * A single shared timer fires every owner that is due in the *same* macrotask, so
 * their repaint requests coalesce into one frame (App.scheduleRender dedups
 * within a macrotask). Without this, N animated widgets on independent timers
 * drift out of phase and emit up to N frames per tick — which makes a
 * software-rendering terminal (e.g. Ghostty with no GPU under WSL2) repaint many
 * times per tick and peg the CPU. Same-cadence widgets re-book together inside
 * that single coalesced frame, so they stay phase-aligned thereafter.
 */
const pending = new Map<TickOwner, { at: number; paintOnly: boolean }>();
const cosmeticPending = new Map<Repaintable, CosmeticEntry[]>();
/** The one shared timer and the absolute time it is set to fire. */
let timer: ReturnType<typeof setTimeout> | null = null;
let timerAt = Number.POSITIVE_INFINITY;
let cosmeticTimer: ReturnType<typeof setTimeout> | null = null;
/** Owners due within this many ms of each other fire together (phase tolerance). */
const BATCH_SLOP_MS = 4;

/** (Re)arm the shared timer for the earliest pending due time. */
function reschedule(): void {
  let earliest = Number.POSITIVE_INFINITY;
  for (const v of pending.values()) if (v.at < earliest) earliest = v.at;
  if (earliest === Number.POSITIVE_INFINITY) {
    if (timer) clearTimeout(timer);
    timer = null;
    timerAt = Number.POSITIVE_INFINITY;
    return;
  }
  if (timer && timerAt <= earliest) return; // already firing soon enough
  if (timer) clearTimeout(timer);
  timerAt = earliest;
  const t = setTimeout(fireDue, Math.max(0, earliest - Date.now()));
  (t as { unref?: () => void }).unref?.();
  timer = t;
}

/** Fire every owner due now, synchronously, so their repaints coalesce to one frame. */
function flushCosmeticRepaints(): void {
  cosmeticTimer = null;
  for (const [app, entries] of cosmeticPending) {
    if (!app.queueRepaint) continue;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    const parts: string[] = [];
    for (const entry of entries) {
      const region = entry.owner.region;
      if (region) {
        top = Math.min(top, region.y);
        bottom = Math.max(bottom, region.bottom);
      }
      for (const reason of entry.reasons) parts.push(reason);
    }
    const merged = [...new Set(parts)].join(",");
    app.queueRepaint(
      Number.isFinite(top) && bottom > top ? { y: top, bottom } : null,
      `cosmetic-batch:${merged}`,
    );
  }
  cosmeticPending.clear();
}

export function requestCosmeticRepaint(owner: TickOwner, reason: string): void {
  const app = owner.app;
  if (!app) return;
  if (!app.queueRepaint) {
    app.queueRender(`cosmetic-batch:${reason}`);
    return;
  }
  const list = cosmeticPending.get(app) ?? [];
  const existing = list.find((entry) => entry.owner === owner);
  if (existing) existing.reasons.add(reason);
  else list.push({ owner, reasons: new Set([reason]) });
  cosmeticPending.set(app, list);
  if (cosmeticTimer) return;
  const t = setTimeout(flushCosmeticRepaints, COSMETIC_REPAINT_MS);
  (t as { unref?: () => void }).unref?.();
  cosmeticTimer = t;
}

function fireDue(): void {
  timer = null;
  timerAt = Number.POSITIVE_INFINITY;
  const cutoff = Date.now() + BATCH_SLOP_MS;
  const ready: { owner: TickOwner; paintOnly: boolean }[] = [];
  for (const [owner, v] of pending) {
    if (v.at <= cutoff) {
      ready.push({ owner, paintOnly: v.paintOnly });
      pending.delete(owner);
    }
  }
  for (const { owner, paintOnly } of ready) {
    const app = owner.app;
    if (!app) continue;
    const ownerLabel = owner.tagName ? `:${owner.tagName}` : "";
    if (paintOnly) {
      requestCosmeticRepaint(owner, `animation:paint-only${ownerLabel}`);
    } else {
      app.queueRender(`animation:layout${ownerLabel}`);
    }
  }
  reschedule();
}

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
  const at = Date.now() + Math.max(16, ms);
  const existing = pending.get(owner);
  if (existing) {
    // A tick is already booked; keep the soonest due time and never let a
    // coincident paint-only request downgrade a full render that's needed.
    if (at < existing.at) existing.at = at;
    if (!paintOnly) existing.paintOnly = false;
    reschedule();
    return;
  }
  pending.set(owner, { at, paintOnly });
  reschedule();
}
