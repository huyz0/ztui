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

  test("horizontal wheel-tilt (btnCode & 3 === 2 or 3) is dropped, not misreported as a vertical scroll", () => {
    // Regression: isWheel only checked bit 0x40 and picked direction as
    // `(btnCode & 3) === 0 ? scroll_up : scroll_down`, so codes 66/67 (xterm's
    // horizontal tilt-left/tilt-right, which have btnCode & 3 === 2/3) fell
    // into the scroll_down branch -- a horizontal trackpad swipe double-
    // scrolled vertical widgets that react to every scroll_down.
    const mice: MouseEvent[] = [];
    parseInput(
      "\x1b[<66;10;5M\x1b[<67;10;5M",
      () => {},
      (m) => mice.push(m),
    );
    expect(mice).toHaveLength(0);
  });

  test("button press / release / drag", () => {
    const press = firstMouse("\x1b[<0;10;5M");
    expect(press?.type).toBe("press");
    expect(press?.button).toBe("left");

    const release = firstMouse("\x1b[<0;10;5m");
    expect(release?.type).toBe("release");
    expect(release?.button).toBe("left");

    // A drag is only a drag while a button is actually held, so it must follow a
    // press in the same stream (state persists across input chunks in the driver).
    const mice: MouseEvent[] = [];
    parseInput(
      "\x1b[<0;10;5M\x1b[<32;12;5M",
      () => {},
      (m) => mice.push(m),
    );
    expect(mice[0]?.type).toBe("press");
    expect(mice[1]?.type).toBe("drag");
    expect(mice[1]?.button).toBe("left");

    const rightPress = firstMouse("\x1b[<2;10;5M");
    expect(rightPress?.button).toBe("right");
  });

  test("motion with no button held decodes as move", () => {
    const move = firstMouse("\x1b[<35;10;5M");
    expect(move?.type).toBe("move");
    expect(move?.button).toBe("none");
  });

  test("Ghostty hover quirk: a 'drag' with no button held is corrected to a move", () => {
    // Ghostty encodes buttonless hover motion as b=34 (motion + button bits 2,
    // i.e. a right-button drag) rather than the spec's b=35 (no button). With no
    // real press preceding it, this must be treated as a hover move — otherwise it
    // scrubs sliders / extends selections on plain hover.
    const hover = firstMouse("\x1b[<34;10;5M");
    expect(hover?.type).toBe("move");
    expect(hover?.button).toBe("none");

    // But a genuine right-drag (real right press first) stays a drag.
    const mice: MouseEvent[] = [];
    parseInput(
      "\x1b[<2;10;5M\x1b[<34;12;5M",
      () => {},
      (m) => mice.push(m),
    );
    expect(mice[0]?.type).toBe("press");
    expect(mice[1]?.type).toBe("drag");
    expect(mice[1]?.button).toBe("right");
  });

  test("a held button older than the staleness window is treated as released, not a permanent phantom drag", () => {
    // Regression: buttonDown was only ever cleared by an explicit release
    // event. If that release was lost (the terminal window loses focus
    // mid-drag, or the byte is dropped), buttonDown stayed stuck true
    // forever -- every later Ghostty-quirk hover move (b=34) was then
    // misclassified as a real drag instead of being downgraded to a move.
    const state = { buttonDown: true, pressedAt: Date.now() - 31_000 }; // past the 30s staleness window
    const mice: MouseEvent[] = [];
    parseInput(
      "\x1b[<34;10;5M",
      () => {},
      (m) => mice.push(m),
      state,
    );
    expect(mice[0]?.type).toBe("move");
    expect(mice[0]?.button).toBe("none");
    expect(state.buttonDown).toBe(false);
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

  test("Alt+letter (ESC followed by a plain char) decodes as one meta+ combo, not a stray ESC", () => {
    // Regression: none of the escape-sequence patterns matched ESC+letter, so
    // execution fell through to the plain-character path with `char` still
    // the ESC byte — emitting a bogus raw-ESC key event and leaving the
    // following letter to be parsed as a separate, unrelated keypress.
    const keys: KeyEvent[] = [];
    parseInput(
      "\x1bf",
      (k) => keys.push(k),
      () => {},
    );
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ key: "meta+f", name: "f", meta: true, ctrl: false });
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

describe("parseInput — Kitty meta/ctrl+shift combos", () => {
  test("Cmd/Alt+Z (meta) embeds a meta+ prefix", () => {
    // keycode 122 = 'z', modifiers = modVal(2, meta) + 1 = 3
    const ev = firstKey("\x1b[122;3u");
    expect(ev?.key).toBe("meta+z");
    expect(ev?.meta).toBe(true);
    expect(ev?.ctrl).toBe(false);
  });

  test("Ctrl+Shift+Z embeds both modifiers in order", () => {
    // modVal(1 shift + 4 ctrl) + 1 = 6
    const ev = firstKey("\x1b[122;6u");
    expect(ev?.key).toBe("ctrl+shift+z");
    expect(ev?.ctrl).toBe(true);
    expect(ev?.shift).toBe(true);
  });

  test("Meta+Shift+Z embeds both modifiers in order", () => {
    // modVal(1 shift + 2 meta) + 1 = 4
    const ev = firstKey("\x1b[122;4u");
    expect(ev?.key).toBe("meta+shift+z");
    expect(ev?.meta).toBe(true);
    expect(ev?.shift).toBe(true);
  });

  test("Meta+Space embeds a meta+ prefix on the named space key", () => {
    // modVal(2 meta) + 1 = 3
    const ev = firstKey("\x1b[32;3u");
    expect(ev?.key).toBe("meta+space");
    expect(ev?.name).toBe("space");
    expect(ev?.meta).toBe(true);
  });

  test("plain Shift+Z stays uppercase with no prefix (unchanged behavior)", () => {
    // modVal(1 shift) + 1 = 2
    const ev = firstKey("\x1b[122;2u");
    expect(ev?.key).toBe("Z");
    expect(ev?.shift).toBe(true);
    expect(ev?.ctrl).toBe(false);
    expect(ev?.meta).toBe(false);
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
