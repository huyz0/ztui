import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Size } from "../geometry/size.ts";
import { iconRegistry } from "../render/icon-registry.ts";
import { BunDriver } from "./bun/index.ts";
import { Driver, type TerminalCapabilities } from "./driver.ts";
import { MockDriver } from "./mock/index.ts";
import { WebDriver } from "./web/index.ts";

class MockReadStream extends EventEmitter {
  public isTTY = true;
  public setRawMode = vi.fn();
  public resume = vi.fn();
  public pause = vi.fn();
  public setEncoding = vi.fn();
}

class MockWriteStream extends EventEmitter {
  public isTTY = true;
  public columns = 80;
  public rows = 24;
  public dataWritten = "";
  public write(data: string) {
    this.dataWritten += data;
  }
}

describe("BunDriver Capability Probing", () => {
  let stdin: MockReadStream;
  let stdout: MockWriteStream;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.useFakeTimers();
    stdin = new MockReadStream();
    stdout = new MockWriteStream();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  test("Baseline capability initialization from environment", () => {
    process.env.COLORTERM = "truecolor";
    process.env.TERM = "xterm-256color";
    process.env.TERM_PROGRAM = "ghostty";

    const driver = new BunDriver({ stdin, stdout });
    expect(driver.capabilities.truecolor).toBe(true);
    expect(driver.capabilities.color256).toBe(true);
    expect(driver.capabilities.hyperlinks).toBe(true);
    expect(driver.capabilities.graphicsProtocol).toBe("kitty"); // Ghostty → kitty protocol
  });

  test("Bypasses active probing if stdin/stdout are not TTYs", () => {
    stdin.isTTY = false;
    stdout.isTTY = false;

    const driver = new BunDriver({ stdin, stdout });
    driver.start();

    // Verify no probe sequences written, only baseline default mouse tracking
    expect(stdout.dataWritten.includes("\x1b[?1049h")).toBe(true); // alt buffer
    expect(stdout.dataWritten.includes("\x1b[?1000h")).toBe(true); // standard mouse
    expect(stdout.dataWritten.includes("\x1b[?1003$p")).toBe(false); // NO probe

    driver.stop();
  });

  test("Active probing updates capabilities and replays early keystrokes", () => {
    const driver = new BunDriver({ stdin, stdout });
    driver.start();

    // Verify probe queries emitted
    expect(stdout.dataWritten.includes("\x1b[>c")).toBe(true);
    expect(stdout.dataWritten.includes("\x1b[?u")).toBe(true);
    expect(stdout.dataWritten.includes("\x1b_Gi=31")).toBe(true);
    expect(stdout.dataWritten.includes("\x1b[?1003$p")).toBe(true);

    // Capture key events emitted by driver
    const emittedKeys: any[] = [];
    driver.on("key", (ev) => {
      emittedKeys.push(ev);
    });

    // Simulate query responses + early user input keystroke
    stdin.emit("data", "\x1b[>0;95;0c"); // DA2 response
    stdin.emit("data", "\x1b[?1u"); // Kitty Keyboard response (enabled)
    stdin.emit("data", "\x1b_Gi=31;OK\x1b\\"); // Kitty Graphics support OK
    stdin.emit("data", "\x1b[?1003;1$y"); // Mouse Hover DECRQM response (status 1 = active)
    stdin.emit("data", "\x1b[?2026;1$y"); // Synchronized Updates DECRQM response
    stdin.emit("data", "\x1b_25a1;s;fmt=glyf,colrv0,colrv1\x1b\\"); // Glyph Protocol response
    stdin.emit("data", "k"); // Early user key stroke

    // Verify no keys emitted during probing
    expect(emittedKeys.length).toBe(0);

    // Advance 100ms to finish probing
    vi.advanceTimersByTime(100);

    // Verify capabilities updated
    expect(driver.capabilities.kittyKeyboard).toBe(true);
    expect(driver.capabilities.graphicsProtocol).toBe("kitty");
    expect(driver.capabilities.mouseHover).toBe(true);
    expect(driver.capabilities.synchronizedUpdates).toBe(true);
    expect(driver.capabilities.glyphProtocol).toBe(true);

    // Verify protocol activation sequences written to stdout
    expect(stdout.dataWritten.includes("\x1b[>1u")).toBe(true); // Kitty keyboard activation
    expect(stdout.dataWritten.includes("\x1b[?1003h")).toBe(true); // Mouse Hover activation

    // Verify buffered key was replayed
    expect(emittedKeys.length).toBe(1);
    expect(emittedKeys[0]).toEqual({
      key: "k",
      name: "k",
      ctrl: false,
      meta: false,
      shift: false,
    });

    driver.stop();
    // Verify cleanup
    expect(stdout.dataWritten.includes("\x1b[<u")).toBe(true); // Disable kitty keyboard
  });

  test("Kitty Keyboard key and modifier parsing", () => {
    const driver = new BunDriver({ stdin, stdout });
    driver.start();
    vi.advanceTimersByTime(100);

    const emittedKeys: any[] = [];
    driver.on("key", (ev) => {
      emittedKeys.push(ev);
    });

    // Simulate Ctrl+Shift+A (key 97, modifier 6 = 1 + 1 (shift) + 4 (ctrl) = 6, event type 1 = press)
    stdin.emit("data", "\x1b[97;6u");
    expect(emittedKeys[emittedKeys.length - 1]).toEqual({
      key: "ctrl+A",
      name: "a",
      ctrl: true,
      meta: false,
      shift: true,
    });

    // Simulate Up Arrow key (keycode 57376, no modifier)
    stdin.emit("data", "\x1b[57376;1u");
    expect(emittedKeys[emittedKeys.length - 1]).toEqual({
      key: "up",
      name: "up",
      ctrl: false,
      meta: false,
      shift: false,
    });

    // Simulate arbitrary unknown keycode (e.g. 9999)
    stdin.emit("data", "\x1b[9999;1u");
    expect(emittedKeys[emittedKeys.length - 1].key).toBe("key_9999");

    // Simulate Enter key release (keycode 13, event type 3 = release) - should be ignored
    const lengthBefore = emittedKeys.length;
    stdin.emit("data", "\x1b[13;1:3u");
    expect(emittedKeys.length).toBe(lengthBefore);

    driver.stop();
  });

  test("Standard key fallbacks and control sequences", () => {
    const driver = new BunDriver({ stdin, stdout });
    driver.start();
    vi.advanceTimersByTime(100);

    const emittedKeys: any[] = [];
    driver.on("key", (ev) => {
      emittedKeys.push(ev);
    });

    // Arrow keys
    stdin.emit("data", "\x1b[A"); // Up
    expect(emittedKeys[emittedKeys.length - 1].key).toBe("up");

    // Shift-Tab
    stdin.emit("data", "\x1b[Z");
    expect(emittedKeys[emittedKeys.length - 1]).toEqual({
      key: "tab",
      name: "tab",
      ctrl: false,
      meta: false,
      shift: true,
    });

    // Backspace (127), Enter (13), Tab (9)
    stdin.emit("data", "\x7f");
    expect(emittedKeys[emittedKeys.length - 1].key).toBe("backspace");
    stdin.emit("data", "\r");
    expect(emittedKeys[emittedKeys.length - 1].key).toBe("enter");
    stdin.emit("data", "\t");
    expect(emittedKeys[emittedKeys.length - 1].key).toBe("tab");

    // Ctrl+X (code 24)
    stdin.emit("data", String.fromCharCode(24));
    expect(emittedKeys[emittedKeys.length - 1]).toEqual({
      key: "ctrl+x",
      name: "x",
      ctrl: true,
      meta: false,
      shift: false,
    });

    // Modified arrow (Ctrl+Up) decodes to a named key carrying the modifier,
    // rather than falling through to the generic escape matcher.
    stdin.emit("data", "\x1b[1;5A");
    expect(emittedKeys[emittedKeys.length - 1]).toEqual({
      key: "up",
      name: "up",
      ctrl: true,
      meta: false,
      shift: false,
    });

    // A truly generic CSI sequence still surfaces verbatim.
    stdin.emit("data", "\x1b[3J");
    expect(emittedKeys[emittedKeys.length - 1].name).toBe("escape_sequence");

    // Single escape press
    stdin.emit("data", "\x1b");
    expect(emittedKeys[emittedKeys.length - 1].key).toBe("escape");

    driver.stop();
  });

  test("Mouse event sequence parsing", () => {
    const driver = new BunDriver({ stdin, stdout });
    driver.start();
    vi.advanceTimersByTime(100);

    const emittedMouse: any[] = [];
    driver.on("mouse", (ev) => {
      emittedMouse.push(ev);
    });

    // SGR Mouse Press Left (button 0, x=10, y=20) -> index is 1-based, so input uses 11;21
    stdin.emit("data", "\x1b[<0;11;21M");
    expect(emittedMouse[emittedMouse.length - 1]).toEqual({
      x: 10,
      y: 20,
      type: "press",
      button: "left",
    });

    // SGR Mouse Release Left
    stdin.emit("data", "\x1b[<0;11;21m");
    expect(emittedMouse[emittedMouse.length - 1]).toEqual({
      x: 10,
      y: 20,
      type: "release",
      button: "left",
    });

    // b=34 (motion + button bits 2) with no button actually held is Ghostty's
    // buttonless-hover encoding, not a right-drag — it must decode as a move.
    stdin.emit("data", "\x1b[<34;11;21M");
    expect(emittedMouse[emittedMouse.length - 1]).toEqual({
      x: 10,
      y: 20,
      type: "move",
      button: "none",
    });

    // A genuine right-drag (real right press first) still decodes as a drag.
    stdin.emit("data", "\x1b[<2;11;21M\x1b[<34;12;21M");
    expect(emittedMouse[emittedMouse.length - 1]).toEqual({
      x: 11,
      y: 20,
      type: "drag",
      button: "right",
    });

    // SGR Mouse Move Hover (button code 35 or movement/hover)
    stdin.emit("data", "\x1b[<35;11;21M");
    expect(emittedMouse[emittedMouse.length - 1]).toEqual({
      x: 10,
      y: 20,
      type: "move",
      button: "none",
    });

    // SGR Scroll Up (button code 64)
    stdin.emit("data", "\x1b[<64;11;21M");
    expect(emittedMouse[emittedMouse.length - 1]).toEqual({
      x: 10,
      y: 20,
      type: "scroll_up",
      button: "none",
    });

    // SGR Scroll Down (button code 65)
    stdin.emit("data", "\x1b[<65;11;21M");
    expect(emittedMouse[emittedMouse.length - 1]).toEqual({
      x: 10,
      y: 20,
      type: "scroll_down",
      button: "none",
    });

    driver.stop();
  });

  test("Ctrl+C safety exit sequence", () => {
    const driver = new BunDriver({ stdin, stdout });
    driver.start();
    vi.advanceTimersByTime(100);

    const originalExit = process.exit;
    const mockExit = vi.fn();
    process.exit = mockExit as any;

    try {
      stdin.emit("data", "\u0003");
      expect(mockExit).toHaveBeenCalledWith(0);
    } finally {
      process.exit = originalExit;
    }
  });

  test("Clipboard and Notification output sequences", () => {
    const driver = new BunDriver({ stdin, stdout });
    driver.start();
    vi.advanceTimersByTime(100);

    stdout.dataWritten = "";
    driver.clipboard.set("Hello world");
    expect(stdout.dataWritten).toBe("\x1b]52;c;SGVsbG8gd29ybGQ=\x07");

    stdout.dataWritten = "";
    driver.showNotification("Alert", "Something happened");
    expect(stdout.dataWritten).toBe(
      "\x1b]9;Alert: Something happened\x07\x1b]777;notify;Alert;Something happened\x07",
    );

    driver.stop();
  });

  test("Clipboard reading from terminal (OSC 52 get)", async () => {
    const driver = new BunDriver({ stdin, stdout });
    driver.start();
    vi.advanceTimersByTime(100);

    stdout.dataWritten = "";
    const getPromise = driver.clipboard.get();

    // Verify it sent the OSC 52 query
    expect(stdout.dataWritten).toBe("\x1b]52;c;?\x07");

    // Simulate terminal response
    stdin.emit("data", "\x1b]52;c;SGVsbG8gd29ybGQ=\x07");

    const text = await getPromise;
    expect(text).toBe("Hello world");

    driver.stop();
  });

  test("Clipboard reading timeout fallback", async () => {
    const driver = new BunDriver({ stdin, stdout });
    driver.start();
    vi.advanceTimersByTime(100);

    stdout.dataWritten = "";
    const getPromise = driver.clipboard.get();

    // Advance timer by 500ms to trigger timeout
    vi.advanceTimersByTime(500);

    const text = await getPromise;
    expect(text).toBe("");

    driver.stop();
  });

  test("Sixel capability probing via DA1 response", () => {
    const driver = new BunDriver({ stdin, stdout });
    driver.start();

    // Verify DA1 sequence \x1b[c is sent in probe
    expect(stdout.dataWritten.includes("\x1b[c")).toBe(true);

    // Simulate DA1 response containing '4' (Sixel)
    stdin.emit("data", "\x1b[?62;1;2;4;6;7;8;9c");

    vi.advanceTimersByTime(100);

    expect(driver.capabilities.graphicsProtocol).toBe("sixel");

    driver.stop();
  });

  test("Late-arriving cell size query responses update capabilities dynamically", () => {
    const driver = new BunDriver({ stdin, stdout });
    driver.start();

    // Advance 100ms to complete initial probing
    vi.advanceTimersByTime(100);
    expect(driver.capabilitiesResolved).toBe(true);

    // Track capabilities_resolved events
    let resolvedCount = 0;
    driver.on("capabilities_resolved", () => {
      resolvedCount++;
    });

    // Send late-arriving cell size response: height=17, width=8
    stdin.emit("data", "\x1b[6;17;8t");

    // Verify cell size got updated
    expect(driver.capabilities.cellSize).toEqual({ width: 8, height: 17 });
    expect(resolvedCount).toBe(1);

    // Verify it doesn't emit any key events for that sequence
    let keyEmitted = false;
    driver.on("key", () => {
      keyEmitted = true;
    });

    stdin.emit("data", "\x1b[6;17;8t");
    expect(keyEmitted).toBe(false);

    driver.stop();
  });

  test("WebDriver basic implementation coverage", async () => {
    // Browser windows have no TTY floor, so WebDriver holds a 150x42 minimum.
    const webDriver = new WebDriver(200, 60);
    expect(webDriver.getSize().width).toBe(200);
    expect(webDriver.getSize().height).toBe(60);

    let capsResolved = false;
    webDriver.on("capabilities_resolved", () => {
      capsResolved = true;
    });

    webDriver.start();
    expect(capsResolved).toBe(true);
    expect(webDriver.capabilities.truecolor).toBe(true);
    // The canvas backend renders images/SVG natively (drawImage), not via a
    // terminal graphics protocol.
    expect(webDriver.capabilities.graphicsProtocol).toBe("web");

    webDriver.write("anything");
    webDriver.showNotification("Title", "Body");

    const text = await webDriver.clipboard.get();
    expect(text).toBe("");
    webDriver.clipboard.set("hello");

    webDriver.stop();
  });

  test("MockDriver methods", async () => {
    const mockDriver = new MockDriver(80, 24);
    expect(mockDriver.getSize().width).toBe(80);

    let keyEvent: any = null;
    mockDriver.on("key", (ev) => {
      keyEvent = ev;
    });
    mockDriver.simulateKey("a");
    expect(keyEvent.key).toBe("a");

    let mouseEvent: any = null;
    mockDriver.on("mouse", (ev) => {
      mouseEvent = ev;
    });
    mockDriver.simulateMouse(5, 5, "press", "left");
    expect(mouseEvent.x).toBe(5);

    let resizeEvent: any = null;
    mockDriver.on("resize", (size) => {
      resizeEvent = size;
    });
    mockDriver.simulateResize(100, 40);
    expect(resizeEvent.width).toBe(100);

    mockDriver.showNotification("Title", "Body");
    expect(mockDriver.writtenData).toContain("Title");

    mockDriver.clearWrittenData();
    expect(mockDriver.writtenData).toBe("");
  });

  test("getGraphicClearSequence delegates protocol specifics to the driver", () => {
    // Base/non-graphics drivers emit nothing (no escape leaks upward).
    expect(new MockDriver(80, 24).getGraphicClearSequence()).toBe("");
    expect(new WebDriver(80, 24).getGraphicClearSequence()).toBe("");

    // BunDriver returns the Kitty delete-placement escape when Kitty is active.
    const driver = new BunDriver({ stdin, stdout });
    (driver.capabilities as any).graphicsProtocol = "kitty";
    expect(driver.getGraphicClearSequence()).toBe("\x1b_Ga=d,d=c\x1b\\");
    // Sixel can't be cleared by text, so it paints an opaque bg rectangle
    // (a sixel sequence) over the cell footprint.
    (driver.capabilities as any).graphicsProtocol = "sixel";
    const sixelClear = driver.getGraphicClearSequence("#1e1e2e");
    expect(sixelClear.startsWith("\x1b[s\x1bP")).toBe(true); // save cursor + sixel
    expect(sixelClear.endsWith("\x1b[u")).toBe(true); // restore cursor
    // No graphics protocol → nothing to clear.
    (driver.capabilities as any).graphicsProtocol = "none";
    expect(driver.getGraphicClearSequence()).toBe("");
  });

  test("BunDriver getIconSequence under different protocols", () => {
    iconRegistry.registerIcon({
      name: "test-graphics-icon",
      svg: "<svg><circle cx='12' cy='12' r='10' fill='currentColor'/></svg>",
      textFallback: "⭐",
    });

    const driver = new BunDriver({ stdin, stdout });

    // Test kitty
    (driver as any).capabilities.graphicsProtocol = "kitty";
    const kittySeq = driver.getIconSequence("test-graphics-icon");
    expect(kittySeq).toContain("\x1b[s");

    // Test iterm2
    (driver as any).capabilities.graphicsProtocol = "iterm2";
    const itermSeq = driver.getIconSequence("test-graphics-icon");
    expect(itermSeq).toContain("File=inline=1");

    // Test sixel
    (driver as any).capabilities.graphicsProtocol = "sixel";
    const sixelSeq = driver.getIconSequence("test-graphics-icon");
    expect(sixelSeq).toContain("\x1bPq");

    // Test glyphProtocol
    (driver as any).capabilities.graphicsProtocol = "none";
    (driver as any).capabilities.glyphProtocol = true;
    const glyphSeq = driver.getIconSequence("test-graphics-icon");
    expect(glyphSeq).toBeDefined();

    // Test none
    (driver as any).capabilities.glyphProtocol = false;
    const fallbackSeq = driver.getIconSequence("test-graphics-icon");
    expect(fallbackSeq).toBe("⭐");

    // Call signal handlers directly for test coverage
    (driver as any).cleanupHandler();
    const originalExit = process.exit;
    process.exit = vi.fn() as any;
    try {
      (driver as any).sigintHandler();
      (driver as any).sigtermHandler();
    } finally {
      process.exit = originalExit;
    }
  });

  test("Base Driver default implementations", () => {
    class TestBaseDriver extends Driver {
      public capabilities: TerminalCapabilities = {
        truecolor: false,
        color256: false,
        scrollRegion: false,
        kittyKeyboard: false,
        mouseTracking: false,
        mouseHover: false,
        hyperlinks: false,
        synchronizedUpdates: false,
        glyphProtocol: false,
        clipboard: false,
        notifications: false,
        pointerShapes: false,
        graphicsProtocol: "none",
      };
      public clipboard = {
        async get() {
          return "";
        },
        set() {},
      };
      public dataWritten = "";
      start() {}
      stop() {}
      write(data: string) {
        this.dataWritten += data;
      }
      getSize() {
        return new Size(80, 24);
      }
      showNotification() {}
    }

    const driver = new TestBaseDriver();

    // Test clearScreen
    driver.clearScreen();
    expect(driver.dataWritten).toBe("\x1b[H\x1b[2J\x1b[3J");

    // Test writeFrame without synchronized updates
    driver.dataWritten = "";
    driver.writeFrame("hello");
    expect(driver.dataWritten).toBe("hello");

    // Test writeFrame with synchronized updates
    driver.capabilities.synchronizedUpdates = true;
    driver.dataWritten = "";
    driver.writeFrame("hello");
    expect(driver.dataWritten).toBe("\x1b[?2026hhello\x1b[?2026l");

    // Test default getIconSequence
    const iconSeq = driver.getIconSequence("nonexistent");
    expect(iconSeq).toBe("");

    // Test default getImageSequence
    const imgSeq = driver.getImageSequence(new Uint8Array(), 0, 0, 0, 0);
    expect(imgSeq).toBe("");
  });
});
