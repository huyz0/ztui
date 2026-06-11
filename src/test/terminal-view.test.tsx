import { describe, expect, test } from "vitest";
import { TerminalView, VBox } from "../react/components.tsx";
import { reconciler } from "../react/reconciler.ts";
import type { TerminalViewWidget } from "../widgets/data/terminal-view.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 60,
  rows: 12,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
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
});
