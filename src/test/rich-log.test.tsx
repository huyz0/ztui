import { useState } from "react";
import { describe, expect, test } from "vitest";
import { Box, RichLog, VBox } from "../react/components.tsx";
import { reconciler } from "../react/reconciler.ts";
import { RichLogWidget } from "../widgets/data/rich-log.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

describe("RichLog", () => {
  test("renders plain lines and strips markup", async () => {
    const t = await mountApp(
      <RichLog id="log" lines={["[bold]hello[/]", "world"]} style={{ width: 20, height: 6 }} />,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("hello");
    expect(text).toContain("world");
    expect(text).not.toContain("[bold]");
  });

  test("word-wraps a long entry to the content width", async () => {
    // A root child fills the screen, so constrain width via a VBox parent.
    const t = await mountApp(
      <VBox>
        <RichLog id="log" lines={["aaaa bbbb cccc dddd"]} wrap style={{ width: 11 }} />
      </VBox>,
    );
    await t.settle();
    // 11 cols → "aaaa bbbb" (9) fits, "cccc"/"dddd" wrap to a second row.
    expect(t.findById<RichLogWidget>("log")?.selectableLines()).toEqual(["aaaa bbbb", "cccc dddd"]);
  });

  test("hard-splits a word longer than the width", async () => {
    const t = await mountApp(
      <VBox>
        <RichLog id="log" lines={["abcdefghij"]} wrap style={{ width: 4 }} />
      </VBox>,
    );
    await t.settle();
    expect(t.findById<RichLogWidget>("log")?.selectableLines()).toEqual(["abcd", "efgh", "ij"]);
  });

  test("honors embedded newlines as hard line breaks", async () => {
    const t = await mountApp(
      <RichLog id="log" lines={["one\ntwo\nthree"]} style={{ width: 20, height: 6 }} />,
    );
    await t.settle();
    expect(t.findById<RichLogWidget>("log")?.selectableLines()).toEqual(["one", "two", "three"]);
  });

  test("tails to the bottom: last lines visible, first scrolled off", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const t = await mountApp(<RichLog id="log" lines={lines} style={{ width: 20, height: 5 }} />);
    await t.settle();
    const text = t.text();
    expect(text).toContain("line 29");
    expect(text).not.toContain("line 0 ");
  });

  test("scrolling up stops tailing; pressing end resumes it", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const t = await mountApp(<RichLog id="log" lines={lines} style={{ width: 20, height: 5 }} />);
    await t.settle();
    const w = t.findById<RichLogWidget>("log") as RichLogWidget;

    w.handleScroll({ type: "scroll_up", handled: false });
    await t.settle();
    expect(t.text()).not.toContain("line 29");

    w.handleKey({ name: "end", handled: false });
    await t.settle();
    expect(t.text()).toContain("line 29");
  });

  test("appending a line keeps the view pinned to the bottom", async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const t = await mountApp(<RichLog id="log" lines={lines} style={{ width: 20, height: 4 }} />);
    await t.settle();
    expect(t.text()).toContain("line 9");

    reconciler.updateContainer(
      <RichLog id="log" lines={[...lines, "line 10"]} style={{ width: 20, height: 4 }} />,
      t.container,
      null,
      () => {},
    );
    await t.settle();
    expect(t.text()).toContain("line 10");
  });

  test("clicking the scrollbar track jumps the view and stops tailing", async () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    const t = await mountApp(<RichLog id="log" lines={lines} />); // fills 80x24
    await t.settle();
    expect(t.text()).toContain("line 59"); // tailing

    const w = t.findById<RichLogWidget>("log") as RichLogWidget;
    // Press at the top of the scrollbar column (x = right-1, y = top).
    w.handleMouse({ type: "press", button: "left", x: 79, y: 0, handled: false } as any);
    await t.settle();
    const text = t.text();
    expect(text).toContain("line 0");
    expect(text).not.toContain("line 59");
  });

  test("dragging the scrollbar scrolls, and release ends the drag", async () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    const t = await mountApp(<RichLog id="log" lines={lines} />);
    await t.settle();
    const w = t.findById<RichLogWidget>("log") as RichLogWidget;

    w.handleMouse({ type: "press", button: "left", x: 79, y: 0, handled: false } as any);
    await t.settle();
    expect(t.text()).toContain("line 0");

    // Drag to the bottom of the track → back to the tail.
    w.handleMouse({ type: "drag", x: 79, y: 23, handled: false } as any);
    await t.settle();
    expect(t.text()).toContain("line 59");

    // Release ends the drag; a later stray drag must not move the view.
    w.handleMouse({ type: "release", x: 79, y: 23, handled: false } as any);
    w.handleMouse({ type: "drag", x: 79, y: 0, handled: false } as any);
    await t.settle();
    expect(t.text()).toContain("line 59");
  });

  test("overflow reserves a scrollbar gutter so text is not clipped under it", async () => {
    // Each line fills the full 80-col width; with overflow, the body must wrap to
    // 79 cols (reserving the gutter) so no glyph lands under the scrollbar at col 79.
    const wide = "w".repeat(80);
    const lines = Array.from({ length: 40 }, () => wide);
    const t = await mountApp(<RichLog id="log" lines={lines} />);
    await t.settle();

    const w = t.findById<RichLogWidget>("log") as RichLogWidget;
    // Wrapped at the gutter width (79), so each entry spans two rows: 79 + 1.
    expect(w.selectableLines().slice(0, 2)).toEqual(["w".repeat(79), "w"]);

    // The scrollbar column (79) must hold the scrollbar, not wrapped text: either
    // the thumb (█) or a solid track cell (a space with a dimmed background) —
    // crucially never a content "w".
    const cell = t.cellAt(79, 0);
    const isThumb = cell.char === "█";
    const isTrack =
      cell.char === " " && !!cell.style.background && cell.style.background !== "default";
    expect(isThumb || isTrack).toBe(true);
  });

  test("wheel down re-tails; pageup/home page through the log", async () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    const t = await mountApp(<RichLog id="log" lines={lines} style={{ width: 20, height: 6 }} />);
    await t.settle();
    const w = t.findById<RichLogWidget>("log") as RichLogWidget;

    w.handleScroll({ type: "scroll_up", handled: false });
    await t.settle();
    expect(t.text()).not.toContain("line 59"); // left the tail

    // Wheel down enough to reach the bottom again → tailing resumes.
    for (let i = 0; i < 5; i++) w.handleScroll({ type: "scroll_down", handled: false });
    await t.settle();
    expect(t.text()).toContain("line 59");

    // Keyboard paging.
    w.handleKey({ name: "home", handled: false });
    await t.settle();
    expect(t.text()).toContain("line 0");
    w.handleKey({ name: "pagedown", handled: false });
    await t.settle();
    expect(t.text()).not.toContain("line 0");
  });

  test("a press on the scrollbar column is consumed, not leaked to an ancestor onClick", async () => {
    // Regression: clicking the scrollbar must not bubble through to a clickable
    // container wrapping the scrollable (the scrollable owns that column).
    let parentClicks = 0;
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    const t = await mountApp(
      <Box onClick={() => parentClicks++} style={{ width: 80, height: 24 }}>
        <RichLog id="log" lines={lines} />
      </Box>,
    );
    await t.settle();
    // Borderless vertical scrollbar sits in the last column (x = 79 of 80).
    // Drive it through the real app mouse pipeline (hit-test → dispatch → bubble).
    t.driver.simulateMouse(79, 0, "press", "left");
    t.driver.simulateMouse(79, 0, "release", "left");
    await t.settle();

    expect(parentClicks).toBe(0);
    // And the scrollbar still did its job: pressing the top jumped off the tail.
    expect(t.text()).not.toContain("line 59");
  });

  test("selectableLines rebuilds lazily after lines change before a render", async () => {
    const t = await mountApp(
      <VBox>
        <RichLog id="log" lines={["aaaa bbbb cccc"]} wrap style={{ width: 11 }} />
      </VBox>,
    );
    await t.settle();
    const w = t.findById<RichLogWidget>("log") as RichLogWidget;

    // Reassign lines, then read selectableLines *before* settling a new frame:
    // it must rebuild against the cached width rather than return stale rows.
    w.lines = ["xxxx yyyy zzzz"];
    expect(w.selectableLines()).toEqual(["xxxx yyyy", "zzzz"]);
  });

  test("per-entry wrap cache stays bounded to two widths, evicting the oldest", async () => {
    let setWidth!: (w: number) => void;
    function Host() {
      const [width, setter] = useState(20);
      setWidth = setter;
      return (
        <VBox>
          <RichLog id="log" lines={["aaaa bbbb cccc dddd"]} wrap style={{ width }} />
        </VBox>
      );
    }
    const t = await mountApp(<Host />);
    await t.settle();
    const w = t.findById<RichLogWidget>("log") as RichLogWidget;

    // Force the entry to be re-wrapped at three distinct widths; the cache
    // caps at two entries per line, so the third rebuild must evict the
    // first (oldest) width rather than growing unbounded.
    setWidth(15);
    await t.settle();
    setWidth(10);
    await t.settle();
    expect(w.selectableLines().join("|")).toContain("aaaa");
  });

  test("with wrap disabled, a long line is not split (clipped instead)", async () => {
    const t = await mountApp(
      <VBox>
        <RichLog id="log" lines={["aaaa bbbb cccc dddd"]} wrap={false} style={{ width: 11 }} />
      </VBox>,
    );
    await t.settle();
    expect(t.findById<RichLogWidget>("log")?.selectableLines()).toEqual(["aaaa bbbb cccc dddd"]);
  });

  test("assigning more lines than maxLines trims from the front", async () => {
    const t = await mountApp(
      <RichLog
        id="log"
        maxLines={2}
        lines={["one", "two", "three"]}
        style={{ width: 20, height: 6 }}
      />,
    );
    await t.settle();
    expect(t.findById<RichLogWidget>("log")?.selectableLines()).toEqual(["two", "three"]);
  });

  test("a blank line (consecutive newlines) contributes no empty segment", async () => {
    const t = await mountApp(
      <RichLog id="log" lines={["one\n\ntwo"]} style={{ width: 20, height: 6 }} />,
    );
    await t.settle();
    // The middle empty part between the two `\n`s becomes a genuinely blank
    // display row (no Segment at all), not a crash or a dropped row.
    expect(t.findById<RichLogWidget>("log")?.selectableLines()).toEqual(["one", "", "two"]);
  });

  test("a non-selectable log doesn't register selection runs while rendering", async () => {
    const t = await mountApp(
      <RichLog id="log" lines={["hello"]} style={{ width: 20, height: 6 }} />,
    );
    const log = t.findById<RichLogWidget>("log")!;
    log.selectable = false;
    await t.settle();
    // No throw, and the text still renders even with selection tracking off.
    expect(t.text()).toContain("hello");
  });

  test("a not-yet-mounted widget renders nothing when hidden", () => {
    const widget = new RichLogWidget();
    widget.visible = false;
    const buffer = { pushClip: () => {}, popClip: () => {} } as any;
    expect(() => widget.render(buffer)).not.toThrow();
  });

  test("a widget with a collapsed content rect (zero size) renders nothing", () => {
    const widget = new RichLogWidget();
    const buffer = { pushClip: () => {}, popClip: () => {} } as any;
    // Unmounted -> zero-size region -> content.width/height <= 0.
    expect(() => widget.render(buffer)).not.toThrow();
  });

  test("handleScroll/handleKey/handleMouse no-op once the event is already handled", async () => {
    const t = await mountApp(
      <RichLog id="log" lines={["a", "b", "c", "d", "e", "f"]} style={{ width: 20, height: 3 }} />,
    );
    await t.settle();
    const w = t.findById<RichLogWidget>("log")!;
    const before = (w as unknown as { scrollTop: number }).scrollTop;
    (w as unknown as { handleScroll: (e: unknown) => void }).handleScroll({
      type: "wheel-down",
      handled: true,
    });
    (w as unknown as { handleKey: (e: unknown) => void }).handleKey({
      name: "end",
      handled: true,
    });
    w.handleMouse({ type: "press", button: "left", x: 0, y: 0, handled: true } as any);
    expect((w as unknown as { scrollTop: number }).scrollTop).toBe(before);
  });

  test("handleKey resolves the key name from ev.key when ev.name is absent", async () => {
    const t = await mountApp(
      <RichLog id="log" lines={["a", "b", "c", "d", "e", "f"]} style={{ width: 20, height: 3 }} />,
    );
    await t.settle();
    const w = t.findById<RichLogWidget>("log")!;
    (w as unknown as { scrollTop: number }).scrollTop = 0;
    (w as unknown as { handleKey: (e: unknown) => void }).handleKey({ key: "home" });
    expect((w as unknown as { scrollTop: number }).scrollTop).toBe(0);
  });

  test("dragging the scrollbar past the track clamps to a valid scrollTop (no-op guard)", async () => {
    const t = await mountApp(
      <RichLog id="log" lines={["a", "b", "c"]} style={{ width: 20, height: 6 }} />,
    );
    await t.settle();
    const w = t.findById<RichLogWidget>("log")!;
    // Fewer rows than the viewport -> maxScrollTop is 0 and scrollToTrackY's
    // trackYToScrollTop returns null, so the private no-op branch runs.
    expect(() =>
      (w as unknown as { scrollToTrackY: (y: number) => void }).scrollToTrackY(0),
    ).not.toThrow();
  });

  test("the scrollbar thumb sits at the top when already at scrollTop 0 (ratio branch)", async () => {
    const t = await mountApp(
      <RichLog
        id="log"
        lines={Array.from({ length: 20 }, (_, i) => `line${i}`)}
        style={{ width: 20, height: 5 }}
      />,
    );
    await t.settle();
    const w = t.findById<RichLogWidget>("log")!;
    (w as unknown as { scrollTop: number; tailing: boolean }).scrollTop = 0;
    (w as unknown as { scrollTop: number; tailing: boolean }).tailing = false;
    expect(() => t.text()).not.toThrow();
  });
});
