import { appendFileSync, writeFileSync } from "node:fs";

/**
 * Centralized logging for ztui.
 *
 * Why a dedicated logger instead of `console.*`?
 *   - While a TUI is running it owns the terminal screen. Writing to stdout or
 *     stderr corrupts the rendered frame, so all diagnostics must go to a file.
 *   - A single, consistent, timestamped + leveled + scoped format makes the log
 *     greppable for humans and parseable for LLM agents trying to debug a run.
 *   - Logging must never throw or crash the app, so every write is guarded.
 *
 * Configuration (env vars, read once at startup; override with `configure`):
 *   - ZTUI_LOG_LEVEL = debug | info | warn | error | silent   (default: info)
 *   - ZTUI_LOG_FILE  = path to the log file                    (default: ztui.log)
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function parseEnvLevel(): LogLevel {
  const raw = (process.env.ZTUI_LOG_LEVEL || "").toLowerCase();
  return raw in LEVEL_ORDER ? (raw as LogLevel) : "info";
}

/** Render an arbitrary log payload into a single readable string. */
function serialize(data: unknown): string {
  if (data === undefined) return "";
  if (data instanceof Error) {
    return data.stack ? `\n${data.stack}` : `${data.name}: ${data.message}`;
  }
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/** @internal Diagnostic logger; use the shared {@link logger} instance. */
class Logger {
  private filePath = process.env.ZTUI_LOG_FILE || "ztui.log";
  private threshold = LEVEL_ORDER[parseEnvLevel()];

  /** Override the file path and/or minimum level at runtime. */
  public configure(opts: { filePath?: string; level?: LogLevel }): void {
    if (opts.filePath) this.filePath = opts.filePath;
    if (opts.level) this.threshold = LEVEL_ORDER[opts.level];
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public getLevel(): LogLevel {
    return (
      (Object.keys(LEVEL_ORDER) as LogLevel[]).find((l) => LEVEL_ORDER[l] === this.threshold) ||
      "info"
    );
  }

  /** Truncate the log file and write a fresh session header. */
  public init(header = "ztui session started"): void {
    try {
      writeFileSync(this.filePath, this.format("info", "logger", header));
    } catch {
      // Logging must never throw — e.g. read-only filesystem.
    }
  }

  private format(level: LogLevel, scope: string, message: string, data?: unknown): string {
    const extra = serialize(data);
    const suffix = extra ? (extra.startsWith("\n") ? extra : ` ${extra}`) : "";
    return `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}${suffix}\n`;
  }

  private write(level: LogLevel, scope: string, message: string, data?: unknown): void {
    if (LEVEL_ORDER[level] < this.threshold) return;
    try {
      appendFileSync(this.filePath, this.format(level, scope, message, data));
    } catch {
      // Never propagate logging failures into application code.
    }
  }

  /**
   * Whether `level` would actually be written. Lets hot callers skip building an
   * expensive message (e.g. a widget `describe()` per input event) when the log
   * would be dropped anyway — the message string is otherwise computed eagerly
   * before `write` discards it.
   */
  public isEnabled(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= this.threshold;
  }

  public debug(scope: string, message: string, data?: unknown): void {
    this.write("debug", scope, message, data);
  }

  public info(scope: string, message: string, data?: unknown): void {
    this.write("info", scope, message, data);
  }

  public warn(scope: string, message: string, data?: unknown): void {
    this.write("warn", scope, message, data);
  }

  public error(scope: string, message: string, err?: unknown): void {
    this.write("error", scope, message, err);
  }
}

/** Process-wide logger singleton. */
export const logger = new Logger();
