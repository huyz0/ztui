import { describe, expect, test } from "vitest";
import { Syntax } from "./syntax.ts";

describe("Syntax Highlighting Engine", () => {
  test("highlight handles typescript code blocks", () => {
    const code = "const x = 5;\n// comment here\nconst s = 'str';";
    const rich = Syntax.highlight(code, "typescript");

    expect(rich.plain).toBe(code);
    expect(rich.spans.length).toBeGreaterThan(0);

    // Verify comment style
    const commentSpan = rich.spans.find((s) => s.style.dim === true);
    expect(commentSpan).toBeDefined();

    // Verify string style
    const stringSpan = rich.spans.find((s) => s.style.color?.includes("yellow"));
    expect(stringSpan).toBeDefined();

    // Verify keyword style
    const keywordSpan = rich.spans.find((s) => s.style.bold === true);
    expect(keywordSpan).toBeDefined();
  });

  test("highlightDiff formats added/removed lines", () => {
    const code = "@@ diff @@\n- old line\n+ new line";
    const rich = Syntax.highlight(code, "diff");

    expect(rich.plain).toBe(code);

    const addedSpan = rich.spans.find((s) => s.style.color?.includes("green"));
    expect(addedSpan).toBeDefined();

    const removedSpan = rich.spans.find((s) => s.style.color?.includes("red"));
    expect(removedSpan).toBeDefined();

    const headerSpan = rich.spans.find((s) => s.style.color === "cyan");
    expect(headerSpan).toBeDefined();
  });

  test("renderToLines applies gutters and shifts spans correctly", () => {
    const code = "const x = 1;\nconst y = 2;";
    const lines = Syntax.renderToLines(code, "typescript", true);

    expect(lines.length).toBe(2);

    // Gutter text for line 1 should be "1 │ "
    expect(lines[0].plain.includes("1 │ ")).toBe(true);

    // Line 1 should have a span for the gutter, and shifted spans for the code
    expect(lines[0].spans.length).toBeGreaterThan(1);

    // First span is the gutter span (colored/dimmed)
    expect(lines[0].spans[0].start).toBe(0);
    expect(lines[0].spans[0].end).toBe(5);
    expect(lines[0].spans[0].style.dim).toBe(true);
  });
});
