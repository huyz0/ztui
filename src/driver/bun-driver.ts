import { Size } from "../geometry/size.ts";
import { renderCapabilities } from "../render/style.ts";
import { Driver, KeyEvent, type MouseEvent, type TerminalCapabilities } from "./driver.ts";

export class BunDriver extends Driver {
  public override readonly capabilities!: TerminalCapabilities;

  private isRunning = false;
  private stdin: any;
  private stdout: any;
  private isProbing = false;
  private probeBuffer = "";
  private probeTimeout: any = null;

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

    const truecolor =
      colorterm === "truecolor" ||
      colorterm === "24bit" ||
      termProgram === "WezTerm" ||
      termProgram === "ghostty";
    const color256 = term.includes("256color") || truecolor;

    const hyperlinks =
      termProgram === "WezTerm" ||
      termProgram === "ghostty" ||
      termProgram === "iTerm.app" ||
      lcTerminal === "iTerm2" ||
      !!process.env.VTE_VERSION;

    let graphicsProtocol: "kitty" | "iterm2" | "none" = "none";
    if (termProgram === "iTerm.app" || lcTerminal === "iTerm2") {
      graphicsProtocol = "iterm2";
    } else if (termProgram === "WezTerm" || termProgram === "ghostty") {
      graphicsProtocol = "kitty";
    }

    // Capabilities initialized to baseline configuration
    (this as any).capabilities = {
      truecolor,
      color256,
      kittyKeyboard: false,
      mouseTracking: true,
      mouseHover: false,
      hyperlinks,
      graphicsProtocol,
      terminalProgram: termProgram || undefined,
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
      this.probeBuffer = "";

      // Emit probe escape sequences to stdout:
      // 1. DA2: \x1b[>c
      // 2. Kitty keyboard query: \x1b[?u
      // 3. Kitty graphics query: \x1b_Gi=31,a=q;\x1b\\
      // 4. DECRQM Mouse Hover query: \x1b[?1003$p
      this.write("\x1b[>c\x1b[?u\x1b_Gi=31,a=q;\x1b\\\x1b[?1003$p");

      this.probeTimeout = setTimeout(() => {
        this.finishProbing();
      }, 100);
    } else {
      // Non-TTY environment: bypass probing, sync capabilities, and enable fallback mouse mode
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

  private handleInputInternal = (chunk: string | Buffer): void => {
    const data = chunk.toString();
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
}
