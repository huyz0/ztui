import { describe, test } from "vitest";
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

// Bind imports locally: under Vite's module runner every imported binding is a
// getter, which would dominate these sub-microsecond loops.
const _stringWidth = stringWidth;
const _splitGraphemes = splitGraphemes;
const _charWidth = charWidth;
const _wrapText = wrapText;
const _truncate = truncate;
const _Markdown = Markdown;
const _SAMPLE_MARKDOWN = SAMPLE_MARKDOWN;

/** One `test` per benchmark, so each reports (and filters via `-t`) on its own. */
const benchTest = (name: string, fn: () => void) =>
  test(name, async ({ bench }) => {
    await bench(name, fn).run();
  });

describe("bench: text measurement & wrapping", () => {
  benchTest("stringWidth (ascii)", () => void _stringWidth(ASCII));
  benchTest("stringWidth (mixed)", () => void _stringWidth(MIXED));
  benchTest("splitGraphemes (mixed)", () => void _splitGraphemes(MIXED));
  benchTest("charWidth", () => void _charWidth("世"));
  benchTest("wrapText (w=40)", () => void _wrapText(PARAGRAPH, 40));
  benchTest("truncate", () => void _truncate(PARAGRAPH, 40));
});

describe("bench: markdown", () => {
  benchTest("renderToLines", () => void _Markdown.renderToLines(_SAMPLE_MARKDOWN));
});
