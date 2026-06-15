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

describe("Ctrl+Space", () => {
  test("legacy NUL byte decodes as ctrl+space", () => {
    const ev = firstKey("\x00");
    expect(ev?.key).toBe("ctrl+space");
    expect(ev?.name).toBe("space");
    expect(ev?.ctrl).toBe(true);
  });

  test("Kitty CSI u space with ctrl decodes as ctrl+space", () => {
    const ev = firstKey("\x1b[32;5u");
    expect(ev?.name).toBe("space");
    expect(ev?.ctrl).toBe(true);
  });

  test("a plain space stays a literal character", () => {
    const ev = firstKey(" ");
    expect(ev?.key).toBe(" ");
    expect(ev?.ctrl).toBe(false);
  });
});

describe("parseInput — Enter vs. Ctrl+J (CR vs. LF)", () => {
  test("CR (\\r) is a plain Enter that sends", () => {
    const ev = firstKey("\r");
    expect(ev?.name).toBe("enter");
    expect(ev?.ctrl).toBe(false);
  });

  test("LF (\\n, Ctrl+J) is a distinct ctrl-tagged newline, not a plain Enter", () => {
    const ev = firstKey("\n");
    // name stays "enter" so multiline editors treat it as a newline, but it is
    // ctrl-tagged + keyed "ctrl+j" so a composer can map it to insert-newline
    // without it colliding with send-on-Enter.
    expect(ev?.name).toBe("enter");
    expect(ev?.key).toBe("ctrl+j");
    expect(ev?.ctrl).toBe(true);
  });
});

describe("parseInput — move coalescing", () => {
  function collect(seq: string): { keys: KeyEvent[]; mice: MouseEvent[] } {
    const keys: KeyEvent[] = [];
    const mice: MouseEvent[] = [];
    parseInput(
      seq,
      (k) => keys.push(k),
      (m) => mice.push(m),
    );
    return { keys, mice };
  }

  test("a run of moves in one chunk emits only the last position", () => {
    const moves = "\x1b[<35;1;1M\x1b[<35;5;5M\x1b[<35;9;9M"; // three buttonless moves
    const { mice } = collect(moves);
    expect(mice.length).toBe(1);
    expect(mice[0]).toMatchObject({ type: "move", x: 8, y: 8 }); // 0-based
  });

  test("a non-move event flushes the pending move first, preserving order", () => {
    // move, move, press → emits the 2nd move (latest), then the press.
    const seq = "\x1b[<35;2;2M\x1b[<35;4;4M\x1b[<0;4;4M";
    const { mice } = collect(seq);
    expect(mice.length).toBe(2);
    expect(mice[0]).toMatchObject({ type: "move", x: 3, y: 3 }); // latest, 0-based
    expect(mice[1].type).not.toBe("move"); // the press
  });

  test("a key between moves flushes the move", () => {
    const seq = "\x1b[<35;2;2Ma\x1b[<35;6;6M";
    const { keys, mice } = collect(seq);
    expect(keys.map((k) => k.key)).toEqual(["a"]);
    expect(mice.length).toBe(2);
    expect(mice[0]).toMatchObject({ x: 1, y: 1 }); // 0-based
    expect(mice[1]).toMatchObject({ x: 5, y: 5 });
  });
});
