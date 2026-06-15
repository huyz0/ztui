#!/usr/bin/env bun
/**
 * Mouse-mode diagnostic. Run the SAME command in each terminal (Ghostty, Windows
 * Terminal, …) and compare:
 *
 *   bun scripts/mouse-probe.ts          # enable mode 1003 (any-motion / hover)
 *   bun scripts/mouse-probe.ts 1002     # enable mode 1002 (drag-only motion)
 *
 * On start it enables `?1000h ?<mode>h ?1006h`, then asks the terminal (DECRQM
 * `?Pd$p`) which of 1000/1002/1003/1006 are actually active — so you can SEE the
 * mode in use, not assume it. Then move the mouse (hover, no button) and drag
 * (button held) and watch how each event is classified:
 *
 *   MOVE(no-button)  — buttonless hover motion (only sent in 1003, normally)
 *   DRAG(btn N)      — motion with a button held
 *   press/release    — clicks
 *
 * If a terminal reports `?1002 => SET` yet you still see MOVE(no-button) lines on
 * hover, that terminal streams hover motion regardless of mode — which would
 * explain hover working under a forced 1002. Press q or Ctrl-C to quit.
 */

const mode = process.argv[2] === "1002" ? 1002 : 1003;
const out = process.stdout;
const inp = process.stdin;

const write = (s: string) => out.write(s);

const DECRQM_STATE: Record<string, string> = {
  "0": "not-recognized",
  "1": "SET",
  "2": "reset",
  "3": "permanently-set",
  "4": "permanently-reset",
};

function cleanup(): never {
  write("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l");
  inp.setRawMode?.(false);
  out.write("\r\nbye.\r\n");
  process.exit(0);
}

inp.setRawMode?.(true);
inp.resume();
inp.setEncoding("utf8");

// Enable the chosen tracking mode + SGR encoding, then query the real state.
write(`\x1b[?1000h\x1b[?${mode}h\x1b[?1006h`);
write("\x1b[?1000$p\x1b[?1002$p\x1b[?1003$p\x1b[?1006$p");

out.write(
  `\r\nmouse-probe: requested mode ?${mode}h (+1000,1006). Querying actual state…\r\n` +
    `Hover (no button) and drag (button held). Press q or Ctrl-C to quit.\r\n\r\n`,
);

inp.on("data", (chunk: string) => {
  if (chunk === "q" || chunk === "") cleanup();

  // DECRQM replies: \x1b[?<mode>;<state>$y
  for (const m of chunk.matchAll(/\x1b\[\?(\d+);(\d+)\$y/g)) {
    out.write(`  mode ?${m[1]} => ${DECRQM_STATE[m[2]] ?? m[2]}\r\n`);
  }

  // SGR mouse: \x1b[<b;x;y(M|m)
  for (const m of chunk.matchAll(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g)) {
    const b = Number(m[1]);
    const motion = (b & 0x20) !== 0;
    const wheel = (b & 0x40) !== 0;
    const base = b & 3;
    const kind = wheel
      ? `wheel(${base})`
      : motion
        ? base === 3
          ? "MOVE(no-button)"
          : `DRAG(btn ${base})`
        : m[4] === "m"
          ? "release"
          : `press(btn ${base})`;
    out.write(`  mouse b=${b} ${kind.padEnd(16)} x=${m[2]} y=${m[3]}\r\n`);
  }
});
