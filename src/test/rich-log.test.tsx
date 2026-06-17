import { describe, expect, test } from "vitest";
import { Box, RichLog, VBox } from "../react/components.tsx";
import { reconciler } from "../react/reconciler.ts";
import type { RichLogWidget } from "../widgets/data/rich-log.ts";
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
});
