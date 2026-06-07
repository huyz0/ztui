import { Size } from "../geometry/size.ts";
import { renderCapabilities } from "../render/style.ts";
import {
  type RasterizedIcon,
  iconRegistry,
  rasterizeSVG,
  rgbaToSixel,
} from "../widgets/icon-registry.ts";
import {
  type Clipboard,
  Driver,
  type KeyEvent,
  type MouseEvent,
  type TerminalCapabilities,
} from "./driver.ts";

export class BunDriver extends Driver {
  private iconCache = new Map<
    string,
    {
      raster?: RasterizedIcon;
      cellWidth?: number;
      cellHeight?: number;
      sixelCache?: Map<string, string>;
    }
  >();
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
    this.initCapabilities();
  }

  private initCapabilities(): void {
    const term = process.env.TERM || "";
    const colorterm = process.env.COLORTERM || "";
    const termProgram = process.env.TERM_PROGRAM || "";
    const lcTerminal = process.env.LC_TERMINAL || "";

    const isWT = !!process.env.WT_SESSION || !!process.env.WT_PROFILE_ID;

    const truecolor =
      colorterm === "truecolor" ||
      colorterm === "24bit" ||
      termProgram === "WezTerm" ||
      termProgram === "ghostty" ||
      isWT;
    const color256 = term.includes("256color") || truecolor;

    const hyperlinks =
      termProgram === "WezTerm" ||
      termProgram === "ghostty" ||
      termProgram === "iTerm.app" ||
      lcTerminal === "iTerm2" ||
      isWT ||
      !!process.env.VTE_VERSION;

    const mouseHover =
      termProgram === "WezTerm" ||
      termProgram === "ghostty" ||
      termProgram === "iTerm.app" ||
      isWT ||
      !!process.env.VTE_VERSION;

    let graphicsProtocol: "kitty" | "iterm2" | "sixel" | "none" = "none";
    if (termProgram === "iTerm.app" || lcTerminal === "iTerm2") {
      graphicsProtocol = "iterm2";
    } else if (termProgram === "WezTerm" || termProgram === "ghostty") {
      graphicsProtocol = "kitty";
    } else if (isWT) {
      graphicsProtocol = "sixel";
    }

    // Capabilities initialized to baseline configuration
    (this as any).capabilities = {
      truecolor,
      color256,
      kittyKeyboard: false,
      mouseTracking: true,
      mouseHover,
      hyperlinks,
      synchronizedUpdates: false,
      glyphProtocol: false,
      clipboard: true,
      notifications: true,
      graphicsProtocol,
      terminalProgram: termProgram || (isWT ? "Windows Terminal" : undefined),
      cellSize: isWT ? { width: 11, height: 22 } : { width: 10, height: 20 },
    };
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

      // Emit probe escape sequences to stdout:
      // 0. DA1: \x1b[c
      // 1. DA2: \x1b[>c
      // 2. Kitty keyboard query: \x1b[?u
      // 3. Kitty graphics query: \x1b_Gi=31,a=q;\x1b\\
      // 4. DECRQM Mouse Hover query: \x1b[?1003$p
      // 5. DECRQM Synchronized Updates query: \x1b[?2026$p
      // 6. Glyph Protocol support query: \x1b_25a1;s\x1b\\
      // 7. Window pixel size query (14t) and Cell size query (16t)
      this.write(
        "\x1b[c\x1b[>c\x1b[?u\x1b_Gi=31,a=q;\x1b\\\x1b[?1003$p\x1b[?2026$p\x1b_25a1;s\x1b\\\x1b[14t\x1b[16t",
      );

      this.probeTimeout = setTimeout(() => {
        this.finishProbing();
      }, 100);
    } else {
      // Non-TTY environment: bypass probing, sync capabilities, and enable fallback mouse mode
      this.capabilitiesResolved = true;
      renderCapabilities.truecolor = this.capabilities.truecolor;
      renderCapabilities.color256 = this.capabilities.color256;
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

    if (this.isProbing) {
      this.probeBuffer += data;
      return;
    }
    this.processInput(data);
  };

  private finishProbing(): void {
    this.isProbing = false;
    this.probeTimeout = null;

    let leftover = this.probeBuffer;

    // Parse DA1 check
    const da1Match = leftover.match(/\x1b\[\?([\d;]+)c/);
    if (da1Match) {
      const params = da1Match[1].split(";");
      if (params.includes("4") && this.capabilities.graphicsProtocol === "none") {
        this.capabilities.graphicsProtocol = "sixel";
      }
      leftover = leftover.replace(da1Match[0], "");
    }

    // Parse DA2 check
    const da2Match = leftover.match(/\x1b\[>([\d;]*)c/);
    if (da2Match) {
      leftover = leftover.replace(da2Match[0], "");
    }

    // Parse Kitty Keyboard query response: \x1b[?<flags>u
    const kittyKeyMatch = leftover.match(/\x1b\[\?(\d+)u/);
    if (kittyKeyMatch) {
      this.capabilities.kittyKeyboard = true;
      leftover = leftover.replace(kittyKeyMatch[0], "");
    }

    // Parse Kitty Graphics response: \x1b_Gi=31;<status>\x1b\\
    const kittyGraphMatch = leftover.match(/\x1b_Gi=31;([^\x1b]+)\x1b\\/);
    if (kittyGraphMatch) {
      if (kittyGraphMatch[1].includes("OK")) {
        this.capabilities.graphicsProtocol = "kitty";
      }
      leftover = leftover.replace(kittyGraphMatch[0], "");
    }

    // Parse Mouse Hover DECRQM response: \x1b[?1003;<status>$y
    const hoverMatch = leftover.match(/\x1b\[\?1003;([0-4])\$y/);
    if (hoverMatch) {
      const status = hoverMatch[1];
      if (status === "1" || status === "2") {
        this.capabilities.mouseHover = true;
      }
      leftover = leftover.replace(hoverMatch[0], "");
    }

    // Parse Synchronized Updates DECRQM response: \x1b[?2026;<status>$y
    const syncMatch = leftover.match(/\x1b\[\?2026;([0-4])\$y/);
    if (syncMatch) {
      const status = syncMatch[1];
      if (status === "1" || status === "2") {
        this.capabilities.synchronizedUpdates = true;
      }
      leftover = leftover.replace(syncMatch[0], "");
    }

    // Parse Glyph Protocol support query response: \x1b_25a1;s;fmt=<formats>\x1b\\ or \x1b_25a1;s\x1b\\
    const glyphMatch = leftover.match(/\x1b_25a1;s(?:;[^\x1b]*)?\x1b\\/);
    if (glyphMatch) {
      this.capabilities.glyphProtocol = true;
      leftover = leftover.replace(glyphMatch[0], "");
    }

    // Parse window pixel size response: \x1b[4;height;widtht
    const pixelSizeMatch = leftover.match(/\x1b\[4;(\d+);(\d+)t/);
    let probedCellWidth = 0;
    let probedCellHeight = 0;
    if (pixelSizeMatch) {
      const height = Number.parseInt(pixelSizeMatch[1], 10);
      const width = Number.parseInt(pixelSizeMatch[2], 10);
      const cols = this.stdout.columns || 80;
      const rows = this.stdout.rows || 24;
      if (width > 0 && height > 0) {
        probedCellWidth = Math.round(width / cols);
        probedCellHeight = Math.round(height / rows);
      }
      leftover = leftover.replace(pixelSizeMatch[0], "");
    }

    // Parse character cell size response: \x1b[6;height;widtht
    const cellSizeMatch = leftover.match(/\x1b\[6;(\d+);(\d+)t/);
    if (cellSizeMatch) {
      const height = Number.parseInt(cellSizeMatch[1], 10);
      const width = Number.parseInt(cellSizeMatch[2], 10);
      if (width > 0 && height > 0) {
        this.capabilities.cellSize = { width, height };
      }
      leftover = leftover.replace(cellSizeMatch[0], "");
    } else if (probedCellWidth > 0 && probedCellHeight > 0) {
      this.capabilities.cellSize = { width: probedCellWidth, height: probedCellHeight };
    }

    // Activate/degrade protocols
    if (this.capabilities.kittyKeyboard) {
      this.write("\x1b[>1u"); // Activate advanced keyboard mode
    }

    if (this.capabilities.mouseHover) {
      this.write("\x1b[?1000h\x1b[?1003h\x1b[?1006h");
    } else {
      this.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");
    }

    // Sync capabilities to style module config
    renderCapabilities.truecolor = this.capabilities.truecolor;
    renderCapabilities.color256 = this.capabilities.color256;

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

    let i = 0;
    while (i < data.length) {
      if (data.charCodeAt(i) === 27) {
        // Escape
        const remaining = data.slice(i);

        // Kitty Keyboard sequence check
        const kittyMatch = remaining.match(/^\x1b\[(\d+)(?:;(\d+))?(?::(\d+))?u/);
        if (kittyMatch) {
          const keycode = Number.parseInt(kittyMatch[1]);
          const modifiers = kittyMatch[2] ? Number.parseInt(kittyMatch[2]) : 1;
          const eventType = kittyMatch[3] ? Number.parseInt(kittyMatch[3]) : 1;

          // Only emit on press (1) and repeat (2)
          if (eventType === 1 || eventType === 2) {
            const modVal = modifiers - 1;
            const shift = (modVal & 1) !== 0;
            const meta = (modVal & 2) !== 0;
            const ctrl = (modVal & 4) !== 0;

            let keyName = "";
            const keyMap: Record<number, string> = {
              27: "escape",
              9: "tab",
              13: "enter",
              127: "backspace",
              57376: "up",
              57377: "down",
              57378: "left",
              57379: "right",
              57380: "insert",
              57381: "delete",
              57382: "pageup",
              57383: "pagedown",
              57384: "home",
              57385: "end",
            };

            if (keyMap[keycode] !== undefined) {
              keyName = keyMap[keycode];
            } else if (keycode >= 32 && keycode <= 126) {
              keyName = String.fromCharCode(keycode);
            } else {
              keyName = `key_${keycode}`;
            }

            let keyStr = keyName;
            if (keyStr.length === 1 && shift) {
              keyStr = keyStr.toUpperCase();
            }

            if (ctrl && !keyStr.startsWith("ctrl+")) {
              keyStr = `ctrl+${keyStr}`;
            }

            this.emit("key", {
              key: keyStr,
              name: keyName,
              ctrl,
              meta,
              shift,
            });
          }

          i += kittyMatch[0].length;
          continue;
        }

        // Check SGR mouse: \x1b[<button;x;yM or \x1b[<button;x;ym
        const mouseMatch = remaining.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
        if (mouseMatch) {
          const btnCode = Number.parseInt(mouseMatch[1]);
          const x = Number.parseInt(mouseMatch[2]) - 1; // 1-based coordinates
          const y = Number.parseInt(mouseMatch[3]) - 1;
          const isRelease = mouseMatch[4] === "m";

          let type: MouseEvent["type"] = "press";
          let button: MouseEvent["button"] = "none";

          if (btnCode === 64) {
            type = "scroll_up";
          } else if (btnCode === 65) {
            type = "scroll_down";
          } else {
            const baseBtn = btnCode & 3;
            const isMove = (btnCode & 64) !== 0 || btnCode === 35; // 35 is movement without press
            const isDrag = !isMove && (btnCode & 32) !== 0;

            if (btnCode !== 35) {
              if (baseBtn === 0) button = "left";
              else if (baseBtn === 1) button = "middle";
              else if (baseBtn === 2) button = "right";
            }

            if (isRelease) {
              type = "release";
            } else if (isDrag) {
              type = "drag";
            } else if (isMove) {
              type = "move";
            } else {
              type = "press";
            }
          }

          this.emit("mouse", { x, y, type, button });
          i += mouseMatch[0].length;
          continue;
        }

        // Arrow keys: \x1b[A (Up), \x1b[B (Down), \x1b[C (Right), \x1b[D (Left)
        const seqMatch = remaining.match(/^\x1b\[([A-D])/);
        if (seqMatch) {
          const dir = seqMatch[1];
          const nameMap: Record<string, string> = { A: "up", B: "down", C: "right", D: "left" };
          this.emit("key", {
            key: nameMap[dir],
            name: nameMap[dir],
            ctrl: false,
            meta: false,
            shift: false,
          });
          i += seqMatch[0].length;
          continue;
        }

        // Shift-Tab: \x1b[Z
        if (remaining.startsWith("\x1b[Z")) {
          this.emit("key", {
            key: "tab",
            name: "tab",
            ctrl: false,
            meta: false,
            shift: true,
          });
          i += 3;
          continue;
        }

        // Generic Escape sequences
        const miscMatch = remaining.match(/^\x1b\[([a-zA-Z0-9;]+)/);
        if (miscMatch) {
          this.emit("key", {
            key: miscMatch[0],
            name: "escape_sequence",
            ctrl: false,
            meta: false,
            shift: false,
          });
          i += miscMatch[0].length;
          continue;
        }

        // Literal Escape press
        if (remaining.length === 1) {
          this.emit("key", {
            key: "escape",
            name: "escape",
            ctrl: false,
            meta: false,
            shift: false,
          });
          i++;
          continue;
        }
      }

      const char = data[i];
      const code = char.charCodeAt(0);

      // Backspace
      if (code === 127 || code === 8) {
        this.emit("key", {
          key: "backspace",
          name: "backspace",
          ctrl: false,
          meta: false,
          shift: false,
        });
      }
      // Enter
      else if (code === 13 || code === 10) {
        this.emit("key", { key: "enter", name: "enter", ctrl: false, meta: false, shift: false });
      }
      // Tab
      else if (code === 9) {
        this.emit("key", { key: "tab", name: "tab", ctrl: false, meta: false, shift: false });
      }
      // Ctrl+A to Ctrl+Z (code 1-26, omitting standard control keys like Tab/Enter/Backspace)
      else if (code >= 1 && code <= 26 && code !== 9 && code !== 10 && code !== 13) {
        const keyChar = String.fromCharCode(code + 96);
        this.emit("key", {
          key: `ctrl+${keyChar}`,
          name: keyChar,
          ctrl: true,
          meta: false,
          shift: false,
        });
      }
      // Standard character input
      else {
        this.emit("key", {
          key: char,
          name: char,
          ctrl: false,
          meta: false,
          shift: char === char.toUpperCase() && char !== char.toLowerCase(),
        });
      }

      i++;
    }
  }

  private getOrRasterize(name: string, svg: string, color: string): RasterizedIcon {
    const isWT = !!process.env.WT_SESSION || !!process.env.WT_PROFILE_ID;
    const cellWidth = this.capabilities.cellSize?.width || (isWT ? 11 : 10);
    const cellHeight = this.capabilities.cellSize?.height || (isWT ? 22 : 20);

    const cacheKey = `${name}_${color}`;
    const cache = this.iconCache.get(cacheKey);
    if (cache?.raster && cache.cellWidth === cellWidth && cache.cellHeight === cellHeight) {
      return cache.raster;
    }

    const raster = rasterizeSVG(svg, cellWidth * 2, cellHeight, color);
    this.iconCache.set(cacheKey, {
      raster,
      cellWidth,
      cellHeight,
      sixelCache: new Map(),
    });
    return raster;
  }

  public override getIconSequence(name: string, color?: string, bgColor?: string): string {
    const icon = iconRegistry.get(name);
    if (!icon) return "";

    const fgColor = color && color !== "default" ? color : "white";

    if (this.capabilities.graphicsProtocol === "kitty") {
      const raster = this.getOrRasterize(name, icon.svg, fgColor);
      const w = raster.superWidth !== undefined ? raster.superWidth : raster.width;
      const h = raster.superHeight !== undefined ? raster.superHeight : raster.height;
      return `\x1b[s\x1b_Gf=100,a=T,t=d,s=${w},v=${h},c=2,r=1;${raster.pngBase64}\x1b\\\x1b[u`;
    }

    if (this.capabilities.graphicsProtocol === "iterm2") {
      const raster = this.getOrRasterize(name, icon.svg, fgColor);
      return `\x1b[s\x1b]1337;File=inline=1;width=2;height=1:${raster.pngBase64}\x07\x1b[u`;
    }

    if (this.capabilities.graphicsProtocol === "sixel") {
      const raster = this.getOrRasterize(name, icon.svg, fgColor);
      const bgClr = bgColor && bgColor !== "default" ? bgColor : "#1e1e2e";
      const cacheKey = `${fgColor}_${bgClr}`;

      const cacheKeyWithColor = `${name}_${fgColor}`;
      let cache = this.iconCache.get(cacheKeyWithColor);
      if (!cache) {
        cache = { raster };
        this.iconCache.set(cacheKeyWithColor, cache);
      }
      if (!cache.sixelCache) {
        cache.sixelCache = new Map();
      }
      let sixel = cache.sixelCache.get(cacheKey);
      if (!sixel) {
        sixel = rgbaToSixel(raster.pixels, raster.width, raster.height, fgColor, bgClr);
        cache.sixelCache.set(cacheKey, sixel);
      }
      return `\x1b[s${sixel}\x1b[u`;
    }

    if (this.capabilities.glyphProtocol) {
      const codepoint = iconRegistry.getCodepoint(name);
      return codepoint ? String.fromCodePoint(codepoint) : icon.textFallback;
    }

    return icon.textFallback;
  }
}
