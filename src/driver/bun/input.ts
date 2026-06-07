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

        onMouse({ x, y, type, button });
        i += mouseMatch[0].length;
        continue;
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

    // Backspace
    if (code === 127 || code === 8) {
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
      onKey({
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
