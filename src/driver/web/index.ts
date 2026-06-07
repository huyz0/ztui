import { Size } from "../../geometry/size.ts";
import { type Clipboard, Driver, type TerminalCapabilities } from "../driver.ts";

export class WebDriver extends Driver {
  public override readonly capabilities: TerminalCapabilities;
  public override readonly clipboard: Clipboard;
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
      mouseHover: true,
      hyperlinks: true,
      synchronizedUpdates: false,
      glyphProtocol: false,
      clipboard: true,
      notifications: false,
      graphicsProtocol: "none", // Web driver renders raw DOM/SVG directly rather than writing ANSI protocols
    };

    this.clipboard = {
      get: async () => "",
      set: () => {},
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
    // Web driver renders DOM/SVG nodes directly in a browser page/canvas
  }

  public showNotification(_title: string, _body: string): void {}
}
