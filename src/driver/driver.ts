import { EventEmitter } from "node:events";
import type { Size } from "../geometry/size.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { iconRegistry } from "../render/icon-registry.ts";

/** A normalized keyboard event delivered to widgets and hotkeys. */
export interface KeyEvent {
  /** Canonical key spec, e.g. `"ctrl+s"`, `"enter"`, `"a"`. */
  key: string;
  /** Base key name without modifiers, e.g. `"s"`, `"up"`, `"escape"`. */
  name: string;
  /** Ctrl held. */
  ctrl: boolean;
  /** Meta/Cmd held. */
  meta: boolean;
  /** Shift held. */
  shift: boolean;
  /** Set true to mark the event consumed (stops further dispatch). */
  handled?: boolean;
}

/** A normalized mouse/pointer event in cell coordinates. */
export interface MouseEvent {
  /** Column (cell x). */
  x: number;
  /** Row (cell y). */
  y: number;
  /** Event kind. */
  type: "press" | "release" | "drag" | "move" | "scroll_up" | "scroll_down";
  /** Which button (or `"none"` for moves/scroll). */
  button: "left" | "right" | "middle" | "none";
  /** Set true to mark the event consumed. */
  handled?: boolean;
}

/** What the active backend/terminal supports; drivers fill this in (some after a probe). */
export interface TerminalCapabilities {
  /** 24-bit color. */
  truecolor: boolean;
  /** 256-color palette. */
  color256: boolean;
  /** Kitty keyboard protocol (disambiguates Ctrl+Shift+… etc.). */
  kittyKeyboard: boolean;
  /** Mouse press/release/drag reporting. */
  mouseTracking: boolean;
  /** Hover (bare mouse-move) reporting. */
  mouseHover: boolean;
  /** OSC 8 hyperlinks. */
  hyperlinks: boolean;
  /** Synchronized output (flicker-free frames). */
  synchronizedUpdates: boolean;
  /** Terminal Glyph Protocol for crisp icons. */
  glyphProtocol: boolean;
  /** OSC 52 clipboard read/write. */
  clipboard: boolean;
  /** Desktop notifications. */
  notifications: boolean;
  /**
   * Inline-graphics capability. The terminal protocols (`kitty`/`iterm2`/`sixel`)
   * consume rasterized pixels; `web` means the backend renders images/SVG
   * natively (the canvas draws them), so widgets ship vector/raster source rather
   * than ANSI-encoding it. `none` falls back to Unicode half-block art.
   */
  graphicsProtocol: "kitty" | "iterm2" | "sixel" | "web" | "none";
  /**
   * Whether this backend owns the host process, so a quit gesture (a bare
   * Ctrl+C) may terminate it. True/undefined on a terminal — Ctrl+C is the
   * conventional way to exit and the process is the user's own. False on the web
   * backend, where the page (and any server behind it) is long-lived and shared:
   * an end user pressing Ctrl+C must copy/cancel, never tear down the host. The
   * App skips its `process.exit` when this is false.
   */
  ownsProcess?: boolean;
  /** Reported terminal program name, when known (e.g. "iTerm.app"). */
  terminalProgram?: string;
  /** Pixel size of one cell, when known — used to rasterize/place graphics. */
  cellSize?: { width: number; height: number };
}

/** Typed event overloads merged onto {@link Driver} ({@link https://nodejs.org/api/events.html EventEmitter}). */
export declare interface Driver {
  /** Subscribe to viewport resize. */
  on(event: "resize", listener: (size: Size) => void): this;
  /** Subscribe to key events. */
  on(event: "key", listener: (ev: KeyEvent) => void): this;
  /** Subscribe to mouse events. */
  on(event: "mouse", listener: (ev: MouseEvent) => void): this;
  /** Subscribe to bracketed-paste text. */
  on(event: "paste", listener: (text: string) => void): this;
  /** Fires once capability probing completes. */
  on(event: "capabilities_resolved", listener: () => void): this;
  /** Emit a resize (drivers call this). */
  emit(event: "resize", size: Size): boolean;
  /** Emit a key event. */
  emit(event: "key", ev: KeyEvent): boolean;
  /** Emit a mouse event. */
  emit(event: "mouse", ev: MouseEvent): boolean;
  /** Emit pasted text. */
  emit(event: "paste", text: string): boolean;
  /** Emit the capabilities-resolved signal. */
  emit(event: "capabilities_resolved"): boolean;
}

