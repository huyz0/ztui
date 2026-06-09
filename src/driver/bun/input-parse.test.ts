import { describe, expect, test } from "vitest";
import type { MouseEvent } from "../driver.ts";
import { parseInput } from "./input.ts";

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
