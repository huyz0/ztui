/**
 * Global hotkeys: a small, framework-agnostic registry plus an imperative
 * façade, mirroring the toast store's shape. Any code — widgets, React
 * components, app bootstrap — registers named, grouped, described shortcuts;
 * the App dispatches key events against the active set; a mounted
 * `<HotkeyPalette>` subscribes to the store and renders the catalog as a
 * filterable overlay.
 *
 * The registry is dynamic on app context: each hotkey may declare the
 * context(s) it belongs to ("editor", "browser", …) and the app switches the
 * active context with {@link HotkeyRegistry.setContext} / `pushContext`.
 * Context-free hotkeys are always active.
 */

import type { KeyEvent } from "../driver/driver.ts";

/** Options to register a hotkey (via {@link useHotkey} or {@link HotkeyRegistry.register}). */
export interface HotkeyOptions {
  /**
   * Key spec, e.g. `"ctrl+p"`, `"ctrl+shift+s"`, `"alt+enter"`, `"f5"`, `"?"`.
   * Modifiers: `ctrl`, `alt` (terminal Meta/Alt), `shift`. Case and modifier
   * order are normalized, so `"Ctrl+Shift+P"` and `"shift+ctrl+p"` are the
   * same binding.
   */
  key: string;
  /** Short human name shown in the palette, e.g. "Save file". */
  name: string;
  /** One-line explanation shown next to the name. */
  description?: string;
  /** Palette section, e.g. "File", "Navigation". Defaults to `"General"`. */
  group?: string;
  /**
   * App context(s) this hotkey is active in. Omitted means global (active in
   * every context). Matched against {@link HotkeyRegistry.context}.
   */
  context?: string | readonly string[];
  /** Extra gate evaluated at dispatch and list time (e.g. "has selection"). */
  enabled?: () => boolean;
  /** Keep the hotkey functional but omit it from the palette listing. */
  hidden?: boolean;
  handler: (ev: KeyEvent) => void;
}

/** A registered hotkey (the {@link HotkeyOptions} plus assigned id and resolved key). */
export interface Hotkey extends HotkeyOptions {
  /** Unique registration id. */
  readonly id: number;
  /** Canonical normalized key, e.g. `"ctrl+shift+p"`. */
  readonly key: string;
  /** Display form of the key, e.g. `"Ctrl+Shift+P"`. */
  readonly keyLabel: string;
  /** Resolved group name (defaults to "General"). */
  readonly group: string;
}

/** A palette section: one group name and its hotkeys in registration order. */
export interface HotkeyGroup {
  /** Group name. */
  group: string;
  /** Hotkeys in the group, in registration order. */
  hotkeys: Hotkey[];
}

const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  return: "enter",
  " ": "space",
  spacebar: "space",
  del: "delete",
  pgup: "pageup",
  pgdn: "pagedown",
  meta: "alt", // terminals report Meta/Alt as one modifier
  option: "alt",
};

const isLetter = (s: string) => s.length === 1 && s.toLowerCase() !== s.toUpperCase();

/**
 * Normalize a key spec to its canonical form: `ctrl+alt+shift+<base>`, base
 * lowercased, aliases resolved. For single non-letter characters (`?`, `/`)
 * the shift modifier is dropped — the character already encodes it and
 * terminals report it inconsistently.
 */
export function normalizeKey(spec: string): string {
  const rawParts = spec.split("+");
  // A trailing "+" means the base key is a literal plus sign; a trailing " "
  // (single space part) means the space key.
  let base = spec.endsWith("+") ? "+" : (rawParts.pop()?.toLowerCase() ?? "");
  base = KEY_ALIASES[base] ?? base.trim();
  const parts = rawParts.map((p) => p.trim().toLowerCase()).filter((p) => p.length > 0);
  const mods = new Set(parts.map((p) => KEY_ALIASES[p] ?? p));
  let shift = mods.has("shift");
  if (base.length === 1) {
    if (isLetter(base)) base = base.toLowerCase();
    else shift = false; // "?" et al. carry their own shift
  }
  const out: string[] = [];
  if (mods.has("ctrl")) out.push("ctrl");
  if (mods.has("alt")) out.push("alt");
  if (shift) out.push("shift");
  out.push(base);
  return out.join("+");
}

