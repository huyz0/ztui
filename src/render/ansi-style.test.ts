import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ThemeManager } from "../theme.ts";
import { cursorMove, styleToEscapeCodes, styleTransition } from "./ansi-style.ts";
import { colorMode } from "./color-mode.ts";
import { Style } from "./style.ts";

/**
 * Guards the minimal SGR transition path. Two properties matter:
 * 1. it emits *only* the attributes that differ (the byte win), and
 * 2. applying it on top of `from`'s pen reaches exactly `to`'s pen (correctness).
 */

type Pen = Record<string, string>;

// A self-consistent SGR interpreter (mirrors buffer-ansi-replay's pen model).
function applySgr(body: string, pen: Pen): void {
  const codes = body === "" ? ["0"] : body.split(";");
  for (let i = 0; i < codes.length; i++) {
    const tok = codes[i];
    const head = tok.split(":")[0];
    switch (head) {
      case "0":
        for (const k of Object.keys(pen)) delete pen[k];
        break;
      case "1":
        pen.bold = "1";
        break;
      case "2":
        pen.dim = "1";
        break;
      case "3":
        pen.italic = "1";
        break;
      case "4":
        pen.underline = tok;
        break;
      case "7":
        pen.reverse = "1";
        break;
      case "9":
        pen.strike = "1";
        break;
      case "22":
        delete pen.bold;
        delete pen.dim;
        break;
      case "23":
        delete pen.italic;
        break;
      case "24":
        delete pen.underline;
        break;
      case "27":
        delete pen.reverse;
        break;
      case "29":
        delete pen.strike;
        break;
      case "39":
        delete pen.fg;
        break;
      case "49":
        delete pen.bg;
        break;
      case "59":
        delete pen.ulcolor;
        break;
      case "58":
        pen.ulcolor = tok;
        break;
      case "38":
      case "48": {
        const slot = head === "38" ? "fg" : "bg";
        if (tok.includes(":")) pen[slot] = tok;
        else if (codes[i + 1] === "5") {
          pen[slot] = `${head};5;${codes[i + 2]}`;
          i += 2;
        } else if (codes[i + 1] === "2") {
          pen[slot] = `${head};2;${codes[i + 2]};${codes[i + 3]};${codes[i + 4]}`;
          i += 4;
        }
        break;
      }
      default:
        if (/^(3[0-7]|9[0-7])$/.test(head)) pen.fg = head;
        else if (/^(4[0-7]|10[0-7])$/.test(head)) pen.bg = head;
    }
  }
}

