/**
 * Global colour preference for the terminal render path. Mirrors {@link motion}:
 * a user, a test, or the conventional `NO_COLOR` environment hint can drop all
 * foreground/background colour, leaving only the monochrome text attributes
 * (bold, dim, italic, underline, strikethrough, reverse, hyperlinks).
 *
 * It gates only ANSI SGR emission in {@link styleToEscapeCodes}, which is exactly
 * what the `NO_COLOR` convention governs — non-terminal backends (web/canvas)
 * keep their own colour and never consult this.
 *
 * Default: colour on, unless the environment opts out. Per https://no-color.org
 * the presence of `NO_COLOR` (any value) disables colour; `ZTUI_NO_COLOR` is the
 * project-specific alias (matching `ZTUI_REDUCED_MOTION`). `FORCE_COLOR` wins
 * over both, so a pipeline can re-enable colour explicitly.
 */
function defaultEnabled(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  if (!env) return true;
  if (env.FORCE_COLOR != null && env.FORCE_COLOR !== "" && env.FORCE_COLOR !== "0") return true;
  // Presence disables, regardless of value (matches chalk/supports-color).
  if (env.NO_COLOR !== undefined) return false;
  if (env.ZTUI_NO_COLOR !== undefined) return false;
  return true;
}

let enabled = defaultEnabled();

/** Global colour toggle — disable to emit monochrome SGR (respects `NO_COLOR`). */
export const colorMode = {
  /** Whether foreground/background colour is emitted in terminal output. */
  get enabled(): boolean {
    return enabled;
  },
  /** Turn colour output on/off at runtime (e.g. an app setting, or a test). */
  set(value: boolean): void {
    enabled = value;
  },
  /** Restore the environment-derived default. */
  reset(): void {
    enabled = defaultEnabled();
  },
};
