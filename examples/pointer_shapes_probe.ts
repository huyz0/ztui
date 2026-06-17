#!/usr/bin/env bun
/**
 * Absolute-minimum OSC 22 mouse-pointer-shape probe — zero ztui dependencies.
 *
 *   bun examples/pointer_shapes_probe.ts
 *   # or: npx tsx examples/pointer_shapes_probe.ts
 *
 * It writes the raw `ESC ] 22 ; <name> ST` sequence straight to stdout, so it
 * sidesteps ztui's capability detection entirely. Use it to answer one question:
 * does *this terminal* change the mouse cursor when asked?
 *
 *   →  next shape     ←  previous shape     q / Ctrl-C  quit
 *
 * After pressing a key, MOVE THE MOUSE over the terminal window — the pointer
 * shape only repaints under live pointer motion.
 *
 * Known to work: kitty, foot, recent xterm, WezTerm, Ghostty (partial).
 * No support (cursor won't change): Windows Terminal, VS Code terminal, iTerm2,
 * Terminal.app, tmux (unless passthrough is configured), and Alacritty unless
 * `terminal.osc22 = true` is set in its config.
 */

const SHAPES = [
  "default",
  "pointer",
  "text",
  "vertical-text",
  "wait",
  "progress",
  "help",
  "crosshair",
  "cell",
  "move",
  "grab",
  "grabbing",
  "alias",
  "copy",
  "no-drop",
  "not-allowed",
  "zoom-in",
  "zoom-out",
  "n-resize",
  "e-resize",
  "s-resize",
  "w-resize",
  "ne-resize",
  "nw-resize",
  "se-resize",
  "sw-resize",
  "ew-resize",
  "ns-resize",
  "nesw-resize",
  "nwse-resize",
];

const out = process.stdout;
const setShape = (name: string) => out.write(`\x1b]22;${name}\x1b\\`);
const reset = () => out.write("\x1b]22;\x1b\\");

let i = 0;
function draw() {
  setShape(SHAPES[i]);
  // Clear screen + home, then print status.
  out.write("\x1b[2J\x1b[H");
  out.write("OSC 22 pointer-shape probe\r\n");
  out.write("──────────────────────────\r\n\r\n");
  out.write(`  shape ${i + 1}/${SHAPES.length}:  \x1b[1m${SHAPES[i]}\x1b[0m\r\n\r\n`);
  out.write("  →/n next   ←/p prev   q quit\r\n\r\n");
  out.write("  Move the mouse over this window to see the cursor.\r\n");
  out.write("  If it never changes, your terminal lacks OSC 22 support.\r\n");
}

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

function quit() {
  reset();
  out.write("\x1b[2J\x1b[H");
  process.stdin.setRawMode?.(false);
  process.stdin.pause();
  process.exit(0);
}

process.stdin.on("data", (data: string) => {
  for (const ch of data) {
    if (ch === "q" || ch === "\x03") return quit(); // q or Ctrl-C
  }
  if (data === "\x1b[C" || data === "n" || data === " ") {
    i = (i + 1) % SHAPES.length;
    draw();
  } else if (data === "\x1b[D" || data === "p") {
    i = (i - 1 + SHAPES.length) % SHAPES.length;
    draw();
  }
});

draw();