function applyStream(stream: string, pen: Pen): void {
  for (const m of stream.matchAll(/\x1b\[([0-9;:]*)m/g)) applySgr(m[1], pen);
}

function canon(pen: Pen): string {
  return Object.keys(pen)
    .sort()
    .map((k) => `${k}=${pen[k]}`)
    .join(",");
}

/** The pen `to` produces from a clean slate — the correctness target. */
function expectedPen(to: Style): Pen {
  const pen: Pen = {};
  applyStream(styleToEscapeCodes(to).start, pen);
  return pen;
}

describe("unset colour resolves to the active theme (real terminal, not just canvas)", () => {
  // Bun sets NO_COLOR itself whenever stdout isn't a TTY (true under CI/vitest),
  // so the ambient default can't be trusted — force colour on for these assertions.
  beforeEach(() => colorMode.set(true));
  afterEach(() => {
    colorMode.reset();
    ThemeManager.getInstance().setTheme("default-dark");
  });

  test("an unstyled Style renders the active theme's foreground under a light theme", () => {
    // Reproduces the reported bug directly: a plain Label (no explicit
    // `color`) inside an app themed `default-light` used to emit no fg SGR
    // code at all, leaving text at the *terminal's* ambient default — on a
    // developer's typically dark-profile terminal, that's a light color,
    // rendering unreadable light-on-light text against the app's own white
    // background. It must resolve to the theme's foreground instead.
    ThemeManager.getInstance().setTheme("default-light");
    const { start } = styleToEscapeCodes(new Style({}));
    expect(start).toContain("\x1b[38;2;31;35;40m"); // default-light foreground #1f2328
  });

  test('the explicit "default" sentinel (used by e.g. ListView) is treated the same as unset', () => {
    ThemeManager.getInstance().setTheme("default-light");
    const unset = styleToEscapeCodes(new Style({}));
    const explicitDefault = styleToEscapeCodes(new Style({ color: "default" }));
    expect(explicitDefault.start).toBe(unset.start);
  });

  test("switching themes changes what an unstyled Style resolves to", () => {
    ThemeManager.getInstance().setTheme("default-light");
    const light = styleToEscapeCodes(new Style({})).start;
    ThemeManager.getInstance().setTheme("catppuccin-mocha");
    const dark = styleToEscapeCodes(new Style({})).start;
    expect(light).not.toBe(dark);
  });

  test("the SAME Style instance re-resolves after a theme switch (per-Style escape cache is theme-scoped)", () => {
    // Regression: styleToEscapeCodes memoizes per Style instance, invalidated
    // only when colour-mode/depth changes — not when the theme changes. A
    // long-lived widget's cached Style object (e.g. a Label built once and
    // reused across renders) would otherwise keep emitting its *first*
    // theme's resolved color forever, even after `ThemeManager.setTheme()`.
    const style = new Style({}); // same instance reused across the switch
    ThemeManager.getInstance().setTheme("default-light");
    const light = styleToEscapeCodes(style).start;
    ThemeManager.getInstance().setTheme("catppuccin-mocha");
    const dark = styleToEscapeCodes(style).start;
    expect(dark).not.toBe(light);
    expect(dark).toContain("38;2;205;214;244"); // catppuccin-mocha foreground #cdd6f4
  });
});

describe("cursorMove — shortest positioning", () => {
  const W = 80;
  test("no move when already at the target", () => {
    expect(cursorMove(5, 2, 5, 2, W)).toBe("");
  });

  test("same-row forward uses CUF, beating absolute CUP", () => {
    expect(cursorMove(10, 3, 15, 3, W)).toBe("\x1b[5C");
  });

  test("a one-cell step omits the count (CSI default)", () => {
    expect(cursorMove(10, 3, 11, 3, W)).toBe("\x1b[C");
    expect(cursorMove(10, 3, 9, 3, W)).toBe("\x1b[D");
  });

  test("same-column vertical uses CUD/CUU", () => {
    expect(cursorMove(7, 2, 7, 5, W)).toBe("\x1b[3B");
    expect(cursorMove(7, 5, 7, 2, W)).toBe("\x1b[3A");
  });

  test("column 0 of the next row is a bare CR (+ vertical) not a CUP", () => {
    expect(cursorMove(40, 3, 0, 4, W)).toBe("\r\x1b[B");
    expect(cursorMove(40, 3, 0, 3, W)).toBe("\r");
  });

  test("falls back to absolute CUP at the right margin (pending wrap)", () => {
    // Cursor parked at column == width: relative moves are unreliable, use CUP.
    expect(cursorMove(W, 3, 4, 4, W)).toBe("\x1b[5;5H");
  });

  test("never longer than the absolute CUP it replaces", () => {
    for (let i = 0; i < 2000; i++) {
      const fromX = Math.floor(Math.random() * W);
      const fromY = Math.floor(Math.random() * 50);
      const toX = Math.floor(Math.random() * W);
      const toY = Math.floor(Math.random() * 50);
      const cup = `\x1b[${toY + 1};${toX + 1}H`;
      expect(cursorMove(fromX, fromY, toX, toY, W).length).toBeLessThanOrEqual(cup.length);
    }
  });
});

describe("styleTransition — minimal output", () => {
  // Bun sets NO_COLOR itself whenever stdout isn't a TTY (true under CI/vitest),
  // so the ambient default can't be trusted — force colour on for these assertions.
  beforeEach(() => colorMode.set(true));
  afterEach(() => colorMode.reset());

  test("adding one attribute emits only that attribute", () => {
    expect(
      styleTransition(new Style({ bold: true }), new Style({ bold: true, italic: true })),
    ).toBe("\x1b[3m");
  });

  test("removing one attribute emits only its off-code", () => {
    expect(
      styleTransition(new Style({ bold: true, italic: true }), new Style({ bold: true })),
    ).toBe("\x1b[23m");
  });

  test("an unchanged style emits nothing", () => {
    const s = new Style({ color: "#abcdef", bold: true });
    expect(styleTransition(s, new Style({ color: "#abcdef", bold: true }))).toBe("");
  });

  test("only the foreground changes when only the foreground differs", () => {
    const out = styleTransition(
      new Style({ color: "#ff0000", background: "#0000ff" }),
      new Style({ color: "#00ff00", background: "#0000ff" }),
    );
    expect(out).toContain("\x1b[38;2;0;255;0m");
    expect(out).not.toContain("48;2"); // bg unchanged → not re-emitted
  });

  test("bold+dim → bold re-adds bold after the shared 22 reset", () => {
    // SGR 22 clears BOTH bold and dim, so dropping dim must re-issue bold.
    expect(styleTransition(new Style({ bold: true, dim: true }), new Style({ bold: true }))).toBe(
      "\x1b[22m\x1b[1m",
    );
  });

  test("dropping a colour returns it to the active theme's fg/bg, not the terminal default", () => {
    // An unset colour resolves to the theme's own fg/bg (see themeDefaultFg/Bg
    // in ansi-style.ts) rather than the ambient terminal default — a themed
    // app has already committed to an explicit background, so unstyled text
    // must resolve against *that* background, not whatever the user's
    // terminal happens to be configured with (commonly a mismatch: a light
    // ztui theme against a developer's dark-profile terminal renders
    // unreadable light-on-light text otherwise).
    const dropFg = styleTransition(new Style({ color: "#ff0000" }), new Style({}));
    expect(dropFg).not.toBe("\x1b[39m");
    expect(dropFg).toContain("38;2;214;214;214"); // default-dark's foreground

    const dropBg = styleTransition(new Style({ background: "#ff0000" }), new Style({}));
    expect(dropBg).not.toBe("\x1b[49m");
    expect(dropBg).toContain("48;2;26;26;26"); // default-dark's background
  });
});

describe("styleTransition — correctness (pen matches a clean establish)", () => {
  const samples = [
    new Style({}),
    new Style({ bold: true }),
    new Style({ dim: true }),
    new Style({ bold: true, dim: true }),
    new Style({ italic: true, underline: true }),
    new Style({ underlineStyle: "curly", underlineColor: "#ff8800" }),
    new Style({ reverse: true }),
    new Style({ strikethrough: true }),
    new Style({ color: "#ff0000" }),
    new Style({ background: "#0000ff" }),
    new Style({ color: "#00ff00", background: "#123456", bold: true, italic: true }),
    new Style({ color: "default" }),
  ];

  test("from any sample to any other, the transition reaches the target pen", () => {
    for (const from of samples) {
      for (const to of samples) {
        // Start the pen at `from` exactly (as the diff would have left it).
        const pen: Pen = {};
        applyStream(styleToEscapeCodes(from).start, pen);
        // Apply only the transition delta.
        applyStream(styleTransition(from, to), pen);
        expect(canon(pen), `${canon(expectedPen(from))} -> ${canon(expectedPen(to))}`).toBe(
          canon(expectedPen(to)),
        );
      }
    }
  });
});
