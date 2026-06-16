import { bench, describe } from "vitest";
import { SAMPLE_MARKDOWN } from "../test/bench/perf-harness.ts";
import { Markdown } from "./rich/markdown.ts";
import { charWidth, splitGraphemes, stringWidth } from "./segment.ts";
import { truncate, wrapText } from "./text-wrap.ts";

// Ops/sec tracking for text measurement, wrapping and markdown parsing.
const ASCII = "the quick brown fox jumps over the lazy dog 0123456789";
const MIXED = "café ☕ 日本語 👨‍👩‍👧 emoji 🎉 and ascii tail";
const PARAGRAPH =
  "ztui re-renders a full widget tree to a cell buffer and diffs it to ANSI on " +
  "every frame, with several clauses so the greedy wrapper has real work to do.";

describe("bench: text measurement & wrapping", () => {
  bench("stringWidth (ascii)", () => void stringWidth(ASCII));
  bench("stringWidth (mixed)", () => void stringWidth(MIXED));
  bench("splitGraphemes (mixed)", () => void splitGraphemes(MIXED));
  bench("charWidth", () => void charWidth("世"));
  bench("wrapText (w=40)", () => void wrapText(PARAGRAPH, 40));
  bench("truncate", () => void truncate(PARAGRAPH, 40));
});

describe("bench: markdown", () => {
  bench("renderToLines", () => void Markdown.renderToLines(SAMPLE_MARKDOWN));
});
