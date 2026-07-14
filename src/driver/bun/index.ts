import { Size } from "../../geometry/size.ts";
import { encodeSimpleGlyf } from "../../render/glyf-encode.ts";
import { iconRegistry } from "../../render/icon-registry.ts";
import { logger } from "../../utils/logger.ts";
import { type Clipboard, Driver, type KeyEvent, type TerminalCapabilities } from "../driver.ts";
import { getBaselineCapabilities, parseProbeResponse, sixelUsable } from "./capabilities.ts";
import { TerminalGraphicsManager } from "./graphics.ts";
import { type InputDiagnostics, type MouseParseState, parseInput } from "./input.ts";

export class BunDriver extends Driver {
  public override get enforcesRuntimeHoverMode(): boolean {
    return true;
  }
  private graphicsManager = new TerminalGraphicsManager();
  public override readonly capabilities!: TerminalCapabilities;
  /**
   * Mirror of the last value we wrote to the clipboard. Most terminals support
   * OSC 52 *write* but refuse OSC 52 *read* queries (disabled by default for
   * security), so a `get()` query frequently times out. Falling back to this
   * local copy keeps in-app copy→paste (and the demo's "read clipboard") working
   * even when the terminal won't answer a read.
   */
  private lastClipboard = "";
  /**
   * The in-flight `get()` query, if any. Callers that call `get()` again while
   * one is already outstanding (e.g. rapid key-repeat-triggered paste checks)
   * share this promise instead of each queuing their own resolver and OSC 52
   * write/500ms timer — the terminal gets one query per round-trip, not N.
   */
  private pendingClipboardGet: Promise<string> | null = null;
  public override readonly clipboard: Clipboard = {
    get: (): Promise<string> => {
      if (this.pendingClipboardGet) return this.pendingClipboardGet;
      const promise = new Promise<string>((resolve) => {
        // Wrap the resolver so a blocked terminal — which commonly answers an
        // OSC 52 read with an *empty* payload rather than staying silent — falls
        // back to our local mirror instead of returning "". A genuine non-empty
        // external clipboard is still honoured.
        const resolver = (osc: string) => resolve(osc || this.lastClipboard);
        this.pendingClipboardResolvers.push(resolver);
        this.write("\x1b]52;c;?\x07");
        setTimeout(() => {
          const idx = this.pendingClipboardResolvers.indexOf(resolver);
          if (idx !== -1) {
            this.pendingClipboardResolvers.splice(idx, 1);
            // Terminal never answered — use our local mirror.
            resolve(this.lastClipboard);
          }
        }, 500);
      });
      this.pendingClipboardGet = promise;
      promise.finally(() => {
        if (this.pendingClipboardGet === promise) this.pendingClipboardGet = null;
      });
      return promise;
    },
    set: (text: string): void => {
      this.lastClipboard = text;
      this.write(`\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`);
    },
  };

  private isRunning = false;
  private stdin: any;
  private stdout: any;
  private isProbing = false;
  private probeBuffer = "";
  private probeTimeout: any = null;
  /** Persisted across input chunks so motion can be classified against held buttons. */
  private mouseParseState: MouseParseState = { buttonDown: false };
  private inputDiagnostics: InputDiagnostics = {
    chunks: 0,
    keyEvents: 0,
    mouseEvents: 0,
    moveEventsBuffered: 0,
    moveEventsFlushed: 0,
    moveEventsDroppedInChunk: 0,
  };
  private pendingClipboardResolvers: ((text: string) => void)[] = [];
  /** Accumulates a bracketed-paste payload that spans multiple stdin chunks. */
  private pasteBuffer: string | null = null;
  private hoverEnabled = false;

  private resizeListener = () => {
    this.emit("resize", this.getSize());
  };

  private cleanupHandler = () => {
    this.stop();
  };

  // By default a received SIGINT/SIGTERM restores the terminal and exits
  // immediately — the safe default, so a Ctrl+C from outside raw mode (e.g. a
  // job-control signal, not the `\x03` keystroke apps normally intercept) can
  // never leave the terminal wedged in raw mode / alt-screen. Apps that want to
  // own shutdown (confirm-on-quit, flush state) set `exitOnSignal: false` and
  // listen for the `signal` event; they are then responsible for calling
  // `stop()` and exiting themselves.
  private exitOnSignal = true;

  private handleSignal(signal: "SIGINT" | "SIGTERM", code: number): void {
    if (!this.exitOnSignal) {
      this.emit("signal", signal);
      return;
    }
    this.stop();
    process.exit(code);
  }

  private sigintHandler = () => this.handleSignal("SIGINT", 130);
  private sigtermHandler = () => this.handleSignal("SIGTERM", 143);

