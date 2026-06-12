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
