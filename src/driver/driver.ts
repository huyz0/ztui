import { EventEmitter } from "node:events";
import type { Size } from "../geometry/size.ts";
import { iconRegistry } from "../widgets/icon-registry.ts";

export interface KeyEvent {
  key: string;
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

export interface MouseEvent {
  x: number;
  y: number;
  type: "press" | "release" | "drag" | "move" | "scroll_up" | "scroll_down";
  button: "left" | "right" | "middle" | "none";
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
  graphicsProtocol: "kitty" | "iterm2" | "sixel" | "none";
  terminalProgram?: string;
  cellSize?: { width: number; height: number };
}

export declare interface Driver {
  on(event: "resize", listener: (size: Size) => void): this;
  on(event: "key", listener: (ev: KeyEvent) => void): this;
  on(event: "mouse", listener: (ev: MouseEvent) => void): this;
  on(event: "capabilities_resolved", listener: () => void): this;
  emit(event: "resize", size: Size): boolean;
  emit(event: "key", ev: KeyEvent): boolean;
  emit(event: "mouse", ev: MouseEvent): boolean;
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
  ): string {
    return "";
  }
  public clearScreen(): void {
    this.write("\x1b[H\x1b[2J\x1b[3J");
  }
  public writeFrame(data: string): void {
    if (this.capabilities.synchronizedUpdates) {
      this.write(`\x1b[?2026h${data}\x1b[?2026l`);
    } else {
      this.write(data);
    }
  }
}
