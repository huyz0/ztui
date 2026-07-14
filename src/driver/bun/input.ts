import type { KeyEvent, MouseEvent } from "../driver.ts";

/** Cross-chunk pointer state, owned by the driver and threaded through each parse. */
export interface MouseParseState {
  /** Whether a mouse button is currently held (set by press, cleared by release). */
  buttonDown: boolean;
  /**
   * `Date.now()` of the last press. If a release is ever lost (e.g. the
   * terminal window loses focus mid-drag, or the byte is dropped), `buttonDown`
   * would otherwise stay stuck true forever, turning every later Ghostty-quirk
   * hover move into a phantom drag. Past {@link BUTTON_DOWN_STALE_MS} since the
   * last press, the state is treated as stale and reset.
   */
  pressedAt: number;
}

/** See {@link MouseParseState.pressedAt}. */
const BUTTON_DOWN_STALE_MS = 30_000;

export interface InputDiagnostics {
  chunks: number;
  keyEvents: number;
  mouseEvents: number;
  moveEventsBuffered: number;
  moveEventsFlushed: number;
  moveEventsDroppedInChunk: number;
}

export function parseInput(
  data: string,
  onKeyRaw: (ev: KeyEvent) => void,
  onMouseRaw: (ev: MouseEvent) => void,
  mouseState: MouseParseState = { buttonDown: false, pressedAt: 0 },
  diagnostics?: InputDiagnostics,
): void {
  if (diagnostics) diagnostics.chunks += 1;
  // Coalesce pointer motion within a single chunk: hover-capable terminals
  // (Ghostty) stream a move per pixel, and a fast sweep packs many into one read.
  // Only the latest position matters, so buffer moves and emit just the last —
  // collapsing the dominant per-event `emit` + downstream dispatch cost. A
  // non-move event (or end of chunk) flushes the pending move first, preserving
  // order. `move` here means buttonless motion; a drag carries a button and is
  // emitted immediately so selection stays smooth.
  let pendingMove: MouseEvent | null = null;
  const flushMove = () => {
    if (pendingMove) {
      if (diagnostics) diagnostics.moveEventsFlushed += 1;
      if (diagnostics) diagnostics.mouseEvents += 1;
      onMouseRaw(pendingMove);
      pendingMove = null;
    }
  };
  const onKey = (ev: KeyEvent) => {
    flushMove();
    if (diagnostics) diagnostics.keyEvents += 1;
    onKeyRaw(ev);
  };
  const onMouse = (ev: MouseEvent) => {
    if (ev.type === "move" && ev.button === "none") {
      if (pendingMove && diagnostics) diagnostics.moveEventsDroppedInChunk += 1;
      if (diagnostics) diagnostics.moveEventsBuffered += 1;
      pendingMove = ev;
      return;
    }
    flushMove();
    if (diagnostics) diagnostics.mouseEvents += 1;
    onMouseRaw(ev);
  };

  let i = 0;
  while (i < data.length) {
    if (data.charCodeAt(i) === 27) {
      // Escape
      const remaining = data.slice(i);

      // Kitty Keyboard sequence check
      const kittyMatch = remaining.match(/^\x1b\[(\d+)(?:;(\d+))?(?::(\d+))?u/);
      if (kittyMatch) {
        const keycode = Number.parseInt(kittyMatch[1], 10);
        const modifiers = kittyMatch[2] ? Number.parseInt(kittyMatch[2], 10) : 1;
        const eventType = kittyMatch[3] ? Number.parseInt(kittyMatch[3], 10) : 1;

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

          // Space is only named "space" when modified (Ctrl+Space etc.); a plain
          // space stays the literal character so text input keeps working.
          if (keycode === 32 && (ctrl || meta)) {
            keyName = "space";
          } else if (keyMap[keycode] !== undefined) {
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

          // Single-char and space keys get a full modifier prefix (ctrl+/meta+/
          // shift+, in that order) so Cmd+Z (meta+z), Ctrl+Shift+Z, etc. are
          // distinguishable — not just ctrl, which was the only modifier ever
          // embedded here before. Named multi-char keys (arrows, enter, ...) keep
          // the existing ctrl-only prefix to avoid changing established bindings
          // like "ctrl+j" for Ctrl+Enter.
          const canHaveFullPrefix = keyName.length === 1 || keyName === "space";
          if (canHaveFullPrefix && (ctrl || meta)) {
            let prefix = "";
            if (ctrl) prefix += "ctrl+";
            if (meta) prefix += "meta+";
            if (shift) prefix += "shift+";
            keyStr = `${prefix}${keyName.length === 1 ? keyName.toLowerCase() : keyName}`;
          } else if (ctrl && !keyStr.startsWith("ctrl+")) {
            keyStr = `ctrl+${keyStr}`;
          }

          onKey({
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
        const btnCode = Number.parseInt(mouseMatch[1], 10);
        const x = Number.parseInt(mouseMatch[2], 10) - 1; // 1-based coordinates
        const y = Number.parseInt(mouseMatch[3], 10) - 1;
        const isRelease = mouseMatch[4] === "m";

        let type: MouseEvent["type"] = "press";
        let button: MouseEvent["button"] = "none";

        // Bit 6 (0x40) marks wheel events; low 2 bits give the direction. This
        // also covers modified wheels (e.g. Ctrl+scroll = 64|16 = 80/81).
        const isWheel = (btnCode & 0x40) !== 0;
        if (isWheel) {
          type = (btnCode & 3) === 0 ? "scroll_up" : "scroll_down";
        } else {
          const baseBtn = btnCode & 3;
          // Bit 5 (0x20) marks motion; button bits === 3 means no button held.
          const isMotion = (btnCode & 0x20) !== 0;
          const noButton = baseBtn === 3;
          const isMove = isMotion && noButton;
          const isDrag = isMotion && !noButton;

          if (!noButton) {
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

          // Track real button state and correct a terminal quirk: Ghostty
          // reports buttonless hover motion with button bits = 2 (looks like a
          // right-button drag, b=34) instead of the spec's 3 (no button, b=35
          // as Windows Terminal sends). A "drag" with no button actually held is
          // really hover — downgrade it to a buttonless move so it can't scrub
          // sliders/selection and is coalesced like other hover motion.
          if (type === "press") {
            mouseState.buttonDown = true;
            mouseState.pressedAt = Date.now();
          } else if (type === "release") {
            mouseState.buttonDown = false;
          } else if (type === "drag") {
            // A held button older than the staleness window almost certainly
            // means its release was lost (e.g. focus left the terminal
            // mid-drag) rather than a real multi-minute drag — treat it as
            // released so the quirk-downgrade below can kick back in.
            if (mouseState.buttonDown && Date.now() - mouseState.pressedAt > BUTTON_DOWN_STALE_MS) {
              mouseState.buttonDown = false;
            }
            if (!mouseState.buttonDown) {
              type = "move";
              button = "none";
            }
          }
        }

        onMouse({ x, y, type, button });
        i += mouseMatch[0].length;
        continue;
      }

      // Modified arrows / navigation: \x1b[1;<mod>[A-D|H|F] and the VT-220
      // \x1b[<n>;<mod>~ form. The modifier follows the xterm scheme
      // (mod-1 bitmask: shift=1, alt=2, ctrl=4). This is how Shift+Arrow and
      // Ctrl+Arrow arrive on terminals WITHOUT the Kitty keyboard protocol;
      // without this they would be swallowed by the generic escape matcher.
      const modSeq = remaining.match(/^\x1b\[(\d+);(\d+)([A-DHF~])/);
      if (modSeq) {
        const p1 = Number.parseInt(modSeq[1], 10);
        const modVal = Number.parseInt(modSeq[2], 10) - 1;
        const shift = (modVal & 1) !== 0;
        const alt = (modVal & 2) !== 0;
        const ctrl = (modVal & 4) !== 0;
        const final = modSeq[3];
        let modName = "";
        if (final === "~") {
          const tildeMap: Record<number, string> = {
            1: "home",
            7: "home",
            4: "end",
            8: "end",
            5: "pageup",
            6: "pagedown",
            3: "delete",
            2: "insert",
          };
          modName = tildeMap[p1] ?? "";
        } else {
          const arrowMap: Record<string, string> = {
            A: "up",
            B: "down",
            C: "right",
            D: "left",
            H: "home",
            F: "end",
          };
          modName = arrowMap[final] ?? "";
        }
        if (modName) {
          onKey({ key: modName, name: modName, ctrl, meta: alt, shift });
          i += modSeq[0].length;
          continue;
        }
      }

      // Arrow keys: \x1b[A (Up), \x1b[B (Down), \x1b[C (Right), \x1b[D (Left)
      const seqMatch = remaining.match(/^\x1b\[([A-D])/);
      if (seqMatch) {
        const dir = seqMatch[1];
        const nameMap: Record<string, string> = { A: "up", B: "down", C: "right", D: "left" };
        onKey({
          key: nameMap[dir],
          name: nameMap[dir],
          ctrl: false,
          meta: false,
          shift: false,
        });
        i += seqMatch[0].length;
        continue;
      }

      // Navigation keys. Both the xterm (\x1b[H / \x1b[F) and VT-220
      // (\x1b[<n>~) encodings are recognized so PageUp/PageDown/Home/End/Delete
      // work across terminals.
      const navTilde = remaining.match(/^\x1b\[(\d+)~/);
      if (navTilde) {
        const tildeMap: Record<string, string> = {
          "1": "home",
          "7": "home",
          "4": "end",
          "8": "end",
          "5": "pageup",
          "6": "pagedown",
          "3": "delete",
          "2": "insert",
        };
        const name = tildeMap[navTilde[1]];
        if (name) {
          onKey({ key: name, name, ctrl: false, meta: false, shift: false });
          i += navTilde[0].length;
          continue;
        }
      }
      const navXterm = remaining.match(/^\x1b\[([HF])/);
      if (navXterm) {
        const name = navXterm[1] === "H" ? "home" : "end";
        onKey({ key: name, name, ctrl: false, meta: false, shift: false });
        i += navXterm[0].length;
        continue;
      }

      // Shift-Tab: \x1b[Z
      if (remaining.startsWith("\x1b[Z")) {
        onKey({
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
        onKey({
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
        onKey({
          key: "escape",
          name: "escape",
          ctrl: false,
          meta: false,
          shift: false,
        });
        i++;
        continue;
      }

      // Alt+<printable>: ESC immediately followed by an ordinary character
      // (not another escape, and not a bracket sequence — those are all
      // handled above). This is how most terminals send Alt/Option combos
      // without the Kitty keyboard protocol. Without this branch, none of the
      // patterns above match, so execution fell through to the plain-character
      // path with `char` still the ESC byte itself — emitting a bogus raw-ESC
      // key event and leaving the following character to be parsed as an
      // unrelated, separate keypress next iteration.
      const next = remaining[1];
      if (next !== "\x1b" && next.charCodeAt(0) >= 32 && next.charCodeAt(0) <= 126) {
        const shift = next !== next.toLowerCase() && next === next.toUpperCase();
        onKey({
          key: `meta+${next.toLowerCase()}`,
          name: next.toLowerCase(),
          ctrl: false,
          meta: true,
          shift,
        });
        i += 2;
        continue;
      }
    }

    const char = data[i];
    const code = char.charCodeAt(0);

    // Ctrl+Space arrives as NUL on terminals without the Kitty protocol.
    if (code === 0) {
      onKey({ key: "ctrl+space", name: "space", ctrl: true, meta: false, shift: false });
    }
    // Backspace
    else if (code === 127 || code === 8) {
      onKey({
        key: "backspace",
        name: "backspace",
        ctrl: false,
        meta: false,
        shift: false,
      });
    }
    // Enter (CR). The real Enter key sends carriage return (13) in raw mode.
    else if (code === 13) {
      onKey({ key: "enter", name: "enter", ctrl: false, meta: false, shift: false });
    }
    // Ctrl+J sends a line feed (10) — a *distinct* byte from Enter's CR. Tag it
    // as Ctrl+modified enter (keeping name "enter" so multiline editors still
    // treat it as a newline) so a composer can map it to "insert newline"
    // without colliding with "send on Enter". This is the one newline chord that
    // works on every terminal, with or without the Kitty keyboard protocol.
    else if (code === 10) {
      onKey({ key: "ctrl+j", name: "enter", ctrl: true, meta: false, shift: false });
    }
    // Tab
    else if (code === 9) {
      onKey({ key: "tab", name: "tab", ctrl: false, meta: false, shift: false });
    }
    // Ctrl+A to Ctrl+Z (code 1-26, omitting standard control keys like Tab/Enter/Backspace)
    else if (code >= 1 && code <= 26 && code !== 9 && code !== 10 && code !== 13) {
      const keyChar = String.fromCharCode(code + 96);
      onKey({
        key: `ctrl+${keyChar}`,
        name: keyChar,
        ctrl: true,
        meta: false,
        shift: false,
      });
    }
    // Standard character input
    else {
      // Astral characters (emoji, CJK extensions, …) arrive as a UTF-16
      // surrogate pair. Emit them as a single key event rather than two broken
      // halves by consuming the trailing low surrogate.
      let glyph = char;
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < data.length) {
        const next = data.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          glyph = char + data[i + 1];
          i++;
        }
      }
      onKey({
        key: glyph,
        name: glyph,
        ctrl: false,
        meta: false,
        shift: glyph === glyph.toUpperCase() && glyph !== glyph.toLowerCase(),
      });
    }

    i++;
  }
  // Emit any trailing coalesced move at the end of the chunk.
  flushMove();
}
