import { EventEmitter } from "node:events";
import type { Size } from "../geometry/size.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { iconRegistry } from "../render/icon-registry.ts";

export interface KeyEvent {
  key: string;
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  handled?: boolean;
}

export interface MouseEvent {
  x: number;
  y: number;
  type: "press" | "release" | "drag" | "move" | "scroll_up" | "scroll_down";
  button: "left" | "right" | "middle" | "none";
  handled?: boolean;
}

export interface TerminalCapabilities {
  truecolor: boolean;
  color256: boolean;
  kittyKeyboard: boolean;
  mouseTracking: boolean;
  mouseHover: boolean;
  hyperlinks: boolean;
  synchronizedUpdates: boolean;
  glyphProtocol: boolean;
  clipboard: boolean;
  notifications: boolean;
  /**
   * Inline-graphics capability. The terminal protocols (`kitty`/`iterm2`/`sixel`)
   * consume rasterized pixels; `web` means the backend renders images/SVG
   * natively (the canvas draws them), so widgets ship vector/raster source rather
   * than ANSI-encoding it. `none` falls back to Unicode half-block art.
   */
  graphicsProtocol: "kitty" | "iterm2" | "sixel" | "web" | "none";
  terminalProgram?: string;
  cellSize?: { width: number; height: number };
}

export declare interface Driver {
  on(event: "resize", listener: (size: Size) => void): this;
  on(event: "key", listener: (ev: KeyEvent) => void): this;
  on(event: "mouse", listener: (ev: MouseEvent) => void): this;
  on(event: "paste", listener: (text: string) => void): this;
  on(event: "capabilities_resolved", listener: () => void): this;
  emit(event: "resize", size: Size): boolean;
  emit(event: "key", ev: KeyEvent): boolean;
  emit(event: "mouse", ev: MouseEvent): boolean;
  emit(event: "paste", text: string): boolean;
  emit(event: "capabilities_resolved"): boolean;
}

export interface Clipboard {
  get(): Promise<string>;
  set(text: string): void;
}

export abstract class Driver extends EventEmitter {
  public capabilitiesResolved = false;
  public abstract readonly capabilities: TerminalCapabilities;
  public abstract readonly clipboard: Clipboard;
  abstract start(): void;
  abstract stop(): void;
  abstract write(data: string): void;
  abstract getSize(): Size;
  public abstract showNotification(title: string, body: string): void;
  public getIconSequence(name: string, _color?: string, _bgColor?: string): string {
    const icon = iconRegistry.get(name);
    return icon ? icon.textFallback : "";
  }
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
   * Hand the composed cell grid to the backend after each changed frame. The
   * portable alternative to consuming the ANSI diff: non-terminal backends
   * (web DOM/canvas) override this and may ignore `write`/`writeFrame`
   * entirely. The buffer is the live frame — consume it synchronously or copy.
   */
  public presentBuffer(_buffer: ScreenBuffer): void {}
  public writeFrame(data: string): void {
    if (this.capabilities.synchronizedUpdates) {
      this.write(`\x1b[?2026h${data}\x1b[?2026l`);
    } else {
      this.write(data);
    }
  }
}
