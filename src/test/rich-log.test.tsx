import { describe, expect, test } from "vitest";
import { RichLog, VBox } from "../react/components.tsx";
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
});
