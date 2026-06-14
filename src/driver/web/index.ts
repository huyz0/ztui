import { Size } from "../../geometry/size.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { renderBufferToHTML, renderBufferToText } from "../../render/html-renderer.ts";
import {
  type Clipboard,
  Driver,
  type KeyEvent,
  type MouseEvent,
  type TerminalCapabilities,
} from "../driver.ts";

/**
 * Browser/headless backend: instead of consuming the ANSI diff, it receives the
 * composed cell grid via {@link presentBuffer} and hands it to an `onFrame`
 * consumer (e.g. the DOM binding in `./dom.ts`, a canvas painter, or a test).
 *
 * Input flows the other way through the `dispatch*` methods, which feed the
 * same `key`/`mouse`/`paste`/`resize` events a terminal driver would emit —
 * the App and widgets cannot tell the difference.
 */
export class WebDriver extends Driver {
  public override readonly capabilities: TerminalCapabilities;
  public override readonly clipboard: Clipboard;
  /** Called with the live frame buffer after every changed frame. */
  public onFrame?: (buffer: ScreenBuffer) => void;
  /**
   * Smallest cell grid the backend will report, regardless of window size.
   * Unlike a TTY, a browser window can be tiny, so we hold a comfortable floor
   * (120×50) and let widgets clip/scroll rather than collapse. Public so the
   * host page can size its grid to at least this.
   */
  public readonly minWidth: number;
  /** Minimum reported grid height in cells. */
  public readonly minHeight: number;
  private width: number;
  private height: number;
  private lastBuffer: ScreenBuffer | null = null;
  private clipboardText = "";

  constructor(width = 120, height = 50, minWidth = 120, minHeight = 50) {
    super();
    this.minWidth = minWidth;
    this.minHeight = minHeight;
    this.width = Math.max(minWidth, width);
    this.height = Math.max(minHeight, height);
    this.capabilities = {
      truecolor: true,
      color256: true,
      kittyKeyboard: false,
      mouseTracking: true,
      mouseHover: true,
      hyperlinks: true,
      synchronizedUpdates: false,
      glyphProtocol: false,
      clipboard: true,
      notifications: false,
      // The canvas draws images/SVG natively (drawImage), so widgets emit
      // vector/raster source instead of ANSI-encoding pixels.
      graphicsProtocol: "web",
      // The browser page (and any server behind it) is long-lived and shared —
      // a user's Ctrl+C must never tear it down, so the App won't process.exit.
      ownsProcess: false,
    };

    // Backed by the browser clipboard when available (requires a secure
    // context + user gesture); otherwise an in-memory fallback so copy/paste
    // still round-trips inside the app.
    const nav: any = typeof navigator !== "undefined" ? navigator : undefined;
    this.clipboard = {
      get: async () => {
        if (nav?.clipboard?.readText) {
          try {
            return await nav.clipboard.readText();
          } catch {
            /* permission denied -> fall back */
          }
        }
        return this.clipboardText;
      },
      set: (text: string) => {
        this.clipboardText = text;
        nav?.clipboard?.writeText?.(text).catch(() => {});
      },
    };
  }

  public getSize(): Size {
    return new Size(this.width, this.height);
  }

  public start(): void {
    this.capabilitiesResolved = true;
    this.emit("capabilities_resolved");
  }

  public stop(): void {}

  public write(_data: string): void {
    // ANSI output is irrelevant on this backend; frames arrive via presentBuffer.
  }

  public override presentBuffer(buffer: ScreenBuffer): void {
    this.lastBuffer = buffer;
    this.onFrame?.(buffer);
  }

  /** The most recently presented frame as styled HTML (empty before first frame). */
  public toHTML(): string {
    return this.lastBuffer ? renderBufferToHTML(this.lastBuffer) : "";
  }

  /** The most recently presented frame as plain text (empty before first frame). */
  public toText(): string {
    return this.lastBuffer ? renderBufferToText(this.lastBuffer) : "";
  }

  // ---- input injection (host -> app) ---------------------------------------

  /** Feed a key event to the app (from a DOM listener). */
  public dispatchKey(ev: KeyEvent): void {
    this.emit("key", ev);
  }

  /** Coordinates are in cell units; the DOM binding maps pixels to cells. */
  public dispatchMouse(ev: MouseEvent): void {
    this.emit("mouse", ev);
  }

  /** Feed pasted text to the app. */
  public dispatchPaste(text: string): void {
    this.emit("paste", text);
  }

  /** Resize the grid (clamped to the minimums). */
  public resize(width: number, height: number): void {
    const w = Math.max(this.minWidth, Math.floor(width));
    const h = Math.max(this.minHeight, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.emit("resize", new Size(w, h));
  }

  public showNotification(title: string, body: string): void {
    const N: any = (globalThis as any).Notification;
    if (N?.permission === "granted") new N(title, { body });
  }
}
