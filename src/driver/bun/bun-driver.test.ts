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
});