  constructor(options?: { stdin?: any; stdout?: any; exitOnSignal?: boolean }) {
    super();
    this.stdin = options?.stdin || process.stdin;
    this.stdout = options?.stdout || process.stdout;
    this.exitOnSignal = options?.exitOnSignal ?? true;
    this.capabilities = getBaselineCapabilities();
  }

  public getSize(): Size {
    return new Size(this.stdout.columns || 80, this.stdout.rows || 24);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Enable alternative buffer, clear screen, hide cursor, and bracketed paste
    // (so native terminal paste arrives wrapped in \x1b[200~ … \x1b[201~).
    this.write("\x1b[?1049h\x1b[?25l\x1b[?2004h");

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
        "\x1b[c\x1b[>c\x1b[?u\x1b_Gi=31,a=q;\x1b\\\x1b[?1003$p\x1b[?2026$p\x1b_25a1;s\x1b\\\x1b]22;?default\x1b\\\x1b[14t\x1b[16t",
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

    // Restore the default mouse pointer shape so a custom shape doesn't leak
    // back to the shell after exit.
    this.setPointerShape(null);

    // Disable mouse tracking (hover 1003 and standard 1000/1002/1006) and
    // bracketed paste.
    this.write("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?2004l");

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

  public getInputDiagnostics(): InputDiagnostics {
    return { ...this.inputDiagnostics };
  }

  public override setMouseHover(enabled: boolean): void {
    if (this.hoverEnabled === enabled) return;
    this.hoverEnabled = enabled;
    if (!this.isRunning) return;
    if (enabled) {
      this.write("\x1b[?1000h\x1b[?1003h\x1b[?1006h");
      this.capabilities.mouseHover = true;
    } else {
      this.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");
      this.capabilities.mouseHover = false;
    }
  }

  /**
   * Remove bracketed-paste payloads from `data`, emitting each as a "paste"
   * event, and return the remaining (non-paste) bytes. A paste may span several
   * stdin chunks, so an unterminated payload is buffered in {@link pasteBuffer}
   * and completed on a later call.
   */
  private extractBracketedPaste(data: string): string {
    const START = "\x1b[200~";
    const END = "\x1b[201~";

    // Finish a paste that began in an earlier chunk.
    if (this.pasteBuffer !== null) {
      const endIdx = data.indexOf(END);
      if (endIdx === -1) {
        this.pasteBuffer += data;
        return "";
      }
      this.emit("paste", this.pasteBuffer + data.slice(0, endIdx));
      this.pasteBuffer = null;
      data = data.slice(endIdx + END.length);
    }

    // Handle paste sequences starting within this chunk.
    let startIdx = data.indexOf(START);
    while (startIdx !== -1) {
      const before = data.slice(0, startIdx);
      const rest = data.slice(startIdx + START.length);
      const endIdx = rest.indexOf(END);
      if (endIdx === -1) {
        // Body continues into a later chunk; keep the text before the marker.
        this.pasteBuffer = rest;
        return before;
      }
      this.emit("paste", rest.slice(0, endIdx));
      data = before + rest.slice(endIdx + END.length);
      startIdx = data.indexOf(START);
    }
    return data;
  }

  private handleInputInternal = (chunk: string | Buffer): void => {
    let data = chunk.toString();

    // Intercept OSC 52 clipboard responses. Gate the regex on a cheap substring
    // check — clipboard replies are rare, but this runs on every input chunk
    // (including every high-frequency mouse-move burst on hover-capable
    // terminals like Ghostty), so the scan must be skipped for ordinary input.
    const clipboardMatch = data.includes("\x1b]52")
      ? data.match(/\x1b\]52;[cp]?;([A-Za-z0-9+/=]*)(?:\x07|\x1b\\)/)
      : null;
    if (clipboardMatch) {
      const base64 = clipboardMatch[1];
      const text = Buffer.from(base64, "base64").toString("utf8");
      const resolve = this.pendingClipboardResolvers.shift();
      if (resolve) {
        resolve(text);
      }
      data = data.replace(clipboardMatch[0], "");
    }

    // Strip bracketed-paste payloads (emitting them as "paste" events) before
    // anything else sees the bytes, so pasted text never hits the key parser.
    data = this.extractBracketedPaste(data);

    if (data.length === 0) return;

    // Intercept late-arriving capability responses when not probing. These are
    // one-time replies to our startup probes (DA1/DA2, kitty keyboard/graphics,
    // hover, sync, glyph, pixel/cell size) — they never recur in ordinary input.
    // The block below runs ~9 whole-string regex scans + replaces, so gate it on
    // a cheap substring pre-check: every capability reply begins with one of
    // these CSI/APC prefixes, none of which appear in mouse motion (`\x1b[<…`) or
    // key input. This keeps a Ghostty pixel-rate move stream from paying for ten
    // regex passes per event.
    const mayBeCapabilityReply =
      data.includes("\x1b[?") ||
      data.includes("\x1b[>") ||
      data.includes("\x1b_") ||
      data.includes("\x1b]22;") ||
      data.includes("\x1b[4;") ||
      data.includes("\x1b[6;");
    if (!this.isProbing && mayBeCapabilityReply) {
      let matchedAny = false;

      // 1. DA1 Match
      while (true) {
        const da1Match = data.match(/\x1b\[\?([\d;]+)c/);
        if (!da1Match) break;
        const params = da1Match[1].split(";");
        if (params.includes("4") && sixelUsable(this.capabilities)) {
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

      // 5b. OSC 22 pointer-shape support (late reply to our `?default` query)
      while (true) {
        const pointerMatch = data.match(/\x1b\]22;([01])(?:\x1b\\|\x07)/);
        if (!pointerMatch) break;
        if (pointerMatch[1] === "1") {
          this.capabilities.pointerShapes = true;
        }
        data = data.replace(pointerMatch[0], "");
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

    this.hoverEnabled = this.capabilities.mouseHover;
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
        if (!icon.glyf) continue; // SVG-only icons can't be registered as glyf
        const codepoint = iconRegistry.getCodepoint(icon.name);
        if (!codepoint) continue;
        const payload = encodeSimpleGlyf(icon.glyf.contours);
        if (!payload) continue;
        const hex = codepoint.toString(16);
        const base64 = payload.toString("base64");
        // Glyph Protocol register: verb `r`, glyf payload, fire-and-forget
        // (reply=0) for bulk startup registration. Icons are double-width.
        this.write(
          `\x1b_25a1;r;cp=${hex};fmt=glyf;reply=0;upm=${icon.glyf.unitsPerEm};width=2;${base64}\x1b\\`,
        );
      }
    }

    this.capabilitiesResolved = true;
    logger.info(
      "graphics",
      `capabilities: protocol=${this.capabilities.graphicsProtocol} ` +
        `cellSize=${this.capabilities.cellSize?.width}x${this.capabilities.cellSize?.height} ` +
        `glyph=${this.capabilities.glyphProtocol} ` +
        `term=${process.env.TERM_PROGRAM ?? process.env.TERM ?? "?"}`,
    );
    this.emit("capabilities_resolved");
  }

  private processInput(data: string): void {
    // Ctrl+C arrives as the raw byte 0x03 (raw mode disables ISIG). Emit it as a
    // normal key first so the focused widget can claim it — e.g. copy an active
    // selection (the only copy path that survives on terminals without the Kitty
    // keyboard protocol, where Ctrl+Shift+C is byte-identical to Ctrl+C). If the
    // event is left unhandled, fall back to the safety exit so "Ctrl+C quits"
    // still holds when no app logic claims it.
    // Split on 0x03 rather than requiring an exact match -- a fast keystroke
    // right before Ctrl+C (or Ctrl+C landing in the same read as trailing
    // paste/mouse bytes) can coalesce it into a larger chunk, which would
    // otherwise skip straight to parseInput's generic control-byte handling
    // and silently drop the safety-exit fallback.
    const ctrlCIdx = data.indexOf("\u0003");
    if (ctrlCIdx !== -1) {
      if (ctrlCIdx > 0) this.processInput(data.slice(0, ctrlCIdx));
      const ev: KeyEvent = { key: "ctrl+c", name: "c", ctrl: true, meta: false, shift: false };
      this.emit("key", ev);
      if (!ev.handled) {
        this.stop();
        process.exit(0);
      }
      const rest = data.slice(ctrlCIdx + 1);
      if (rest) this.processInput(rest);
      return;
    }

    try {
      parseInput(
        data,
        (ev) => this.emit("key", ev),
        (ev) => this.emit("mouse", ev),
        this.mouseParseState,
        this.inputDiagnostics,
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

  public override getGraphicClearSequence(bgColor?: string): string {
    // Erase a stale icon/graphic at the cursor cell (kitty: delete placement;
    // sixel: paint an opaque bg rectangle, since text doesn't clear images).
    return this.graphicsManager.getIconClearSequence(this.capabilities, bgColor);
  }

  public override getGraphicResetSequence(): string {
    // Wipe every placement (kitty) so orphaned images — scrolled out, or left by
    // a swapped screen — are removed before the frame re-emits current graphics.
    if (this.capabilities.graphicsProtocol === "kitty") {
      return "\x1b_Ga=d\x1b\\\x1b_Ga=d,d=A\x1b\\";
    }
    return "";
  }
}
