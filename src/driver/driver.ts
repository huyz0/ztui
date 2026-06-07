import { EventEmitter } from "node:events";
import type { Size } from "../geometry/size.ts";

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
  graphicsProtocol: "kitty" | "iterm2" | "none";
  terminalProgram?: string;
}

export declare interface Driver {
  on(event: "resize", listener: (size: Size) => void): this;
  on(event: "key", listener: (ev: KeyEvent) => void): this;
  on(event: "mouse", listener: (ev: MouseEvent) => void): this;
  emit(event: "resize", size: Size): boolean;
  emit(event: "key", ev: KeyEvent): boolean;
  emit(event: "mouse", ev: MouseEvent): boolean;
}

export abstract class Driver extends EventEmitter {
  public abstract readonly capabilities: TerminalCapabilities;
  abstract start(): void;
  abstract stop(): void;
  abstract write(data: string): void;
  abstract getSize(): Size;
}
