/**
 * Ad-hoc terminal capability probe — run it *inside* the terminal you want to
 * inspect (e.g. Ghostty): `bun run scripts/probe-glyph.ts`.
 *
 * It sends the Glyph Protocol support query (`ESC _ 25a1 ; s ESC \`) alongside
 * the Kitty-graphics and primary device-attributes queries, then prints whatever
 * the terminal echoes back (raw + hex) so we can see what it actually supports.
 */
const stdin = process.stdin;
const stdout = process.stdout;

if (!stdin.isTTY || !stdout.isTTY) {
  console.error("Not a TTY — run this directly in your terminal, not via a pipe or this agent.");
  process.exit(1);
}

// Glyph Protocol "support" query. The identifier is U+25A1 (WHITE SQUARE)
// written as the literal lowercase ASCII hex string "25a1" (per the spec).
const GLYPH = "\x1b_25a1;s\x1b\\";
const KITTY_GFX = "\x1b_Gi=31,a=q;\x1b\\"; // Kitty graphics query
const DA1 = "\x1b[c"; // Primary device attributes (acts as a sync terminator)

stdin.setRawMode(true);
stdin.resume();

let buf = "";
stdin.on("data", (d) => {
  buf += d.toString("binary");
});

stdout.write(GLYPH + KITTY_GFX + DA1);

setTimeout(() => {
  stdin.setRawMode(false);
  stdin.pause();

  const hex = Buffer.from(buf, "binary").toString("hex");
  const printable = buf
    .replace(/\x1b/g, "\\e")
    .replace(/[\x00-\x1f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);

  const glyph = /\x1b_25a1;s(?:;[^\x1b]*)?\x1b\\/.test(buf);
  const kitty = /\x1b_Gi=31;[^\x1b]*OK[^\x1b]*\x1b\\/.test(buf);

  console.log("\n--- terminal probe ---");
  console.log("TERM_PROGRAM:", process.env.TERM_PROGRAM || "(unset)");
  console.log("raw response:", printable || "(nothing)");
  console.log("hex:        ", hex || "(nothing)");
  console.log("");
  console.log("Glyph Protocol (25a1;s):", glyph ? "✅ SUPPORTED" : "❌ no response");
  console.log("Kitty graphics (Gi=31): ", kitty ? "✅ SUPPORTED" : "❌ no response");
  process.exit(0);
}, 400);
