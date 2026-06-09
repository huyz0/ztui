import { logger } from "../../core/logger.ts";
import { Size } from "../../geometry/size.ts";
import { iconRegistry } from "../../render/icon-registry.ts";
import { type Clipboard, Driver, type TerminalCapabilities } from "../driver.ts";
import { getBaselineCapabilities, parseProbeResponse } from "./capabilities.ts";
import { TerminalGraphicsManager } from "./graphics.ts";
import { parseInput } from "./input.ts";

export class BunDriver extends Driver {
  private graphicsManager = new TerminalGraphicsManager();
  public override readonly capabilities!: TerminalCapabilities;
  public override readonly clipboard: Clipboard = {
    get: (): Promise<string> => {
      return new Promise<string>((resolve) => {
        this.pendingClipboardResolvers.push(resolve);
        this.write("\x1b]52;c;?\x07");
        setTimeout(() => {
          const idx = this.pendingClipboardResolvers.indexOf(resolve);
          if (idx !== -1) {
            this.pendingClipboardResolvers.splice(idx, 1);
            resolve("");
          }
        }, 500);
      });
    },
    set: (text: string): void => {
      this.write(`\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`);
    },
  };

  private isRunning = false;
  private stdin: any;
  private stdout: any;
  private isProbing = false;
  private probeBuffer = "";
  private probeTimeout: any = null;
  private pendingClipboardResolvers: ((text: string) => void)[] = [];

  private resizeListener = () => {
    this.emit("resize", this.getSize());
  };

  private cleanupHandler = () => {
    this.stop();
  };

  private sigintHandler = () => {
    this.stop();
    process.exit(130);
  };

  private sigtermHandler = () => {
    this.stop();
    process.exit(143);
  };

  constructor(options?: { stdin?: any; stdout?: any }) {
    super();
    this.stdin = options?.stdin || process.stdin;
    this.stdout = options?.stdout || process.stdout;
    this.capabilities = getBaselineCapabilities();
  }

  public getSize(): Size {
    return new Size(this.stdout.columns || 80, this.stdout.rows || 24);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Enable alternative buffer, clear screen, hide cursor
    this.write("\x1b[?1049h\x1b[?25l");

    if (this.stdin.setRawMode) {
      this.stdin.setRawMode(true);
    }
    this.stdin.resume();
    this.stdin.setEncoding("utf8");

    this.stdin.on("data", this.handleInputInternal);
    if (this.stdout.on) {
      this.stdout.on("resize", this.resizeListener);
    }

    process.on("exit", this.cleanupHandler);
    process.on("SIGINT", this.sigintHandler);
    process.on("SIGTERM", this.sigtermHandler);

    const isTTY = this.stdin.isTTY && this.stdout.isTTY;
    if (isTTY) {
      this.isProbing = true;
      this.capabilitiesResolved = false;
      this.probeBuffer = "";

      // Emit probe escape sequences to stdout
      this.write(
        "\x1b[c\x1b[>c\x1b[?u\x1b_Gi=31,a=q;\x1b\\\x1b[?1003$p\x1b[?2026$p\x1b_25a1;s\x1b\\\x1b[14t\x1b[16t",
      );

      this.probeTimeout = setTimeout(() => {
        this.finishProbing();
      }, 100);
    } else {
      this.capabilitiesResolved = true;
      this.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");
    }
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.probeTimeout) {
      clearTimeout(this.probeTimeout);
      this.probeTimeout = null;
    }

    // Disable mouse tracking (hover 1003 and standard 1000/1002/1006)
    this.write("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l");

    // Disable kitty keyboard mode if activated
    if (this.capabilities.kittyKeyboard) {
      this.write("\x1b[<u");
    }

    // Restore main buffer, show cursor
    this.write("\x1b[?1049l\x1b[?25h");

    this.stdin.off("data", this.handleInputInternal);
    if (this.stdout.off) {
      this.stdout.off("resize", this.resizeListener);
    }

    process.off("exit", this.cleanupHandler);
    process.off("SIGINT", this.sigintHandler);
    process.off("SIGTERM", this.sigtermHandler);

