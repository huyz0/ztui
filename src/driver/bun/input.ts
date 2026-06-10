import type { KeyEvent, MouseEvent } from "../driver.ts";

export function parseInput(
  data: string,
  onKey: (ev: KeyEvent) => void,
  onMouse: (ev: MouseEvent) => void,
): void {
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

          if (ctrl && !keyStr.startsWith("ctrl+")) {
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
    // Enter
    else if (code === 13 || code === 10) {
      onKey({ key: "enter", name: "enter", ctrl: false, meta: false, shift: false });
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
}
