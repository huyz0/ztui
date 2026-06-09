import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { join } from "node:path";
import { Terminal } from "@xterm/headless";

const FIXTURES = join(import.meta.dirname, "fixtures");

export interface E2EApp {
  /** The spawned child process. */
  proc: ChildProcessWithoutNullStreams;
  /** Raw, cumulative bytes written to the child's stdout (ANSI included). */
  raw: () => string;
  /** The reconstructed on-screen text after feeding stdout through a VT parser. */
  screen: () => string;
  /** Send raw bytes to the child's stdin (e.g. "\r", "\x03"). */
  send: (data: string) => void;
  /**
   * Send an SGR left-button press at 1-based terminal coordinates (the wire
   * format a real terminal emits with mouse mode 1006 enabled).
   */
  clickAt: (col: number, row: number) => void;
  /**
   * Resends `data` on an interval until the screen matches `pred`. Tolerates
   * startup races (e.g. a key sent before focus settles) without coupling the
   * test to exact timing. Use a monotonic predicate so extra sends are benign.
   */
  sendUntil: (
    data: string,
    pred: (text: string) => boolean,
    opts?: { intervalMs?: number; timeoutMs?: number },
  ) => Promise<void>;
  /** Resolve once the rendered screen matches `pred`, or reject on timeout. */
  waitForScreen: (pred: (text: string) => boolean, timeoutMs?: number) => Promise<void>;
  /** Resolve with the child's exit code once it terminates. */
  waitForExit: (timeoutMs?: number) => Promise<number | null>;
}

/**
 * Spawns a fixture app as a real OS process via `bun run`, wiring its stdout
 * into an xterm-headless terminal so tests can assert on the reconstructed
 * screen (handling cursor moves and diffs) as well as the raw byte stream.
 */
export function launchApp(fixture: string, cols = 80, rows = 24): E2EApp {
  const proc = spawn("bun", ["run", join(FIXTURES, fixture)], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ZTUI_LOG_LEVEL: "silent" },
  }) as ChildProcessWithoutNullStreams;

  const term = new Terminal({ cols, rows, allowProposedApi: true });
  let raw = "";

  proc.stdout.on("data", (chunk: Buffer) => {
    const s = chunk.toString("utf8");
    raw += s;
    term.write(s);
  });

  const screen = (): string => {
    const buf = term.buffer.active;
    const lines: string[] = [];
    for (let y = 0; y < term.rows; y++) {
      lines.push(buf.getLine(y)?.translateToString(true) ?? "");
    }
    return lines.join("\n");
  };

  const waitForScreen = (pred: (text: string) => boolean, timeoutMs = 8000): Promise<void> =>
    new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (pred(screen())) return resolve();
        if (Date.now() - started > timeoutMs) {
          return reject(new Error(`waitForScreen timed out. Screen was:\n${screen()}`));
        }
        setTimeout(tick, 25);
      };
      tick();
    });

  const waitForExit = (timeoutMs = 8000): Promise<number | null> =>
    new Promise((resolve, reject) => {
      if (proc.exitCode !== null) return resolve(proc.exitCode);
      const timer = setTimeout(() => reject(new Error("waitForExit timed out")), timeoutMs);
      proc.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

  const send = (data: string) => proc.stdin.write(data);

  // SGR mouse press: ESC [ < button ; col ; row M (button 0 = left, 1-based).
  const clickAt = (col: number, row: number) => send(`\x1b[<0;${col};${row}M`);

  const sendUntil = (
    data: string,
    pred: (text: string) => boolean,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<void> => {
    const { intervalMs = 150, timeoutMs = 8000 } = opts;
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (pred(screen())) return resolve();
        if (Date.now() - started > timeoutMs) {
          return reject(new Error(`sendUntil timed out. Screen was:\n${screen()}`));
        }
        send(data);
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  };

  return {
    proc,
    raw: () => raw,
    screen,
    send,
    clickAt,
    sendUntil,
    waitForScreen,
    waitForExit,
  };
}

/** ANSI control sequences the BunDriver emits around its lifecycle. */
export const ANSI = {
  enterAltScreen: "\x1b[?1049h",
  leaveAltScreen: "\x1b[?1049l",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  enableSgrMouse: "\x1b[?1006h",
  enableMouseTracking: "\x1b[?1000h",
};
