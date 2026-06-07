import { Size } from "../geometry/size.ts";
import { Driver, KeyEvent, type MouseEvent } from "./driver.ts";

export class BunDriver extends Driver {
  private isRunning = false;
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

  public getSize(): Size {
    return new Size(process.stdout.columns || 80, process.stdout.rows || 24);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Enable alternative buffer, clear screen, hide cursor
    this.write("\x1b[?1049h\x1b[?25l");
    // Enable mouse tracking: click press, drag, movement, and scroll, using SGR (1006) protocol
    this.write("\x1b[?1000h\x1b[?1003h\x1b[?1006h");

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", this.handleInput);
    process.stdout.on("resize", this.resizeListener);

    process.on("exit", this.cleanupHandler);
    process.on("SIGINT", this.sigintHandler);
    process.on("SIGTERM", this.sigtermHandler);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    // Disable mouse tracking
    this.write("\x1b[?1000l\x1b[?1003l\x1b[?1006l");
    // Restore main buffer, show cursor
    this.write("\x1b[?1049l\x1b[?25h");

    process.stdin.off("data", this.handleInput);
    process.stdout.off("resize", this.resizeListener);

    process.off("exit", this.cleanupHandler);
    process.off("SIGINT", this.sigintHandler);
    process.off("SIGTERM", this.sigtermHandler);

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }

  public write(data: string): void {
    process.stdout.write(data);
  }

  private handleInput = (chunk: string | Buffer): void => {
    const data = chunk.toString();

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
            const isDrag = (btnCode & 32) !== 0;
            const isMove = (btnCode & 64) !== 0 || btnCode === 35; // 35 is movement without press

            if (baseBtn === 0) button = "left";
            else if (baseBtn === 1) button = "middle";
            else if (baseBtn === 2) button = "right";

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
  };
}
