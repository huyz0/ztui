import { describe, expect, test } from "vitest";
import { Traceback, VBox } from "../react/components.tsx";
import type { TracebackWidget } from "../widgets/data/traceback.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 80,
  rows: 20,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

const STACK = [
  "TypeError: cannot read property 'x' of undefined",
  "    at parseConfig (/proj/src/config.ts:42:17)",
  "    at load (/proj/src/app.ts:8:3)",
  "    at Object.<anonymous> (/proj/node_modules/runner/index.js:120:5)",
].join("\n");

describe("Traceback", () => {
  test("renders the error header and parsed frames", async () => {
    const t = await mountApp(
      <VBox style={{ width: 78, height: 14 }}>
        <Traceback
          id="tb"
          name="TypeError"
          message="cannot read property 'x' of undefined"
          stack={STACK}
          showSource={false}
        />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("TypeError: cannot read property 'x' of undefined");
    expect(text).toContain("parseConfig");
    expect(text).toContain("/proj/src/config.ts:42:17");
    expect(text).toContain("/proj/src/app.ts:8:3");
  });

  test("the error setter pulls name/message/stack off an Error object", async () => {
    const err = new RangeError("out of bounds");
    const t = await mountApp(
      <VBox style={{ width: 78, height: 10 }}>
        <Traceback id="tb" error={err} showSource={false} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<TracebackWidget>("tb") as TracebackWidget;
    expect(w.name).toBe("RangeError");
    expect(w.message).toBe("out of bounds");
    expect(t.text()).toContain("RangeError: out of bounds");
  });

  test("shows syntax-highlighted source + a caret for the top in-app frame", async () => {
    // Point the top frame at this very test file so the source read succeeds.
    const here = import.meta.url.replace(/^file:\/\//, "");
    const stack = [
      "Error: boom",
      `    at someFn (${here}:1:5)`,
      "    at node:internal/main:1:1",
    ].join("\n");
    const t = await mountApp(
      <VBox style={{ width: 78, height: 16 }}>
        <Traceback id="tb" error={Object.assign(new Error("boom"), { stack })} contextLines={1} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    // Line 1 of this file is the vitest import; the source peek should show it,
    // with the ❯ marker on the failing line and a caret beneath.
    expect(text).toContain("❯");
    expect(text).toContain("^");
    expect(text).toContain("vitest");
  });

  test("an ESM file:// stack frame is not misclassified as a library frame", async () => {
    // Regression: parseStack's `library` check tested the *raw* capture
    // (still carrying its "file://" scheme) against `^\w+:\/\//`, which
    // matches "file://" itself -- so every frame in an ESM/Bun stack trace
    // (commonly rendered as "at foo (file:///path/to/app.ts:12:5)") was
    // misclassified as a library frame, and the "expand topmost in-app frame
    // with syntax-highlighted source" feature never fired for any of them.
    const here = import.meta.url; // still has its literal "file://" prefix
    const stack = ["Error: boom", `    at someFn (${here}:1:5)`].join("\n");
    const t = await mountApp(
      <VBox style={{ width: 78, height: 16 }}>
        <Traceback id="tb" error={Object.assign(new Error("boom"), { stack })} contextLines={1} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("❯");
    expect(text).toContain("^");
  });

  test("scrolls when the trace overflows the viewport", async () => {
    const frames = Array.from(
      { length: 30 },
      (_, i) => `    at frame${i} (/proj/src/f${i}.ts:${i + 1}:1)`,
    );
    const stack = ["Error: deep", ...frames].join("\n");
    const t = await mountApp(
      <VBox style={{ width: 78 }}>
        <Traceback
          id="tb"
          style={{ height: 8 }}
          error={Object.assign(new Error("deep"), { stack })}
          showSource={false}
        />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<TracebackWidget>("tb") as TracebackWidget;
    expect(t.text()).toContain("frame0");

    w.handleKey({ name: "end", handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("frame29");
    expect(t.text()).not.toContain("frame0");
  });

  /** Mount a Traceback whose trace overflows an 8-row viewport. */
  async function deepTrace() {
    const frames = Array.from(
      { length: 30 },
      (_, i) => `    at frame${i} (/proj/src/f${i}.ts:${i + 1}:1)`,
    );
    const stack = ["Error: deep", ...frames].join("\n");
    const t = await mountApp(
      <VBox style={{ width: 78 }}>
        <Traceback
          id="tb"
          style={{ height: 8 }}
          error={Object.assign(new Error("deep"), { stack })}
          showSource={false}
        />
      </VBox>,
      OPTS,
    );
    await t.settle();
    return { t, w: t.findById<TracebackWidget>("tb") as TracebackWidget };
  }

  test("keyboard scrolling: down, pagedown, pageup, home (and ignores unknown keys)", async () => {
    const { t, w } = await deepTrace();
    expect(t.text()).toContain("frame0");

    w.handleKey({ name: "down", handled: false } as never);
    await t.settle();

    w.handleKey({ name: "pagedown", handled: false } as never);
    await t.settle();
    expect(t.text()).not.toContain("frame0"); // paged past the top

    w.handleKey({ name: "pageup", handled: false } as never);
    w.handleKey({ name: "home", handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("frame0"); // home returns to the top

    const ev = { name: "x", handled: false } as never;
    w.handleKey(ev);
    expect((ev as { handled: boolean }).handled).toBe(false); // unknown key left unhandled
  });

  test("wheel + up/end keys move the scroll position", async () => {
    const { t, w } = await deepTrace();
    expect(t.text()).toContain("frame0");

    for (let i = 0; i < 6; i++) w.handleScroll({ type: "scroll_down", handled: false } as never);
    await t.settle();
    expect(t.text()).not.toContain("frame0"); // wheel scrolled the top off

    for (let i = 0; i < 10; i++) w.handleScroll({ type: "scroll_up", handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("frame0"); // wheeled back to the top

    w.handleKey({ name: "end", handled: false } as never);
    await t.settle();
    expect(t.text()).not.toContain("frame0"); // jumped toward the bottom
    w.handleKey({ name: "up", handled: false } as never); // exercises the "up" branch
    await t.settle();
    expect(t.text()).not.toContain("frame0");
  });

  test("source peek is skipped when the file is unreadable or the line is out of range", async () => {
    // Top app frame points at a path that cannot be read -> no source rows, no crash.
    const missing = ["Error: nope", "    at fn (/no/such/file-xyz.ts:5:1)"].join("\n");
    const t = await mountApp(
      <VBox style={{ width: 78, height: 12 }}>
        <Traceback id="tb" error={Object.assign(new Error("nope"), { stack: missing })} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("Error: nope");
    expect(text).not.toContain("❯"); // no source marker since the read failed

    // A real file but a wildly out-of-range line also yields no source rows.
    const here = import.meta.url.replace(/^file:\/\//, "");
    const oob = ["Error: oob", `    at outOfRangeFn (${here}:99999:1)`].join("\n");
    const w = t.findById<TracebackWidget>("tb") as TracebackWidget;
    w.stack = oob;
    const lines = w.selectableLines();
    expect(lines.some((l) => l.includes("outOfRangeFn"))).toBe(true);
    expect(lines.some((l) => l.includes("❯"))).toBe(false); // line out of range -> no source peek
  });

  test("dragging the scrollbar scrolls the trace", async () => {
    const { t, w } = await deepTrace();
    const c = w.getContentRect();

    // Press on the scrollbar column, drag to the bottom, then release.
    w.handleMouse({ type: "press", button: "left", x: c.right - 1, y: c.y, handled: false });
    w.handleMouse({ type: "drag", x: c.right - 1, y: c.bottom - 1, handled: false });
    await t.settle();
    expect(t.text()).toContain("frame29"); // dragged to the bottom

    w.handleMouse({ type: "release", x: c.right - 1, y: c.bottom - 1, handled: false });
    w.handleKey({ name: "home", handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("frame0");
  });
});
