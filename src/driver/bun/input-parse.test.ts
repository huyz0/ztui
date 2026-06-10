import { describe, expect, test } from "vitest";
import type { KeyEvent, MouseEvent } from "../driver.ts";
import { parseInput } from "./input.ts";

function firstKey(seq: string): KeyEvent | undefined {
  let ev: KeyEvent | undefined;
  parseInput(
    seq,
    (k) => {
      ev ??= k;
    },
    () => {},
  );
  return ev;
}

function firstMouse(seq: string): MouseEvent | undefined {
  let ev: MouseEvent | undefined;
  parseInput(
    seq,
    () => {},
    (m) => {
      ev ??= m;
    },
  );
  return ev;
}

describe("parseInput — SGR mouse decoding", () => {
  test("plain scroll wheel up/down", () => {
    expect(firstMouse("\x1b[<64;10;5M")?.type).toBe("scroll_up");
    expect(firstMouse("\x1b[<65;10;5M")?.type).toBe("scroll_down");
  });

  test("modified scroll wheel (Ctrl+scroll = base + 16) still decodes as scroll", () => {
    // Regression: 80/81 previously fell through to the button branch and were
    // misdecoded as a left-button "move".
    expect(firstMouse("\x1b[<80;10;5M")?.type).toBe("scroll_up");
    expect(firstMouse("\x1b[<81;10;5M")?.type).toBe("scroll_down");
    // Shift+scroll (base + 4) too.
    expect(firstMouse("\x1b[<68;10;5M")?.type).toBe("scroll_up");
    expect(firstMouse("\x1b[<69;10;5M")?.type).toBe("scroll_down");
  });

  test("button press / release / drag", () => {
    const press = firstMouse("\x1b[<0;10;5M");
    expect(press?.type).toBe("press");
    expect(press?.button).toBe("left");

    const release = firstMouse("\x1b[<0;10;5m");
    expect(release?.type).toBe("release");
    expect(release?.button).toBe("left");

    const drag = firstMouse("\x1b[<32;10;5M");
    expect(drag?.type).toBe("drag");
    expect(drag?.button).toBe("left");

    const rightPress = firstMouse("\x1b[<2;10;5M");
    expect(rightPress?.button).toBe("right");
  });

  test("motion with no button held decodes as move", () => {
    const move = firstMouse("\x1b[<35;10;5M");
    expect(move?.type).toBe("move");
    expect(move?.button).toBe("none");
  });

  test("decodes 1-based coordinates to 0-based", () => {
    const ev = firstMouse("\x1b[<0;10;5M");
    expect(ev?.x).toBe(9);
    expect(ev?.y).toBe(4);
  });
});

describe("parseInput — character input", () => {
  test("astral characters (emoji) decode as one key, not split surrogates", () => {
    const keys: KeyEvent[] = [];
    parseInput(
      "😀",
      (k) => keys.push(k),
      () => {},
    );
    expect(keys).toHaveLength(1);
    expect(keys[0].key).toBe("😀");
  });

  test("surrogate-pair glyph followed by ascii decodes both", () => {
    const keys: KeyEvent[] = [];
    parseInput(
      "🎉a",
      (k) => keys.push(k),
      () => {},
    );
    expect(keys.map((k) => k.key)).toEqual(["🎉", "a"]);
  });
});

describe("parseInput — navigation keys", () => {
  test("arrows still decode", () => {
    expect(firstKey("\x1b[A")?.name).toBe("up");
    expect(firstKey("\x1b[B")?.name).toBe("down");
    expect(firstKey("\x1b[C")?.name).toBe("right");
    expect(firstKey("\x1b[D")?.name).toBe("left");
  });

  test("PageUp/PageDown (VT-220 tilde) decode to named keys", () => {
    expect(firstKey("\x1b[5~")?.name).toBe("pageup");
    expect(firstKey("\x1b[6~")?.name).toBe("pagedown");
  });

  test("Home/End decode from both xterm and VT-220 encodings", () => {
    expect(firstKey("\x1b[H")?.name).toBe("home");
    expect(firstKey("\x1b[F")?.name).toBe("end");
    expect(firstKey("\x1b[1~")?.name).toBe("home");
    expect(firstKey("\x1b[7~")?.name).toBe("home");
    expect(firstKey("\x1b[4~")?.name).toBe("end");
    expect(firstKey("\x1b[8~")?.name).toBe("end");
  });

  test("Insert/Delete decode", () => {
    expect(firstKey("\x1b[2~")?.name).toBe("insert");
    expect(firstKey("\x1b[3~")?.name).toBe("delete");
  });
});

describe("parseInput — modified arrows / navigation", () => {
  test("Shift+Arrow carries the shift modifier", () => {
    const up = firstKey("\x1b[1;2A");
    expect(up?.name).toBe("up");
    expect(up?.shift).toBe(true);
    expect(up?.ctrl).toBe(false);
    expect(firstKey("\x1b[1;2D")?.name).toBe("left");
    expect(firstKey("\x1b[1;2D")?.shift).toBe(true);
  });

  test("Ctrl+Arrow carries the ctrl modifier", () => {
    const right = firstKey("\x1b[1;5C");
    expect(right?.name).toBe("right");
    expect(right?.ctrl).toBe(true);
    expect(right?.shift).toBe(false);
  });

  test("Ctrl+Shift+Arrow carries both modifiers", () => {
    const down = firstKey("\x1b[1;6B");
    expect(down?.name).toBe("down");
    expect(down?.shift).toBe(true);
    expect(down?.ctrl).toBe(true);
  });

  test("Shift+Home/End (xterm letter form) decode", () => {
    expect(firstKey("\x1b[1;2H")?.name).toBe("home");
    expect(firstKey("\x1b[1;2H")?.shift).toBe(true);
    expect(firstKey("\x1b[1;2F")?.name).toBe("end");
  });

  test("Shift+PageUp / Shift+Delete (VT-220 tilde with modifier) decode", () => {
    const pgup = firstKey("\x1b[5;2~");
    expect(pgup?.name).toBe("pageup");
    expect(pgup?.shift).toBe(true);
    expect(firstKey("\x1b[3;2~")?.name).toBe("delete");
  });
});
