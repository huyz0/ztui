/**
 * Global motion preference. Continuous, ambient animations — the focus
 * "breathing" accent, the attention pulse — consult this so a user (or a test,
 * or a reduced-motion environment) can silence them to a static look without
 * touching every widget.
 *
 * Default: enabled for real apps, but **off under the test runner** so that
 * time-varying colours don't make snapshot/colour assertions flaky. It also
 * honours the conventional `NO_MOTION` / reduced-motion environment hints.
 */
function defaultEnabled(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  if (!env) return true;
  // Vitest sets VITEST; CI snapshot stability prefers the static look.
  if (env.VITEST || env.NODE_ENV === "test") return false;
  if (env.NO_MOTION || env.ZTUI_REDUCED_MOTION) return false;
  return true;
}

let enabled = defaultEnabled();

/** Global motion toggle/config — disable to make animations snap (respects reduced-motion). */
export const motion = {
  /** Whether continuous ambient animations should run. */
  get enabled(): boolean {
    return enabled;
  },
  /** Turn ambient motion on/off at runtime (e.g. an app setting, or a test). */
  set(value: boolean): void {
    enabled = value;
  },
  /** Restore the environment-derived default. */
  reset(): void {
    enabled = defaultEnabled();
  },
};