/** Canonical key for an incoming driver {@link KeyEvent}. */
export function eventToKey(ev: KeyEvent): string {
  let base = ev.name === "" ? ev.key : ev.name;
  base = KEY_ALIASES[base] ?? base.toLowerCase();
  const mods: string[] = [];
  if (ev.ctrl) mods.push("ctrl");
  if (ev.meta) mods.push("alt");
  if (ev.shift && (base.length > 1 || isLetter(base))) mods.push("shift");
  return [...mods, base].join("+");
}

/** Pretty display label for a canonical key: `ctrl+shift+p` → `Ctrl+Shift+P`. */
export function formatKeyLabel(canonical: string): string {
  return canonical
    .split("+")
    .map((part) =>
      part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("+");
}

/**
 * Whether a key may fire while a text control is focused. Modified keys and
 * function keys can't be ordinary typing, so they dispatch before the focused
 * widget; bare keys (a single letter, `?`, `enter`…) only dispatch after the
 * focus chain declined the event, so hotkeys never eat input.
 */
export function isPriorityKey(canonical: string): boolean {
  if (canonical.includes("ctrl+") || canonical.includes("alt+")) return true;
  const base = canonical.split("+").pop() ?? "";
  return /^f\d{1,2}$/.test(base);
}

/** Case-insensitive match over key label, name, description, and group. */
export function matchesFilter(hotkey: Hotkey, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack =
    `${hotkey.keyLabel} ${hotkey.name} ${hotkey.description ?? ""} ${hotkey.group}`.toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

/** @internal Options for {@link HotkeyRegistry.list}. */
export interface ListOptions {
  /** Include hotkeys not active in the current context. Defaults to `false`. */
  allContexts?: boolean;
  /** Include `hidden` hotkeys. Defaults to `false`. */
  includeHidden?: boolean;
  /** Free-text filter over key/name/description/group. */
  query?: string;
}

/** Process-wide registry of named, grouped, context-scoped hotkeys. Use {@link getInstance} or the {@link useHotkey} React hook. */
export class HotkeyRegistry {
  private static _instance: HotkeyRegistry | null = null;
  /** The shared singleton. */
  public static getInstance(): HotkeyRegistry {
    if (!HotkeyRegistry._instance) HotkeyRegistry._instance = new HotkeyRegistry();
    return HotkeyRegistry._instance;
  }
  /** Drop all registrations and contexts (test isolation). */
  public static reset(): void {
    HotkeyRegistry._instance = null;
  }

  private _hotkeys: readonly Hotkey[] = [];
  private contextStack: string[] = [];
  private listeners = new Set<() => void>();
  private nextId = 1;
  private _version = 0;

  /** Monotonic change counter — a stable snapshot for `useSyncExternalStore`. */
  public get version(): number {
    return this._version;
  }

  /** The active app context, or `null` when none is set. */
  public get context(): string | null {
    return this.contextStack[this.contextStack.length - 1] ?? null;
  }

  /** Replace the whole context stack with one context (or none). */
  public setContext(context: string | null): void {
    this.contextStack = context === null ? [] : [context];
    this.emit();
  }

  /** Enter a nested context (e.g. a modal flow); pair with {@link popContext}. */
  public pushContext(context: string): void {
    this.contextStack.push(context);
    this.emit();
  }

  /** Leave the innermost context entered with {@link pushContext}. */
  public popContext(): void {
    if (this.contextStack.length > 0) {
      this.contextStack.pop();
      this.emit();
    }
  }

  /** Subscribe to registry changes; returns an unsubscribe function. */
  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Register a hotkey; returns a disposer. Later registrations on the same key
   * win at dispatch time (and shadow rather than replace — disposing the newer
   * one restores the older).
   */
  public register(opts: HotkeyOptions): () => void {
    const key = normalizeKey(opts.key);
    const hotkey: Hotkey = {
      ...opts,
      id: this.nextId++,
      key,
      keyLabel: formatKeyLabel(key),
      group: opts.group ?? "General",
    };
    this._hotkeys = [...this._hotkeys, hotkey];
    this.emit();
    return () => {
      const next = this._hotkeys.filter((h) => h.id !== hotkey.id);
      if (next.length !== this._hotkeys.length) {
        this._hotkeys = next;
        this.emit();
      }
    };
  }

  /** True when `hotkey` is active in the current context. */
  private inContext(hotkey: Hotkey): boolean {
    if (hotkey.context === undefined) return true;
    const ctx = this.context;
    if (ctx === null) return false;
    const contexts = typeof hotkey.context === "string" ? [hotkey.context] : hotkey.context;
    return contexts.includes(ctx);
  }

  /** Hotkeys matching the options, in registration order. */
  public list(opts: ListOptions = {}): Hotkey[] {
    return this._hotkeys.filter(
      (h) =>
        (opts.allContexts || this.inContext(h)) &&
        (opts.includeHidden || !h.hidden) &&
        (opts.query === undefined || matchesFilter(h, opts.query)) &&
        (h.enabled === undefined || h.enabled()),
    );
  }

  /** {@link list}, sectioned by group (groups in first-appearance order). */
  public groups(opts: ListOptions = {}): HotkeyGroup[] {
    const byGroup = new Map<string, Hotkey[]>();
    for (const h of this.list(opts)) {
      const bucket = byGroup.get(h.group);
      if (bucket) bucket.push(h);
      else byGroup.set(h.group, [h]);
    }
    return [...byGroup.entries()].map(([group, hotkeys]) => ({ group, hotkeys }));
  }

  /**
   * Dispatch a key event against the active hotkeys. `phase` selects which
   * bindings are eligible: `"priority"` (called before the focused widget)
   * fires only modified/function keys; `"fallback"` (after the focus chain
   * declined) fires the rest. Returns true and marks the event handled when a
   * hotkey ran. The most recently registered match wins.
   */
  public dispatch(ev: KeyEvent, phase: "priority" | "fallback"): boolean {
    const key = eventToKey(ev);
    if (isPriorityKey(key) !== (phase === "priority")) return false;
    for (let i = this._hotkeys.length - 1; i >= 0; i--) {
      const h = this._hotkeys[i];
      if (h.key !== key || !this.inContext(h)) continue;
      if (h.enabled && !h.enabled()) continue;
      h.handler(ev);
      ev.handled = true;
      return true;
    }
    return false;
  }

  private emit(): void {
    this._version++;
    for (const cb of this.listeners) cb();
  }
}

const reg = () => HotkeyRegistry.getInstance();

/**
 * Imperative hotkey API.
 *
 * ```ts
 * const dispose = hotkeys.register({
 *   key: "ctrl+s",
 *   name: "Save",
 *   description: "Write the current buffer to disk",
 *   group: "File",
 *   handler: () => save(),
 * });
 * hotkeys.setContext("editor"); // activate editor-scoped bindings
 * ```
 */
export const hotkeys = {
  /** Register a hotkey; returns a disposer. */
  register: (opts: HotkeyOptions): (() => void) => reg().register(opts),
  /** Active hotkeys matching the options. */
  list: (opts?: ListOptions): Hotkey[] => reg().list(opts),
  /** Active hotkeys grouped by section. */
  groups: (opts?: ListOptions): HotkeyGroup[] => reg().groups(opts),
  /** Replace the context stack with one context (or none). */
  setContext: (context: string | null): void => reg().setContext(context),
  /** Enter a nested context. */
  pushContext: (context: string): void => reg().pushContext(context),
  /** Leave the innermost context. */
  popContext: (): void => reg().popContext(),
  /** The active context, or null. */
  get context(): string | null {
    return reg().context;
  },
};
