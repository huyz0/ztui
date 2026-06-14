/**
 * Toast notifications: a small, framework-agnostic store plus an imperative
 * façade. A mounted `<ToastHost>` subscribes to the store and renders the toasts
 * as a stacked, non-modal overlay; the `toast` façade lets any code — event
 * handlers, async callbacks, code outside React — raise one.
 */

/** Toast severity, driving its icon and color. */
export type ToastLevel = "info" | "success" | "warn" | "error" | "generic";

/** Options for raising a toast via {@link toast.show}. */
export interface ToastOptions {
  /** Severity, driving the icon and color. Defaults to `generic`. */
  level?: ToastLevel;
  /** Optional bold heading shown above the message. */
  title?: string;
  /** The body text. */
  message: string;
  /** Milliseconds before auto-dismiss; `0` keeps it until dismissed. Defaults per level. */
  duration?: number;
}

/** A live toast as held by the {@link ToastManager}. */
export interface Toast {
  /** Unique id, used to {@link toast.dismiss} it. */
  readonly id: number;
  /** Severity. */
  readonly level: ToastLevel;
  /** Optional heading. */
  readonly title?: string;
  /** Body text. */
  readonly message: string;
  /** Resolved duration (ms); `0` means sticky. */
  readonly duration: number;
  /** Creation timestamp (ms epoch). */
  readonly createdAt: number;
}

/** Per-level auto-dismiss defaults; errors are sticky so they aren't missed. */
const DEFAULT_DURATIONS: Record<ToastLevel, number> = {
  info: 4000,
  success: 4000,
  warn: 6000,
  error: 0,
  generic: 4000,
};

/** Process-wide store of active toasts; `<ToastHost>` subscribes to render them. Prefer the {@link toast} façade. */
export class ToastManager {
  private static _instance: ToastManager | null = null;
  /** The shared singleton instance. */
  public static getInstance(): ToastManager {
    if (!ToastManager._instance) ToastManager._instance = new ToastManager();
    return ToastManager._instance;
  }

  private _toasts: readonly Toast[] = [];
  private listeners = new Set<() => void>();
  private nextId = 1;

  /** Current toasts, oldest first. Stable reference between changes. */
  public getToasts(): readonly Toast[] {
    return this._toasts;
  }

  /** Subscribe to changes; returns an unsubscribe function. */
  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Raise a toast; returns its id for later {@link dismiss}. */
  public notify(opts: ToastOptions): number {
    const id = this.nextId++;
    const level = opts.level ?? "generic";
    const toast: Toast = {
      id,
      level,
      title: opts.title,
      message: opts.message,
      duration: opts.duration ?? DEFAULT_DURATIONS[level],
      createdAt: Date.now(),
    };
    this._toasts = [...this._toasts, toast];
    this.emit();
    return id;
  }

  /** Remove the toast with `id`. */
  public dismiss(id: number): void {
    const next = this._toasts.filter((t) => t.id !== id);
    if (next.length !== this._toasts.length) {
      this._toasts = next;
      this.emit();
    }
  }

  /** Remove all toasts. */
  public clear(): void {
    if (this._toasts.length > 0) {
      this._toasts = [];
      this.emit();
    }
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }
}

const mgr = () => ToastManager.getInstance();
const at =
  (level: ToastLevel) => (message: string, opts?: Omit<ToastOptions, "level" | "message">) =>
    mgr().notify({ ...opts, level, message });

/**
 * Imperative toast API. Each level helper returns the new toast's id.
 *
 * ```ts
 * toast.info("Saved");
 * toast.error("Upload failed", { duration: 0 }); // sticky
 * const id = toast.warn("Reconnecting…");
 * toast.dismiss(id);
 * ```
 */
export const toast = {
  /** Raise a toast from full options; returns its id. */
  show: (opts: ToastOptions): number => mgr().notify(opts),
  /** Info toast. */
  info: at("info"),
  /** Success toast. */
  success: at("success"),
  /** Warning toast. */
  warn: at("warn"),
  /** Error toast (sticky by default). */
  error: at("error"),
  /** Neutral toast. */
  generic: at("generic"),
  /** Dismiss a toast by id. */
  dismiss: (id: number): void => mgr().dismiss(id),
  /** Dismiss all toasts. */
  clear: (): void => mgr().clear(),
};
