import { Size } from "../../geometry/size.ts";
import { type Clipboard, Driver, type MouseEvent, type TerminalCapabilities } from "../driver.ts";

export class MockDriver extends Driver {
  public writtenData = "";
  public override readonly capabilities: TerminalCapabilities;
  public override readonly clipboard: Clipboard;
  private isRunning = false;
  private width: number;
  private height: number;

  constructor(width = 80, height = 24) {
    super();
    this.width = width;
    this.height = height;
    this.capabilities = {
      truecolor: true,
      color256: true,
      kittyKeyboard: false,
      mouseTracking: true,
      mouseHover: false,
      hyperlinks: true,
      synchronizedUpdates: false,
      glyphProtocol: false,
      clipboard: true,
      notifications: true,
      graphicsProtocol: "none",
    };
    let mockClipboardText = "";
    this.clipboard = {
      get: async () => mockClipboardText,
      set: (text: string) => {
        mockClipboardText = text;
        this.write(`\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`);
      },
    };
  }

  public getSize(): Size {
    return new Size(this.width, this.height);
  }

  public start(): void {
    this.isRunning = true;
    this.writtenData = "";
    this.capabilitiesResolved = true;
    this.emit("capabilities_resolved");
  }

  public stop(): void {
    this.isRunning = false;
  }

  public write(data: string): void {
    this.writtenData += data;
  }

  public clearWrittenData(): void {
    this.writtenData = "";
  }

  public showNotification(title: string, body: string): void {
    this.write(`\x1b]9;${title}: ${body}\x07`);
    this.write(`\x1b]777;notify;${title};${body}\x07`);
  }

  public simulateKey(
    key: string,
    name: string = key,
    ctrl = false,
    shift = false,
    meta = false,
  ): void {
    this.emit("key", { key, name, ctrl, shift, meta });
  }

  public simulateMouse(
    x: number,
    y: number,
    type: MouseEvent["type"],
    button: MouseEvent["button"],
  ): void {
    this.emit("mouse", { x, y, type, button });
  }

  public simulateResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.emit("resize", new Size(width, height));
  }
}
