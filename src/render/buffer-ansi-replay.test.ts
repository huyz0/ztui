import { describe, expect, test } from "vitest";
import { styleToEscapeCodes } from "./ansi-style.ts";
import { ScreenBuffer } from "./buffer.ts";
import { Style } from "./style.ts";

/**
 * Visual-equivalence backstop for the render diff's ANSI output. A tiny SGR
 * interpreter replays the emitted escape stream onto a grid and records the
 * active style ("pen") at every written cell; the test asserts that grid matches
 * the source buffer cell-for-cell. The diff's *byte layout* (per-run resets vs
 * sticky SGR) is free to change as long as the rendered screen is identical.
 *
 * The pen model only needs to be **self-consistent** — it is applied the same
 * way to the diff stream and to each cell's own `styleToEscapeCodes(...).start`,
 * so a stale or missing reset shows up as a mismatch regardless of the exact
 * terminal semantics.
 */

type Pen = Record<string, string>;

/** Apply one SGR body (between `\x1b[` and `m`) to the pen, in place. */
function applySgr(body: string, pen: Pen): void {
  const codes = (body === "" ? "0" : body).split(";");
  for (let i = 0; i < codes.length; i++) {
    const tok = codes[i];
    const head = tok.split(":")[0];
    switch (head) {
      case "0": {
        // SGR reset clears every attribute EXCEPT an OSC-8 hyperlink, which is
        // only closed by `\x1b]8;;\x1b\\`. Preserving it here is what makes this
        // harness catch a link that bleeds past a style change.
        const link = pen.link;
        for (const k of Object.keys(pen)) delete pen[k];
        if (link !== undefined) pen.link = link;
        break;
      }
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
        if (tok.includes(":")) {
          pen[slot] = tok;
        } else if (codes[i + 1] === "5") {
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

/** Canonical string for a pen, order-independent. */
function canon(pen: Pen): string {
  return Object.keys(pen)
    .sort()
    .map((k) => `${k}=${pen[k]}`)
    .join(",");
}

/** Replay a diff stream onto a grid; each written cell records its char + pen. */
function replay(
  diff: string,
  w: number,
  h: number,
  initial?: ScreenBuffer,
): { char: string; pen: string }[][] {
  // Seed the grid with the terminal's prior content when given (a scroll frame
  // shifts that content), else start blank like a fresh screen.
  const grid: { char: string; pen: string }[][] = Array.from({ length: h }, (_, gy) =>
    Array.from({ length: w }, (_, gx) =>
      initial
        ? { char: initial.cells[gy][gx].char, pen: expectedPen(initial.cells[gy][gx].style) }
        : { char: " ", pen: "" },
    ),
  );
  let x = 0;
  let y = 0;
  // Last graphic char written, for REP (`\x1b[nb`).
  let lastChar = " ";
  // Scroll region (DECSTBM), inclusive zero-based rows; full screen by default.
  let regionTop = 0;
  let regionBot = h - 1;
  const blank = () => ({ char: " ", pen: "" });
  const pen: Pen = {};
  let i = 0;
  while (i < diff.length) {
    if (diff[i] === "\x1b" && diff[i + 1] === "[") {
      let j = i + 2;
      while (j < diff.length && !/[A-Za-z]/.test(diff[j])) j++;
      const body = diff.slice(i + 2, j);
      const final = diff[j];
      if (final === "H") {
        const [r, c] = body.split(";").map((n) => Number(n) || 1);
        y = r - 1;
        x = c - 1;
      } else if (final === "m") {
        applySgr(body, pen);
      } else if (final === "C" || final === "D" || final === "A" || final === "B") {
        // Relative cursor moves: CUF/CUB (x±n), CUD/CUU (y±n); empty body = 1.
        const n = Number(body) || 1;
        if (final === "C") x += n;
        else if (final === "D") x -= n;
        else if (final === "B") y += n;
        else y -= n;
      } else if (final === "r") {
        // DECSTBM: set scroll margins (empty = full screen) and home the cursor.
        if (body === "") {
          regionTop = 0;
          regionBot = h - 1;
        } else {
          const [t, b] = body.split(";").map((n) => Number(n) || 1);
          regionTop = t - 1;
          regionBot = b - 1;
        }
        x = 0;
        y = 0;
      } else if (final === "b") {
        // REP: repeat the last written graphic char n times (advancing x).
        const n = Number(body) || 1;
        for (let k = 0; k < n; k++) {
          if (y >= 0 && y < h && x >= 0 && x < w) grid[y][x] = { char: lastChar, pen: canon(pen) };
          x++;
        }
      } else if (final === "K") {
        // EL: clear from the cursor to the end of the line (mode 0 / empty) to a
        // default blank — ztui only emits it with a default pen.
        if (body === "" || body === "0") {
          for (let c = x; c < w; c++) grid[y][c] = { char: " ", pen: "" };
        }
      } else if (final === "S" || final === "T") {
        // Scroll the region up (S) / down (T) by n, blanking the revealed rows.
        const n = Number(body) || 1;
        if (final === "S") {
          for (let r = regionTop; r <= regionBot - n; r++) grid[r] = grid[r + n];
          for (let r = regionBot - n + 1; r <= regionBot; r++)
            grid[r] = Array.from({ length: w }, blank);
        } else {
          for (let r = regionBot; r >= regionTop + n; r--) grid[r] = grid[r - n];
          for (let r = regionTop; r <= regionTop + n - 1; r++)
            grid[r] = Array.from({ length: w }, blank);
        }
      }
      i = j + 1;
      continue;
    }
    if (diff[i] === "\r") {
      // Carriage return: snap to column 0 on the current row.
      x = 0;
      i++;
      continue;
    }
    if (diff[i] === "\x1b" && diff[i + 1] === "]") {
      const st = diff.indexOf("\x1b\\", i + 2);
      const osc = diff.slice(i + 2, st);
      if (osc.startsWith("8;;")) {
        const url = osc.slice(3);
        if (url) pen.link = url;
        else delete pen.link;
      }
      i = st + 2;
      continue;
    }
    if (y >= 0 && y < h && x >= 0 && x < w) grid[y][x] = { char: diff[i], pen: canon(pen) };
    lastChar = diff[i];
    x++;
    i++;
  }
  return grid;
}

/** The pen a cell's own style produces from a clean slate (the expected value). */
function expectedPen(style: Style): string {
  const pen: Pen = {};
  const { start } = styleToEscapeCodes(style);
  // start is a sequence of \x1b[...m (and possibly an OSC link wrapper).
  for (const m of start.matchAll(/\x1b\[([0-9;:]*)m/g)) applySgr(m[1], pen);
  const link = start.match(/\x1b\]8;;([^\x1b]*)\x1b\\/);
  if (link?.[1]) pen.link = link[1];
  return canon(pen);
}

/** A buffer full of varied styles on ASCII text (single-width cells). */
function variedBuffer(): ScreenBuffer {
  const buf = new ScreenBuffer(20, 6);
  const styles = [
    new Style({ color: "#ff0000" }),
    new Style({ color: "#ff0000" }), // same as prev → sticky candidate
    new Style({ background: "#0000ff", bold: true }),
    new Style({ color: "#00ff00", background: "#0000ff" }),
    new Style({ italic: true, underline: true }),
    new Style({ reverse: true }),
    new Style({ color: "#ff0000" }), // recurs after others changed the pen
    Style.DEFAULT,
    new Style({ strikethrough: true, dim: true }),
    new Style({ color: "#abcdef", background: "#123456", bold: true, italic: true }),
    new Style({ link: "https://example.com", color: "#00ffff" }),
    new Style({ link: "https://example.com", color: "#00ffff" }), // same link, sticky
  ];
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 20; x++) {
      const ch = String.fromCharCode(65 + ((x + y) % 26));
      buf.setCell(x, y, ch, styles[(x + y * 3) % styles.length]);
    }
  }
  return buf;
}

describe("render diff ANSI replays to the source buffer", () => {
  test("a full repaint reproduces every cell's char and style", () => {
    const buf = variedBuffer();
    const blank = new ScreenBuffer(20, 6); // empty prev → every cell emitted
    const diff = buf.renderDiff(blank);

    const grid = replay(diff, 20, 6);
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 20; x++) {
        const cell = buf.cells[y][x];
        expect(grid[y][x].char, `char at ${x},${y}`).toBe(cell.char);
        expect(grid[y][x].pen, `style at ${x},${y}`).toBe(expectedPen(cell.style));
      }
    }
  });

  test("a partial repaint of changed cells stays style-correct", () => {
    const buf = variedBuffer();
    const prev = new ScreenBuffer(20, 6);
    buf.copyTo(prev);
    // Change a scattered handful of cells, then diff again.
    buf.setCell(3, 1, "Z", new Style({ color: "#ffff00", bold: true }));
    buf.setCell(10, 4, "Q", new Style({ background: "#ff00ff" }));
    buf.setCell(11, 4, "R", new Style({ background: "#ff00ff" }));
    const diff = buf.renderDiff(prev);
    const grid = replay(diff, 20, 6);
    for (const [x, y] of [
      [3, 1],
      [10, 4],
      [11, 4],
    ]) {
      const cell = buf.cells[y][x];
      expect(grid[y][x].char, `char at ${x},${y}`).toBe(cell.char);
      expect(grid[y][x].pen, `style at ${x},${y}`).toBe(expectedPen(cell.style));
    }
  });

  test("a vertical scroll emits a scroll-region op and replays to the new frame", () => {
    const prev = variedBuffer(); // what the terminal currently shows
    const next = new ScreenBuffer(20, 6);
    // next = prev scrolled up by 2: rows 0..3 are prev rows 2..5; rows 4..5 new.
    for (let y = 0; y <= 3; y++) {
      for (let x = 0; x < 20; x++) {
        const c = prev.cells[y + 2][x];
        next.setCell(x, y, c.char, c.style);
      }
    }
    for (let y = 4; y <= 5; y++) {
      for (let x = 0; x < 20; x++) {
        next.setCell(
          x,
          y,
          String.fromCharCode(97 + ((x + y) % 26)),
          new Style({ color: "#33ccff" }),
        );
      }
    }

    const prevSeed = new ScreenBuffer(20, 6);
    prev.copyTo(prevSeed); // renderDiff mutates `prev` (shiftRowsForScroll); keep a clean seed
    const diff = next.renderDiff(prev, undefined, 20, 6, 0, true);

    // It must take the scroll path (DECSTBM + SU), not re-emit all six rows.
    expect(diff, "expected a scroll-up op").toMatch(/\x1b\[\d+;\d+r\x1b\[\d+S/);

    const grid = replay(diff, 20, 6, prevSeed);
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 20; x++) {
        const cell = next.cells[y][x];
        expect(grid[y][x].char, `char at ${x},${y}`).toBe(cell.char);
        expect(grid[y][x].pen, `style at ${x},${y}`).toBe(expectedPen(cell.style));
      }
    }
  });

  test("a scroll-down emits SD and replays to the new frame", () => {
    const prev = variedBuffer();
    const next = new ScreenBuffer(20, 6);
    // next = prev scrolled down by 2: rows 2..5 are prev rows 0..3; rows 0..1 new.
    for (let y = 2; y <= 5; y++) {
      for (let x = 0; x < 20; x++) {
        const c = prev.cells[y - 2][x];
        next.setCell(x, y, c.char, c.style);
      }
    }
    for (let y = 0; y <= 1; y++) {
      for (let x = 0; x < 20; x++) {
        next.setCell(x, y, String.fromCharCode(48 + ((x + y) % 10)), new Style({ bold: true }));
      }
    }
    const prevSeed = new ScreenBuffer(20, 6);
    prev.copyTo(prevSeed);
    const diff = next.renderDiff(prev, undefined, 20, 6, 0, true);
    expect(diff, "expected a scroll-down op").toMatch(/\x1b\[\d+;\d+r\x1b\[\d+T/);
    const grid = replay(diff, 20, 6, prevSeed);
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 20; x++) {
        const cell = next.cells[y][x];
        expect(grid[y][x].char, `char at ${x},${y}`).toBe(cell.char);
        expect(grid[y][x].pen, `pen at ${x},${y}`).toBe(expectedPen(cell.style));
      }
    }
  });

  test("a shrinking line clears its tail with EL and replays blank", () => {
    const prev = new ScreenBuffer(40, 3);
    const next = new ScreenBuffer(40, 3);
    const text = new Style({ color: "#ffffff" });
    // prev row 1 is full of text; next row 1 keeps only a short prefix.
    for (let x = 0; x < 40; x++) {
      prev.setCell(x, 1, "X", text);
      next.setCell(x, 1, x < 3 ? "h" : " ", x < 3 ? text : Style.DEFAULT);
    }
    const prevSeed = new ScreenBuffer(40, 3);
    prev.copyTo(prevSeed);
    const diff = next.renderDiff(prev);
    expect(diff, "expected an EL clear").toContain("\x1b[K");

    const grid = replay(diff, 40, 3, prevSeed);
    for (let x = 0; x < 40; x++) {
      const cell = next.cells[1][x];
      expect(grid[1][x].char, `char at ${x}`).toBe(cell.char);
      expect(grid[1][x].pen, `pen at ${x}`).toBe(expectedPen(cell.style));
    }
  });

  test("a long identical run compresses with REP and replays correctly", () => {
    const next = new ScreenBuffer(60, 2);
    const blank = new ScreenBuffer(60, 2);
    const line = new Style({ color: "#8888ff" });
    // A solid box-drawing rule across the row — the canonical REP case.
    for (let x = 0; x < 60; x++) {
      next.setCell(x, 0, "─", line);
      next.setCell(x, 1, "█", new Style({ color: "#00ff00" }));
    }
    // allowScroll=false, allowRepeat=true.
    const diff = next.renderDiff(blank, undefined, 60, 2, 0, false, true);
    expect(diff, "expected a REP op").toMatch(/\x1b\[\d+b/);

    const grid = replay(diff, 60, 2);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 60; x++) {
        const cell = next.cells[y][x];
        expect(grid[y][x].char, `char at ${x},${y}`).toBe(cell.char);
        expect(grid[y][x].pen, `pen at ${x},${y}`).toBe(expectedPen(cell.style));
      }
    }
  });

  test("scattered edits never take the scroll path (no false positive)", () => {
    const prev = variedBuffer();
    const next = variedBuffer();
    next.setCell(3, 1, "Z", new Style({ color: "#ffff00", bold: true }));
    next.setCell(10, 4, "Q", new Style({ background: "#ff00ff" }));
    const prevSeed = new ScreenBuffer(20, 6);
    prev.copyTo(prevSeed);
    const diff = next.renderDiff(prev, undefined, 20, 6, 0, true);
    // Not a clean shift → must stay on the per-cell path, no scroll-region op.
    expect(diff).not.toMatch(/\x1b\[\d+;\d+r/);
    const grid = replay(diff, 20, 6, prevSeed);
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 20; x++) {
        const cell = next.cells[y][x];
        expect(grid[y][x].char, `char at ${x},${y}`).toBe(cell.char);
        expect(grid[y][x].pen, `pen at ${x},${y}`).toBe(expectedPen(cell.style));
      }
    }
  });
});
