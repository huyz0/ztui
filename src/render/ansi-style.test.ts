import { describe, expect, test } from "vitest";
import { styleToEscapeCodes, styleTransition } from "./ansi-style.ts";
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

describe("styleTransition — minimal output", () => {
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

  test("dropping a colour returns it to default (39/49)", () => {
    expect(styleTransition(new Style({ color: "#ff0000" }), new Style({}))).toBe("\x1b[39m");
    expect(styleTransition(new Style({ background: "#ff0000" }), new Style({}))).toBe("\x1b[49m");
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
