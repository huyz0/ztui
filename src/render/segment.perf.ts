import { describe, test } from "vitest";
import { perfGuard } from "../test/bench/perf-harness.ts";
import { charWidth, splitGraphemes, stringWidth } from "./segment.ts";

// Grapheme width measurement underlies layout, wrapping, selection and the diff
// cursor accounting — called constantly on every piece of text.
const ASCII = "the quick brown fox jumps over the lazy dog 0123456789";
const WIDE = "你好世界，这是一段中文文本，用来测量宽字符的处理速度。";
const MIXED = "café ☕ 日本語 👨‍👩‍👧 emoji 🎉 and ascii tail";

describe("perf: text measurement (segment.ts)", () => {
  test("stringWidth on ASCII", () => {
    perfGuard("segment.stringWidth (ascii)", () => stringWidth(ASCII), {
      iterations: 5000,
      budget: 1,
    });
  });

  test("stringWidth on wide (CJK) text", () => {
    perfGuard("segment.stringWidth (wide)", () => stringWidth(WIDE), {
      iterations: 5000,
      budget: 1,
    });
  });

  test("stringWidth on mixed emoji/ZWJ text", () => {
    perfGuard("segment.stringWidth (mixed)", () => stringWidth(MIXED), {
      iterations: 5000,
      budget: 1,
    });
  });

  test("splitGraphemes on mixed text", () => {
    perfGuard("segment.splitGraphemes (mixed)", () => splitGraphemes(MIXED), {
      iterations: 5000,
      budget: 1,
    });
  });

  test("charWidth on a single glyph", () => {
    perfGuard("segment.charWidth", () => charWidth("世"), { iterations: 10000, budget: 1 });
  });
});
