import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BunDriver } from "./index.ts";

/**
 * Integration tests for the real BunDriver using *injected* stdin/stdout
 * streams. This exercises the genuine lifecycle and resize wiring without a
 * TTY or a native pty (node-pty ships no linux-x64 prebuild), keeping the
 * suite deterministic and dependency-free.
 */

class FakeStdout extends EventEmitter {
  public columns = 80;
  public rows = 24;
  public isTTY = false;
  public written: string[] = [];
  write(data: string): boolean {
    this.written.push(data);
    return true;
  }
  all(): string {
    return this.written.join("");
  }
}

class FakeStdin extends EventEmitter {
  public isTTY = false;
  public rawMode = false;
  setRawMode(v: boolean): void {
    this.rawMode = v;
  }
  resume(): void {}
  pause(): void {}
  setEncoding(): void {}
}

describe("BunDriver lifecycle (injected streams)", () => {
  let stdout: FakeStdout;
  let stdin: FakeStdin;
  let driver: BunDriver;

  beforeEach(() => {
    stdout = new FakeStdout();
    stdin = new FakeStdin();
    driver = new BunDriver({ stdin, stdout });
  });

  afterEach(() => {
    driver.stop();
  });

  test("reports terminal size from the stdout stream", () => {
    stdout.columns = 132;
    stdout.rows = 43;
    const size = driver.getSize();
    expect(size.width).toBe(132);
    expect(size.height).toBe(43);
  });

  test("emits 'resize' with the new size when stdout resizes", () => {
    driver.start();
    const onResize = vi.fn();
    driver.on("resize", onResize);

    stdout.columns = 100;
    stdout.rows = 30;
    stdout.emit("resize");

    expect(onResize).toHaveBeenCalledTimes(1);
    const size = onResize.mock.calls[0][0];
    expect(size.width).toBe(100);
    expect(size.height).toBe(30);
  });

  test("stops listening for resize after stop()", () => {
    driver.start();
    const onResize = vi.fn();
    driver.on("resize", onResize);

    driver.stop();
    stdout.emit("resize");

    expect(onResize).not.toHaveBeenCalled();
  });

  test("enters and restores the alternate screen across start/stop", () => {
    driver.start();
    expect(stdout.all()).toContain("\x1b[?1049h"); // alt screen on
    expect(stdout.all()).toContain("\x1b[?25l"); // hide cursor

    driver.stop();
    expect(stdout.all()).toContain("\x1b[?1049l"); // alt screen off
    expect(stdout.all()).toContain("\x1b[?25h"); // show cursor
  });

  test("enables SGR mouse tracking when not attached to a TTY", () => {
    driver.start();
    // Non-TTY skips capability probing and turns on mouse reporting directly.
    expect(stdout.all()).toContain("\x1b[?1006h");
    expect(stdout.all()).toContain("\x1b[?1000h");
  });

  test("toggles raw mode on the stdin stream around the session", () => {
    driver.start();
    expect(stdin.rawMode).toBe(true);
    driver.stop();
    expect(stdin.rawMode).toBe(false);
  });

  test("enables and disables bracketed paste around the session", () => {
    driver.start();
    expect(stdout.all()).toContain("\x1b[?2004h");
    driver.stop();
    expect(stdout.all()).toContain("\x1b[?2004l");
  });
});

describe("BunDriver bracketed paste", () => {
  let stdout: FakeStdout;
  let stdin: FakeStdin;
  let driver: BunDriver;

  beforeEach(() => {
    stdout = new FakeStdout();
    stdin = new FakeStdin();
    driver = new BunDriver({ stdin, stdout });
    driver.start();
  });

  afterEach(() => driver.stop());

  test("emits a single 'paste' event for a wrapped payload", () => {
    const pastes: string[] = [];
    driver.on("paste", (t) => pastes.push(t));
    stdin.emit("data", "\x1b[200~hello world\x1b[201~");
    expect(pastes).toEqual(["hello world"]);
  });

  test("does not leak paste markers into key events", () => {
    const keys: string[] = [];
    driver.on("key", (k) => keys.push(k.key));
    driver.on("paste", () => {});
    stdin.emit("data", "\x1b[200~ab\x1b[201~");
    // Pasted characters must not arrive as individual key presses.
    expect(keys).not.toContain("a");
    expect(keys).not.toContain("b");
  });

  test("reassembles a paste that spans multiple chunks", () => {
    const pastes: string[] = [];
    driver.on("paste", (t) => pastes.push(t));
    stdin.emit("data", "\x1b[200~hel");
    stdin.emit("data", "lo");
    stdin.emit("data", " there\x1b[201~");
    expect(pastes).toEqual(["hello there"]);
  });

  test("multi-line paste keeps its newlines intact", () => {
    const pastes: string[] = [];
    driver.on("paste", (t) => pastes.push(t));
    stdin.emit("data", "\x1b[200~line1\nline2\x1b[201~");
    expect(pastes).toEqual(["line1\nline2"]);
  });

  test("keystrokes surrounding a paste still decode", () => {
    const keys: string[] = [];
    const pastes: string[] = [];
    driver.on("key", (k) => keys.push(k.key));
    driver.on("paste", (t) => pastes.push(t));
    stdin.emit("data", "a\x1b[200~X\x1b[201~b");
    expect(pastes).toEqual(["X"]);
    expect(keys).toEqual(["a", "b"]);
  });
});

describe("BunDriver clipboard", () => {
  let stdout: FakeStdout;
  let stdin: FakeStdin;
  let driver: BunDriver;

  beforeEach(() => {
    stdout = new FakeStdout();
    stdin = new FakeStdin();
    driver = new BunDriver({ stdin, stdout });
    driver.start();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    driver.stop();
  });

  test("set() writes an OSC 52 sequence", () => {
    driver.clipboard.set("hi");
    const expected = `\x1b]52;c;${Buffer.from("hi").toString("base64")}\x07`;
    expect(stdout.all()).toContain(expected);
  });

  test("get() falls back to the last set value when the terminal does not answer", async () => {
    driver.clipboard.set("copied text");
    const pending = driver.clipboard.get();
    // No OSC 52 read response is injected; advance past the 500ms query timeout.
    await vi.advanceTimersByTimeAsync(600);
    expect(await pending).toBe("copied text");
  });

  test("get() prefers a real terminal response over the local mirror", async () => {
    driver.clipboard.set("local");
    const pending = driver.clipboard.get();
    const b64 = Buffer.from("from-terminal").toString("base64");
    stdin.emit("data", `\x1b]52;c;${b64}\x07`);
    expect(await pending).toBe("from-terminal");
  });

  test("get() falls back to the mirror when the terminal answers with an empty payload", async () => {
    // Terminals that block OSC 52 reads often reply with an empty value rather
    // than staying silent; that must not clobber what we just copied.
    driver.clipboard.set("kept");
    const pending = driver.clipboard.get();
    stdin.emit("data", "\x1b]52;c;\x07");
    expect(await pending).toBe("kept");
  });
});