    if (this.stdin.setRawMode) {
      this.stdin.setRawMode(false);
    }
    this.stdin.pause();
  }

  public write(data: string): void {
    if (typeof this.stdout.write === "function") {
      this.stdout.write(data);
    }
  }

  public showNotification(title: string, body: string): void {
    this.write(`\x1b]9;${title}: ${body}\x07`);
    this.write(`\x1b]777;notify;${title};${body}\x07`);
  }

  private handleInputInternal = (chunk: string | Buffer): void => {
    let data = chunk.toString();

    // Intercept OSC 52 clipboard responses
    const clipboardMatch = data.match(/\x1b\]52;[cp]?;([A-Za-z0-9+/=]*)(?:\x07|\x1b\\)/);
    if (clipboardMatch) {
      const base64 = clipboardMatch[1];
      const text = Buffer.from(base64, "base64").toString("utf8");
      const resolve = this.pendingClipboardResolvers.shift();
      if (resolve) {
        resolve(text);
      }
      data = data.replace(clipboardMatch[0], "");
    }

    if (data.length === 0) return;

    // Intercept late-arriving capability responses when not probing
    if (!this.isProbing) {
      let matchedAny = false;

      // 1. DA1 Match
      while (true) {
        const da1Match = data.match(/\x1b\[\?([\d;]+)c/);
        if (!da1Match) break;
        const params = da1Match[1].split(";");
        if (params.includes("4") && this.capabilities.graphicsProtocol === "none") {
          this.capabilities.graphicsProtocol = "sixel";
        }
        data = data.replace(da1Match[0], "");
        matchedAny = true;
      }

      // 2. DA2 Match
      while (true) {
        const da2Match = data.match(/\x1b\[>([\d;]*)c/);
        if (!da2Match) break;
        data = data.replace(da2Match[0], "");
        matchedAny = true;
      }

      // 3. Kitty keyboard match
      while (true) {
        const kittyKeyMatch = data.match(/\x1b\[\?(\d+)u/);
        if (!kittyKeyMatch) break;
        this.capabilities.kittyKeyboard = true;
        data = data.replace(kittyKeyMatch[0], "");
        matchedAny = true;
      }

      // 4. Kitty graphics status match
      while (true) {
        const kittyGraphMatch = data.match(/\x1b_Gi=31;([^\x1b]+)\x1b\\/);
        if (!kittyGraphMatch) break;
        if (kittyGraphMatch[1].includes("OK")) {
          this.capabilities.graphicsProtocol = "kitty";
        }
        data = data.replace(kittyGraphMatch[0], "");
        matchedAny = true;
      }

      // 5. Mouse hover match
      while (true) {
        const hoverMatch = data.match(/\x1b\[\?1003;([0-4])\$y/);
        if (!hoverMatch) break;
        const status = hoverMatch[1];
        if (status === "1" || status === "2") {
          this.capabilities.mouseHover = true;
        }
        data = data.replace(hoverMatch[0], "");
        matchedAny = true;
      }

      // 6. Synchronized updates match
      while (true) {
        const syncMatch = data.match(/\x1b\[\?2026;([0-4])\$y/);
        if (!syncMatch) break;
        const status = syncMatch[1];
        if (status === "1" || status === "2") {
          this.capabilities.synchronizedUpdates = true;
        }
        data = data.replace(syncMatch[0], "");
        matchedAny = true;
      }

      // 7. Glyph protocol match
      while (true) {
        const glyphMatch = data.match(/\x1b_25a1;s(?:;[^\x1b]*)?\x1b\\/);
        if (!glyphMatch) break;
        this.capabilities.glyphProtocol = true;
        data = data.replace(glyphMatch[0], "");
        matchedAny = true;
      }

      // 8. Window pixel size response
      while (true) {
        const pixelSizeMatch = data.match(/\x1b\[4;(\d+);(\d+)t/);
        if (!pixelSizeMatch) break;
        const height = Number.parseInt(pixelSizeMatch[1], 10);
        const width = Number.parseInt(pixelSizeMatch[2], 10);
        const columns = this.stdout.columns || 80;
        const rows = this.stdout.rows || 24;
        if (width > 0 && height > 0) {
          const probedCellWidth = Math.round(width / columns);
          const probedCellHeight = Math.round(height / rows);
          this.capabilities.cellSize = { width: probedCellWidth, height: probedCellHeight };
        }
        data = data.replace(pixelSizeMatch[0], "");
        matchedAny = true;
      }

      // 9. Cell size response
      while (true) {
        const cellSizeMatch = data.match(/\x1b\[6;(\d+);(\d+)t/);
        if (!cellSizeMatch) break;
        const height = Number.parseInt(cellSizeMatch[1], 10);
        const width = Number.parseInt(cellSizeMatch[2], 10);
        if (width > 0 && height > 0) {
          this.capabilities.cellSize = { width, height };
        }
        data = data.replace(cellSizeMatch[0], "");
        matchedAny = true;
      }

      if (matchedAny) {
        this.emit("capabilities_resolved");
      }
    }

    if (data.length === 0) return;

    if (this.isProbing) {
      this.probeBuffer += data;
      return;
    }
    this.processInput(data);
  };

  private finishProbing(): void {
    this.isProbing = false;
    this.probeTimeout = null;

    const columns = this.stdout.columns || 80;
    const rows = this.stdout.rows || 24;

    const result = parseProbeResponse(this.probeBuffer, this.capabilities, columns, rows);
    const leftover = result.leftover;

    // Activate/degrade protocols
    if (this.capabilities.kittyKeyboard) {
      this.write("\x1b[>1u"); // Activate advanced keyboard mode
    }

    if (this.capabilities.mouseHover) {
      this.write("\x1b[?1000h\x1b[?1003h\x1b[?1006h");
    } else {
      this.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");
    }

    // Replay remaining key events
    if (leftover.length > 0) {
      this.processInput(leftover);
    }
    this.probeBuffer = "";

    if (this.capabilities.glyphProtocol) {
      for (const icon of iconRegistry.getAll()) {
        const codepoint = iconRegistry.getCodepoint(icon.name);
        if (codepoint) {
          const hex = codepoint.toString(16);
          const base64Svg = Buffer.from(icon.svg).toString("base64");
          this.write(`\x1b_25a1;d;cp=${hex};fmt=svg;width=2;${base64Svg}\x1b\\`);
        }
      }
    }

    this.capabilitiesResolved = true;
    this.emit("capabilities_resolved");
  }

  private processInput(data: string): void {
    // Safety exit sequence: Ctrl+C
    if (data === "\u0003") {
      this.stop();
      process.exit(0);
    }

    try {
      parseInput(
        data,
        (ev) => this.emit("key", ev),
        (ev) => this.emit("mouse", ev),
      );
    } catch (err) {
      // Malformed input bytes (or a throwing event listener) must not kill the
      // read loop and freeze all input.
      logger.error("input", `failed to process input chunk (${data.length} bytes)`, err);
    }
  }

  public override getIconSequence(name: string, color?: string, bgColor?: string): string {
    return this.graphicsManager.getIconSequence(name, this.capabilities, color, bgColor);
  }

  public override getImageSequence(
    pixelBuffer: Uint8Array,
    pixelWidth: number,
    pixelHeight: number,
    cellWidth: number,
    cellHeight: number,
    pngBase64?: string,
    bgColor?: string,
    zIndex?: number,
  ): string {
    return this.graphicsManager.getImageSequence(
      pixelBuffer,
      pixelWidth,
      pixelHeight,
      cellWidth,
      cellHeight,
      this.capabilities,
      pngBase64,
      bgColor,
      zIndex,
    );
  }
  public override clearScreen(): void {
    this.write("\x1b[H\x1b[2J\x1b[3J");
    if (this.capabilities.graphicsProtocol === "kitty") {
      this.write("\x1b_Ga=d\x1b\\\x1b_Ga=d,d=A\x1b\\");
    }
  }

  public override getGraphicClearSequence(): string {
    // Kitty: delete the image placement covering the cursor cell.
    return this.capabilities.graphicsProtocol === "kitty" ? "\x1b_Ga=d,d=c\x1b\\" : "";
  }
}
