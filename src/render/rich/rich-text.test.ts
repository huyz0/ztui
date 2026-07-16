import { describe, expect, test } from "vitest";
import { Style } from "../style.ts";
import { parseStyleString, RichText, splitRichTextIntoLines } from "./text.ts";

describe("RichText Engine", () => {
  test("parseStyleString maps properties", () => {
    const s1 = parseStyleString("bold red on blue");
    expect(s1.bold).toBe(true);
    expect(s1.color).toBe("red");
    expect(s1.background).toBe("blue");

    const s2 = parseStyleString("italic dim link=https://example.com");
    expect(s2.italic).toBe(true);
    expect(s2.dim).toBe(true);
    expect(s2.link).toBe("https://example.com");

    // Underline shapes and coloured underlines.
    expect(parseStyleString("undercurl").underlineStyle).toBe("curly");
    expect(parseStyleString("dotted-underline").underlineStyle).toBe("dotted");
    expect(parseStyleString("double-underline").underlineStyle).toBe("double");
    const s3 = parseStyleString("undercurl underline=red");
    expect(s3.underline).toBe(true);
    expect(s3.underlineStyle).toBe("curly");
    expect(s3.underlineColor).toBe("red");

    expect(parseStyleString("reverse").reverse).toBe(true);

    // A trailing "on" with nothing after it has no background to consume.
    expect(parseStyleString("bold on").background).toBeUndefined();
  });

  test("RichText.fromMarkup simple tag parsing", () => {
    const rich = RichText.fromMarkup("Hello [bold]world[/]!");
    expect(rich.plain).toBe("Hello world!");
    expect(rich.spans.length).toBe(1);
    expect(rich.spans[0].start).toBe(6);
    expect(rich.spans[0].end).toBe(11);
    expect(rich.spans[0].style.bold).toBe(true);
  });

  test("RichText.fromMarkup nested and overlapping tags", () => {
    const rich = RichText.fromMarkup("[red]Hello [bold]world[/bold] style[/red]");
    expect(rich.plain).toBe("Hello world style");
    expect(rich.spans.length).toBe(2);

    // Sorted spans by start
    expect(rich.spans[0].style.color).toBe("red");
    expect(rich.spans[0].start).toBe(0);
    expect(rich.spans[0].end).toBe(17);

    expect(rich.spans[1].style.bold).toBe(true);
    expect(rich.spans[1].start).toBe(6);
    expect(rich.spans[1].end).toBe(11);
  });

  test("RichText.fromMarkup tag escaping", () => {
    const rich = RichText.fromMarkup("This is \\[not a tag\\] and [bold]this is[/]");
    expect(rich.plain).toBe("This is [not a tag] and this is");
    expect(rich.spans.length).toBe(1);
    expect(rich.spans[0].style.bold).toBe(true);
  });

  test("RichText.fromMarkup treats a backslash-prefixed tag-looking match as literal text", () => {
    // The tag regex itself captures leading backslashes; an odd count means
    // the whole "[...]" is escaped and rendered as literal text, not a tag.
    const rich = RichText.fromMarkup("Show \\[bold] literally");
    expect(rich.plain).toBe("Show [bold] literally");
    expect(rich.spans.length).toBe(0);
  });

  test("adjacent (non-overlapping) tags sharing a boundary offset order correctly", () => {
    // The closing endpoint of [bold] and the opening endpoint of [red] land
    // on the same plain-text offset; leaving must sort before entering there.
    const rich = RichText.fromMarkup("[bold]A[/][red]B[/]");
    const segments = rich.toSegments();
    expect(segments.map((s) => s.text)).toEqual(["A", "B"]);
    expect(segments[0].style.bold).toBe(true);
    expect(segments[1].style.color).toBe("red");
  });

  test("a named close tag skips past a non-matching innermost open tag", () => {
    // [/red] must close [red], searching past the innermost [bold] which
    // doesn't match — exercising the mismatch branch of the name search.
    const rich = RichText.fromMarkup("[red][bold]x[/red]y");
    expect(rich.plain).toBe("xy");
    expect(rich.spans).toHaveLength(2);
    const red = rich.spans.find((s) => s.style.color === "red")!;
    const bold = rich.spans.find((s) => s.style.bold)!;
    expect(red.start).toBe(0);
    expect(red.end).toBe(1);
    // The unmatched [bold] implicitly closes at the very end of the markup.
    expect(bold.end).toBe(2);
  });

  test("a close tag with no matching open tag is dropped (no span emitted)", () => {
    const rich = RichText.fromMarkup("[/nonexistent]hello");
    expect(rich.plain).toBe("hello");
    expect(rich.spans).toHaveLength(0);
  });

  test("toSegments ignores a span whose end does not exceed its start", () => {
    const rich = new RichText("abc", [{ start: 1, end: 1, style: new Style({ bold: true }) }]);
    const segments = rich.toSegments();
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("abc");
    expect(segments[0].style.bold).toBeFalsy();
  });

  test("an unclosed tag implicitly closes at the end of the markup", () => {
    const rich = RichText.fromMarkup("[bold]never closed");
    expect(rich.plain).toBe("never closed");
    expect(rich.spans.length).toBe(1);
    expect(rich.spans[0].start).toBe(0);
    expect(rich.spans[0].end).toBe(rich.plain.length);
    expect(rich.spans[0].style.bold).toBe(true);
  });

  test("toSegments sorts endpoints correctly even when spans arrive out of start order", () => {
    // Three adjacent (non-overlapping) spans covering [0,1) [1,2) [2,3), handed
    // to the constructor out of start order — exercises the endpoint sort's
    // tie-break (an exit and an entry landing on the same offset).
    const rich = new RichText("abc", [
      { start: 0, end: 1, style: new Style({ color: "a" }) },
      { start: 2, end: 3, style: new Style({ color: "c" }) },
      { start: 1, end: 2, style: new Style({ color: "b" }) },
    ]);
    const segments = rich.toSegments();
    expect(segments.map((s) => [s.text, s.style.color])).toEqual([
      ["a", "a"],
      ["b", "b"],
      ["c", "c"],
    ]);
  });

  test("toSegments converts correctly with active styles stack", () => {
    const rich = RichText.fromMarkup("Hello [bold red]world[/]!");
    const segments = rich.toSegments();

    expect(segments.length).toBe(3);

    expect(segments[0].text).toBe("Hello ");
    expect(segments[0].style.equals(Style.DEFAULT)).toBe(true);

    expect(segments[1].text).toBe("world");
    expect(segments[1].style.bold).toBe(true);
    expect(segments[1].style.color).toBe("red");

    expect(segments[2].text).toBe("!");
    expect(segments[2].style.equals(Style.DEFAULT)).toBe(true);
  });

  test("splitRichTextIntoLines splits correctly", () => {
    const rich = RichText.fromMarkup("[bold red]Line 1\nLine 2[/]");
    const lines = splitRichTextIntoLines(rich);

    expect(lines.length).toBe(2);

    expect(lines[0].plain).toBe("Line 1");
    expect(lines[0].spans.length).toBe(1);
    expect(lines[0].spans[0].start).toBe(0);
    expect(lines[0].spans[0].end).toBe(6);
    expect(lines[0].spans[0].style.bold).toBe(true);
    expect(lines[0].spans[0].style.color).toBe("red");

    expect(lines[1].plain).toBe("Line 2");
    expect(lines[1].spans.length).toBe(1);
    expect(lines[1].spans[0].start).toBe(0);
    expect(lines[1].spans[0].end).toBe(6);
    expect(lines[1].spans[0].style.bold).toBe(true);
    expect(lines[1].spans[0].style.color).toBe("red");
  });
});
