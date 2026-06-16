import { appendFileSync, writeFileSync } from "node:fs";

/**
 * Centralized logging for ztui.
 *
 * Why a dedicated logger instead of `console.*`?
 *   - While a TUI is running it owns the terminal screen. Writing to stdout or
 *     stderr corrupts the rendered frame, so diagnostics must go somewhere else.
 *   - A single, consistent, timestamped + leveled + scoped format makes the log
 *     greppable for humans and parseable for LLM agents trying to debug a run.
 *   - Logging must never throw or crash the app, so every write is guarded.
 *
 * **Silent by default.** Out of the box the logger drops everything — it writes
 * no file and produces no output, so embedding ztui never litters the working
 * directory or races a shared file between processes/tests. Opt in explicitly:
 *
 *   - Env (read once at startup): set `ZTUI_LOG_FILE=path` to log to a file.
 *     `ZTUI_LOG_LEVEL=debug|info|warn|error|silent` sets the threshold (default
 *     `info`). With no `ZTUI_LOG_FILE`, nothing is logged regardless of level.
 *   - Code: `logger.configure({ filePath })` to log to a file, `{ sink }` to
 *     route formatted lines anywhere (an array, your own logger, a socket),
 *     `{ level }` to set the threshold, or `{ enabled: false }` to silence.
 *   - `logger.reset()` restores the environment-derived defaults (used by tests).
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

/**
 * A destination for formatted log lines (each already ends in `\n`). Returned by
 * {@link fileSink}, or supply your own to capture logs in memory, forward them to
 * another logger, etc. Sinks must never throw.
 */
export type LogSink = (line: string) => void;

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

/** A {@link LogSink} that appends lines to `filePath` (failures are swallowed). */
export function fileSink(filePath: string): LogSink {
  return (line: string) => {
    try {
      appendFileSync(filePath, line);
    } catch {
      // Logging must never throw — e.g. a read-only filesystem.
    }
  };
}

/** @internal Diagnostic logger; use the shared {@link logger} instance. */
class Logger {
  private threshold = LEVEL_ORDER[parseEnvLevel()];
  /** File target when logging to a file (also enables `init` truncation); else null. */
  private filePath: string | null = null;
  /** Active destination; `null` means drop everything (the default). */
  private sink: LogSink | null = null;

  constructor() {
    this.applyEnvDefaults();
  }

  /** Resolve the default destination from the environment: a file only if asked. */
  private applyEnvDefaults(): void {
    this.threshold = LEVEL_ORDER[parseEnvLevel()];
    const envFile = process.env.ZTUI_LOG_FILE;
    if (envFile) {
      this.filePath = envFile;
      this.sink = fileSink(envFile);
    } else {
      this.filePath = null;
      this.sink = null; // silent by default
    }
  }

  /**
   * Override the destination and/or level at runtime. Options are applied in a
   * fixed order: an explicit `sink` wins over `filePath`; `enabled: false`
   * silences everything regardless of the others.
   */
  public configure(opts: {
    filePath?: string | null;
    level?: LogLevel;
    sink?: LogSink | null;
    enabled?: boolean;
  }): void {
    if (opts.level) this.threshold = LEVEL_ORDER[opts.level];
    if (opts.sink !== undefined) {
      // A custom sink replaces any file target (init() then can't truncate).
      this.sink = opts.sink;
      this.filePath = null;
    } else if (opts.filePath !== undefined) {
      if (opts.filePath) {
        this.filePath = opts.filePath;
        this.sink = fileSink(opts.filePath);
      } else {
        this.filePath = null;
        this.sink = null;
      }
    }
    if (opts.enabled === false) {
      this.sink = null;
      this.filePath = null;
    }
  }

  /** Restore the environment-derived defaults (silent unless `ZTUI_LOG_FILE` is set). */
  public reset(): void {
    this.applyEnvDefaults();
  }

  /** The current file target, or `null` when not logging to a file. */
  public getFilePath(): string | null {
    return this.filePath;
  }

  public getLevel(): LogLevel {
    return (
      (Object.keys(LEVEL_ORDER) as LogLevel[]).find((l) => LEVEL_ORDER[l] === this.threshold) ||
      "info"
    );
  }

  /**
   * Begin a session: truncate the log file (if any) and write a fresh header.
   * A no-op when logging is silent; for a custom sink the header is just emitted
   * (there's nothing to truncate).
   */
  public init(header = "ztui session started"): void {
    if (!this.sink) return;
    const line = this.format("info", "logger", header);
    if (this.filePath) {
      try {
        writeFileSync(this.filePath, line);
      } catch {
        // Never throw from logging.
      }
    } else {
      this.sink(line);
    }
  }

  private format(level: LogLevel, scope: string, message: string, data?: unknown): string {
    const extra = serialize(data);
    const suffix = extra ? (extra.startsWith("\n") ? extra : ` ${extra}`) : "";
    return `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}${suffix}\n`;
  }

  private write(level: LogLevel, scope: string, message: string, data?: unknown): void {
    // Fast path: drop without formatting when silent or below threshold.
    if (!this.sink || LEVEL_ORDER[level] < this.threshold) return;
    this.sink(this.format(level, scope, message, data));
  }

  /**
   * Whether `level` would actually be emitted (false when silent). Lets hot
   * callers skip building an expensive message (e.g. a widget `describe()` per
   * input event) when the log would be dropped anyway.
   */
  public isEnabled(level: LogLevel): boolean {
    return this.sink !== null && LEVEL_ORDER[level] >= this.threshold;
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