/** Read/write access to the system clipboard, as the backend exposes it. */
export interface Clipboard {
  /** Resolve the current clipboard text. */
  get(): Promise<string>;
  /** Replace the clipboard text. */
  set(text: string): void;
}

/**
 * Backend abstraction: turns the composed frame into something a device shows
 * (ANSI for a terminal, a cell grid for the canvas) and emits normalized
 * input events. Subclass to target a new backend — see {@link BunDriver},
 * {@link WebDriver}, {@link MockDriver}.
 */
export abstract class Driver extends EventEmitter {
  /** True once capability probing has completed. */
  public capabilitiesResolved = false;
  /** What this backend supports (see {@link TerminalCapabilities}). */
  public abstract readonly capabilities: TerminalCapabilities;
  /** Clipboard access for this backend. */
  public abstract readonly clipboard: Clipboard;
  /** Begin: set up the device, enter raw mode / bind listeners, probe capabilities. */
  abstract start(): void;
  /** Tear down: restore the device and release listeners. */
  abstract stop(): void;
  /** Write raw output to the device (ANSI for a terminal). */
  abstract write(data: string): void;
  /** Current viewport size in cells. */
  abstract getSize(): Size;
  /** Show a desktop notification, where supported. */
  public abstract showNotification(title: string, body: string): void;
  /** Enable/disable passive hover (any-motion) reporting at runtime. */
  public setMouseHover(_enabled: boolean): void {}
  /** Whether passive hover move suppression should be enforced by the app. */
  public get enforcesRuntimeHoverMode(): boolean {
    return false;
  }
  /** Escape sequence drawing a registered icon by name (text fallback by default; protocol drivers override). */
  public getIconSequence(name: string, _color?: string, _bgColor?: string): string {
    const icon = iconRegistry.get(name);
    return icon ? icon.textFallback : "";
  }
  /** Escape sequence drawing an inline image (empty by default; graphics-protocol drivers override). */
  public getImageSequence(
    _pixelBuffer: Uint8Array,
    _pixelWidth: number,
    _pixelHeight: number,
    _cellWidth: number,
    _cellHeight: number,
    _pngBase64?: string,
    _bgColor?: string,
    _zIndex?: number,
  ): string {
    return "";
  }
  /** Clear the whole screen and scrollback. */
  public clearScreen(): void {
    this.write("\x1b[H\x1b[2J\x1b[3J");
  }
  /**
   * Sequence emitted before redrawing a cell whose graphic/icon changed or was
   * removed, to erase the stale image. `bgColor` is the cell's new background,
   * used by protocols (e.g. sixel) that clear by painting an opaque rectangle.
   * Returns "" for backends/protocols where no explicit clear is needed. Keeps
   * graphics-protocol specifics out of the render/app layers.
   */
  public getGraphicClearSequence(_bgColor?: string): string {
    return "";
  }
  /**
   * Sequence that deletes *all* inline graphics from the terminal at once. Used
   * on a full redraw after a transition (resize, screen change, invalidated
   * frame) to wipe any placements that were orphaned — e.g. a Kitty image that
   * scrolled or whose owning screen was replaced — before the frame re-places
   * the current graphics. Returns "" where not applicable.
   */
  public getGraphicResetSequence(): string {
    return "";
  }
  /**
   * The screen-blanking sequence (SGR reset + cursor home + erase display) as a
   * *string*, so the App can prepend it to a frame and write both atomically.
   * Pairs with {@link getGraphicResetSequence} on a post-graphics-change full
   * wipe. The leading SGR reset makes the erase clear to the default background.
   * Returns "" on backends that don't consume ANSI (e.g. the web canvas).
   */
  public getScreenClearSequence(): string {
    return "\x1b[m\x1b[H\x1b[2J";
  }
  /**
   * Hand the composed cell grid to the backend after each changed frame. The
   * portable alternative to consuming the ANSI diff: non-terminal backends
   * (web DOM/canvas) override this and may ignore `write`/`writeFrame`
   * entirely. The buffer is the live frame — consume it synchronously or copy.
   */
  public presentBuffer(_buffer: ScreenBuffer): void {}
  /** Write a full frame, wrapping it in synchronized-update markers when supported. */
  public writeFrame(data: string): void {
    if (this.capabilities.synchronizedUpdates) {
      this.write(`\x1b[?2026h${data}\x1b[?2026l`);
    } else {
      this.write(data);
    }
  }
}
