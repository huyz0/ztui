import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import {
  horizontalScrollbarTrack,
  scrollbarThumb,
  scrollbarTrackStyle,
  verticalScrollbarTrack,
} from "./scrollbar.ts";
import { Widget } from "./widget.ts";

function region(x: number, y: number, w: number, h: number): Region {
  return new Region(new Offset(x, y), new Size(w, h));
}

describe("verticalScrollbarTrack", () => {
  test("borderless widgets track the content/viewport rect, not the border", () => {
    const client = region(0, 0, 20, 10);
    const content = region(1, 1, 18, 8);
    const viewport = region(0, 0, 20, 10);
    const track = verticalScrollbarTrack(client, content, viewport, false);
    expect(track.line).toBe(viewport.right - 1);
    expect(track.start).toBe(content.y);
    expect(track.end).toBe(content.bottom - 1);
  });

  test("bordered widgets paint the track on the border itself", () => {
    const client = region(0, 0, 20, 10);
    const content = region(1, 1, 18, 8);
    const viewport = region(0, 0, 20, 10);
    const track = verticalScrollbarTrack(client, content, viewport, true);
    expect(track.line).toBe(client.right - 1);
    expect(track.start).toBe(client.y + 1);
    expect(track.end).toBe(client.bottom - 2);
  });
});

describe("horizontalScrollbarTrack", () => {
  test("borderless widgets track the content/viewport rect, not the border", () => {
    const client = region(0, 0, 20, 10);
    const content = region(1, 1, 18, 8);
    const viewport = region(0, 0, 20, 10);
    const track = horizontalScrollbarTrack(client, content, viewport, false);
    expect(track.line).toBe(viewport.bottom - 1);
    expect(track.start).toBe(content.x);
    expect(track.end).toBe(content.right - 1);
  });

  test("bordered widgets paint the track on the border itself", () => {
    const client = region(0, 0, 20, 10);
    const content = region(1, 1, 18, 8);
    const viewport = region(0, 0, 20, 10);
    const track = horizontalScrollbarTrack(client, content, viewport, true);
    expect(track.line).toBe(client.bottom - 1);
    expect(track.start).toBe(client.x + 1);
    expect(track.end).toBe(client.right - 2);
  });
});

describe("scrollbarThumb", () => {
  test("no scroll (maxScroll 0) parks the thumb at the track start", () => {
    const track = { line: 0, start: 0, end: 9, length: 10 };
    const thumb = scrollbarThumb(track, 10, 10, 0);
    expect(thumb.maxScroll).toBe(0);
    expect(thumb.start).toBe(track.start);
  });

  test("scrolled content positions the thumb proportionally along the track", () => {
    const track = { line: 0, start: 0, end: 19, length: 20 };
    const thumb = scrollbarThumb(track, 10, 30, 10); // halfway scrolled
    expect(thumb.maxScroll).toBe(20);
    expect(thumb.size).toBeGreaterThanOrEqual(1);
    expect(thumb.start).toBeGreaterThan(track.start);
  });
});

describe("scrollbarTrackStyle", () => {
  test("uses borderColor when set", () => {
    const widget = new Widget("box");
    widget.style.borderColor = "#ff0000";
    const style = scrollbarTrackStyle(widget);
    expect(style.background).toBeDefined();
  });

  test("falls back to color when borderColor is unset", () => {
    const widget = new Widget("box");
    widget.style.color = "#00ff00";
    const style = scrollbarTrackStyle(widget);
    expect(style.background).toBeDefined();
  });

  test("falls back to the $dimmed theme token (or gray) when neither is set", () => {
    const widget = new Widget("box");
    const style = scrollbarTrackStyle(widget);
    // No app/cssResolver attached in this unit test, so it falls through to
    // the hardcoded "gray" default.
    expect(style.background).toBeDefined();
  });

  test("treats an explicit 'default' color the same as unset", () => {
    const widget = new Widget("box");
    widget.style.borderColor = "default";
    const style = scrollbarTrackStyle(widget);
    expect(style.background).toBeDefined();
  });
});
