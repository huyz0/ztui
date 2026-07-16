import { describe, expect, test } from "vitest";
import { App } from "../core/app.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { TerminalView, VBox } from "../react/components.tsx";
import { reconciler } from "../react/reconciler.ts";
import type { TerminalViewWidget } from "../widgets/data/terminal-view.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 60,
  rows: 12,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

describe("TerminalView", () => {
  test("renders ANSI output as styled text without leaking escapes", async () => {
    const t = await mountApp(
      <VBox style={{ width: 40, height: 6 }}>
        <TerminalView id="tv" content={"\x1b[32mbuild ok\x1b[0m\nnext line"} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("build ok");
    expect(text).toContain("next line");
    expect(text).not.toContain("\x1b");
    expect(text).not.toContain("[32m");
  });

  test("streamed (appended) content is parsed incrementally", async () => {
    const t = await mountApp(
      <VBox style={{ width: 40, height: 6 }}>
        <TerminalView id="tv" content={"step 1\n"} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<TerminalViewWidget>("tv") as TerminalViewWidget;
    expect(t.text()).toContain("step 1");

    reconciler.updateContainer(
      <VBox style={{ width: 40, height: 6 }}>
        <TerminalView id="tv" content={"step 1\nstep 2\n"} />
      </VBox>,
      t.container,
      null,
      () => {},
    );
    await t.settle();
    expect(t.text()).toContain("step 1");
    expect(t.text()).toContain("step 2");
    // Only the appended slice was fed; the line count reflects two lines + tail.
    expect(w.content).toBe("step 1\nstep 2\n");
  });

  test("a \\r progress redraw overwrites the same line", async () => {
    const t = await mountApp(
      <VBox style={{ width: 40, height: 4 }}>
        <TerminalView id="tv" content={"loading 10%\rloading 99%"} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("loading 99%");
    expect(t.text()).not.toContain("loading 10%");
  });

  test("scrolls and tails a long stream", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `row ${i}`).join("\n");
    const t = await mountApp(
      <VBox style={{ width: 40, height: 6 }}>
        <TerminalView id="tv" content={lines} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<TerminalViewWidget>("tv") as TerminalViewWidget;
    // Tails to the bottom by default.
    expect(t.text()).toContain("row 39");
    expect(t.text()).not.toContain("row 0");

    w.handleKey({ name: "home", handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("row 0");
  });

  test("wheel scroll, scrollbar drag, write(), clear() and selectableLines", async () => {
    const t = await mountApp(
      <VBox style={{ width: 40, height: 6 }}>
        <TerminalView id="tv" content={""} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<TerminalViewWidget>("tv") as TerminalViewWidget;

    // Imperative streaming writer.
    w.write(Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n"));
    await t.settle();
    expect(t.text()).toContain("line 39"); // tails

    // Wheel up stops tailing and reveals earlier lines.
    const c = w.getContentRect();
    w.handleScroll({ type: "scroll_up", x: c.x, y: c.y, handled: false } as never);
    await t.settle();
    w.handleKey({ name: "pageup", handled: false } as never);
    await t.settle();

    // Drag the scrollbar thumb to the top.
    w.handleMouse({
      type: "press",
      button: "left",
      x: c.right - 1,
      y: c.y,
      handled: false,
    } as never);
    w.handleMouse({
      type: "drag",
      button: "left",
      x: c.right - 1,
      y: c.y,
      handled: false,
    } as never);
    w.handleMouse({
      type: "release",
      button: "left",
      x: c.right - 1,
      y: c.y,
      handled: false,
    } as never);
    await t.settle();
    expect(t.text()).toContain("line 0");

    expect(w.selectableLines().length).toBeGreaterThanOrEqual(40);

    w.clear();
    await t.settle();
    expect(w.content).toBe("");
    expect(t.text()).not.toContain("line 0");
  });

  test("a non-extending content change reparses from scratch", async () => {
    const t = await mountApp(
      <VBox style={{ width: 40, height: 6 }}>
        <TerminalView id="tv" content={"original output"} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("original output");

    reconciler.updateContainer(
      <VBox style={{ width: 40, height: 6 }}>
        <TerminalView id="tv" content={"totally different"} />
      </VBox>,
      t.container,
      null,
      () => {},
    );
    await t.settle();
    expect(t.text()).toContain("totally different");
    expect(t.text()).not.toContain("original output");
  });

  test("wrap=false leaves long lines unwrapped (clipped)", async () => {
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <TerminalView id="tv" content={""} wrap={false} />
      </VBox>,
      OPTS,
    );
    await t.settle(); // first render applies cols=0 (no-wrap) for wrap=false
    const w = t.findById<TerminalViewWidget>("tv") as TerminalViewWidget;
    w.write("x".repeat(200));
    await t.settle();
    // No wrapping → a single logical line in the grid.
    expect(w.selectableLines()).toHaveLength(1);
  });

  test("write()/clear() fall back to App.instance when the widget isn't attached", async () => {
    const t = await mountApp(
      <VBox style={{ width: 40, height: 6 }}>
        <TerminalView id="tv" content="" />
      </VBox>,
      OPTS,
    );
    await t.settle();
    // A freestanding widget (never mounted) has `this.app === null`, so
    // `(this.app ?? App.instance)?.queueRender()` must use the App.instance
    // singleton instead of throwing.
    const { TerminalViewWidget } = await import("../widgets/data/terminal-view.ts");
    const orphan = new TerminalViewWidget();
    expect(() => orphan.write("hi")).not.toThrow();
    expect(() => {
      orphan.content = "reset then";
    }).not.toThrow();
    expect(() => orphan.clear()).not.toThrow();
    expect(App.instance).not.toBeNull();

    // Same fallback inside handleScroll/handleKey/scrollToTrackY: each ends in
    // `(this.app ?? App.instance)?.queueRender()`, reached only when the
    // scroll/key actually produces a new position (`next !== null`).
    orphan.write(Array.from({ length: 10 }, (_, i) => `l${i}`).join("\n"));
    expect(() =>
      orphan.handleScroll({ type: "scroll_down", handled: false } as never),
    ).not.toThrow();
    expect(() => orphan.handleKey({ name: "down", handled: false } as never)).not.toThrow();
    (orphan as unknown as { lastVisibleRows: number }).lastVisibleRows = 3;
    expect(() =>
      (orphan as unknown as { scrollToTrackY: (y: number) => void }).scrollToTrackY(2),
    ).not.toThrow();

    // And in the render loop's per-line selection.addRun(), reached when the
    // widget is selectable and has a non-empty content rect.
    orphan.getContentRect = () => new Region(new Offset(0, 0), new Size(10, 5));
    expect(() => orphan.render(t.buffer)).not.toThrow();
  });

  test("handleScroll/handleKey/handleMouse respect already-handled events and unrecognized input", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `row ${i}`).join("\n");
    const t = await mountApp(
      <VBox style={{ width: 40, height: 6 }}>
        <TerminalView id="tv" content={lines} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<TerminalViewWidget>("tv") as TerminalViewWidget;
    const before = t.text();

    const scrollEv = { type: "scroll_down", handled: true } as never;
    w.handleScroll(scrollEv);
    expect((scrollEv as any).handled).toBe(true);

    const keyEv = { name: "down", handled: true } as never;
    w.handleKey(keyEv);
    expect((keyEv as any).handled).toBe(true);

    const mouseEv = { type: "press", button: "left", handled: true } as never;
    w.handleMouse(mouseEv);
    expect((mouseEv as any).handled).toBe(true);

    // An unrecognized scroll type is not a wheel scroll: no-op.
    w.handleScroll({ type: "wheel_horizontal", handled: false } as never);
    // A key with no name falls back to `ev.key`; an unrecognized one no-ops.
    w.handleKey({ key: "z", handled: false } as never);
    // A non-press / non-left-button mouse event skips the scrollbar-drag logic.
    w.handleMouse({ type: "move", x: 0, y: 0, handled: false } as never);
    await t.settle();
    expect(t.text()).toBe(before);
  });

  test("clicking inside the content (not the scrollbar column) falls through to text selection", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `row ${i}`).join("\n");
    const t = await mountApp(
      <VBox style={{ width: 40, height: 6 }}>
        <TerminalView id="tv" content={lines} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<TerminalViewWidget>("tv") as TerminalViewWidget;
    const c = w.getContentRect();
    expect(() =>
      w.handleMouse({
        type: "press",
        button: "left",
        x: c.x,
        y: c.y,
        handled: false,
      } as never),
    ).not.toThrow();
  });

  test("dragging the scrollbar thumb on a single-row track is a no-op (trackH <= 1)", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `row ${i}`).join("\n");
    const t = await mountApp(
      <VBox style={{ width: 40, height: 1 }}>
        <TerminalView id="tv" content={lines} style={{ height: 1 }} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<TerminalViewWidget>("tv") as TerminalViewWidget;
    const c = w.getContentRect();
    w.handleMouse({
      type: "press",
      button: "left",
      x: c.right - 1,
      y: c.y,
      handled: false,
    } as never);
    await t.settle();
    // trackYToScrollTop returned null (trackH === 1): stayed tailed at the bottom.
    expect(t.text()).toContain("row 39");
  });

  test("render is a no-op when invisible or when the content area is empty", async () => {
    const t = await mountApp(
      <VBox style={{ width: 40, height: 6 }}>
        <TerminalView id="tv" content={"hello"} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<TerminalViewWidget>("tv") as TerminalViewWidget;

    w.visible = false;
    expect(() => w.render(t.buffer)).not.toThrow();

    w.visible = true;
    const origGetContentRect = w.getContentRect.bind(w);
    w.getContentRect = () => ({ ...origGetContentRect(), width: 0, height: 0 }) as never;
    expect(() => w.render(t.buffer)).not.toThrow();
  });

  test("long unwrapped lines clip at the viewport edge and background-colored cells keep their color", async () => {
    // Alternating colors per character forces cellsToSegments to emit many
    // single-char segments (same-style runs merge otherwise), so the render
    // loop's `x >= content.x + bodyW` break actually gets exercised mid-line
    // instead of only ever seeing one giant segment.
    const rainbow = Array.from({ length: 60 }, (_, i) => `\x1b[${31 + (i % 6)}m${i % 10}`).join("");
    const t = await mountApp(
      <VBox style={{ width: 20, height: 4 }}>
        <TerminalView id="tv" content={`\x1b[42mBG\x1b[0m${rainbow}`} wrap={false} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<TerminalViewWidget>("tv") as TerminalViewWidget;
    // Force a narrow content rect (the test harness floors the screen at
    // 80x24, so styled widths alone don't shrink it) so the line's ~60
    // one-char segments overrun it and render() must break out of the loop.
    w.getContentRect = () => new Region(new Offset(0, 0), new Size(10, 4));
    expect(() => w.render(t.buffer)).not.toThrow();
  });

  test("selectable=false skips registering the line for text selection", async () => {
    const t = await mountApp(
      <VBox style={{ width: 40, height: 6 }}>
        <TerminalView id="tv" content={"one line of output"} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<TerminalViewWidget>("tv") as TerminalViewWidget;
    w.selectable = false;
    await t.settle();
    expect(() => w.render(t.buffer)).not.toThrow();
    expect(t.text()).toContain("one line of output");
  });
});
