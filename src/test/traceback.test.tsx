import { describe, expect, test } from "vitest";
import { App } from "../core/app.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Traceback, VBox } from "../react/components.tsx";
import { TracebackWidget } from "../widgets/data/traceback.ts";
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

  test("the error setter clears name/message/stack when given undefined", () => {
    const w = new TracebackWidget();
    w.error = new RangeError("boom");
    expect(w.name).toBe("RangeError");
    w.error = undefined;
    expect(w.name).toBe("Error");
    expect(w.message).toBe("");
    expect(w.stack).toBe("");
  });

  test("handleScroll/handleKey/scrollToTrackY fall back to App.instance when unattached", async () => {
    const t = await mountApp(
      <VBox style={{ width: 78, height: 8 }}>
        <Traceback id="tb" name="Error" message="anchor" showSource={false} />
      </VBox>,
      OPTS,
    );
    await t.settle();

    const orphan = new TracebackWidget();
    orphan.name = "Error";
    orphan.stack = Array.from(
      { length: 10 },
      (_, i) => `    at frame${i} (/proj/f${i}.ts:${i + 1}:1)`,
    ).join("\n");
    orphan.showSource = false;
    // Populate `display` first (scrollToTrackY doesn't rebuild()) so its max
    // scroll is > 0 and the position actually changes.
    orphan.selectableLines();

    // this.app is null (never mounted); App.instance is set from the mountApp
    // above, so every `(this.app ?? App.instance)?...` fallback in these
    // methods must use it instead of throwing.
    expect(() =>
      orphan.handleScroll({ type: "scroll_down", handled: false } as never),
    ).not.toThrow();
    expect(() => orphan.handleKey({ name: "down", handled: false } as never)).not.toThrow();
    (orphan as unknown as { lastVisibleRows: number }).lastVisibleRows = 3;
    expect(() =>
      (orphan as unknown as { scrollToTrackY: (y: number) => void }).scrollToTrackY(2),
    ).not.toThrow();
  });

  test("render() without a live App/resolver leaves $-token colors unresolved instead of throwing", async () => {
    const t = await mountApp(
      <VBox style={{ width: 78, height: 8 }}>
        <Traceback id="tb" name="Error" message="anchor" showSource={false} />
      </VBox>,
      OPTS,
    );
    await t.settle();

    // A widget that's never attached: `this.app` is null, and with no live
    // App.instance either, `resolver()` returns undefined, so `resolve()`'s
    // `c?.startsWith("$") && resolver` must short-circuit false even for a
    // "$"-prefixed color (exercising the branch where the left side is true
    // but `resolver` itself is falsy).
    const orphan = new TracebackWidget();
    orphan.name = "Error";
    orphan.message = "boom";
    orphan.stack = "Error: boom\n    at fn (/proj/a.ts:1:1)";
    orphan.showSource = false;
    orphan.getContentRect = () => new Region(new Offset(0, 0), new Size(60, 8));

    const savedInstance = App.instance;
    App.instance = null;
    try {
      expect(() => orphan.render(t.buffer)).not.toThrow();
    } finally {
      App.instance = savedInstance;
    }
  });

  test("render() falls back to the raw token when resolveVariable can't resolve it", async () => {
    const { findById, buffer } = await mountApp(
      <VBox style={{ width: 78, height: 8 }}>
        <Traceback id="tb" name="Error" message="anchor" showSource={false} />
      </VBox>,
      OPTS,
    );
    const w = findById<TracebackWidget>("tb") as TracebackWidget;

    // Force resolveVariable to fail resolution (as it would for an unknown
    // token), so `resolver.resolveVariable(this, c) || c` falls back to `c`.
    const resolver = App.instance?.cssResolver;
    const original = resolver?.resolveVariable.bind(resolver);
    if (resolver) resolver.resolveVariable = () => "";
    try {
      expect(() => w.render(buffer)).not.toThrow();
    } finally {
      if (resolver && original) resolver.resolveVariable = original;
    }
  });

  test("a header with no message shows just the error name", async () => {
    const t = await mountApp(
      <VBox style={{ width: 78, height: 8 }}>
        <Traceback id="tb" name="Error" message="" stack="Error" showSource={false} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("Error");
  });

  test("an unrecognized extension falls back to plain-text highlighting", async () => {
    // Point the top frame at a real, readable file whose extension isn't in
    // EXT_LANG (unlike .ts/.tsx/.js/...), so both the ext-lookup `?? "text"`
    // fallback and the language fallback actually run.
    const here = import.meta.url
      .replace(/^file:\/\//, "")
      .replace(/\.tsx$/, ".test-data.unknownext");
    const fs = await import("node:fs");
    fs.copyFileSync(import.meta.url.replace(/^file:\/\//, ""), here);
    try {
      const stack = ["Error: boom", `    at someFn (${here}:1:5)`].join("\n");
      const t = await mountApp(
        <VBox style={{ width: 78, height: 16 }}>
          <Traceback id="tb" error={Object.assign(new Error("boom"), { stack })} contextLines={1} />
        </VBox>,
        OPTS,
      );
      await t.settle();
      const text = t.text();
      // Source was read successfully (unrecognized-extension path, not the
      // unreadable-file path), so the caret/marker for the failing line show.
      expect(text).toContain("❯");
      expect(text).toContain("^");
    } finally {
      fs.rmSync(here, { force: true });
    }
  });

  test("measure() computes an intrinsic width/height from the built display rows", () => {
    // Unattached and never laid out: computedStyle falls back to the empty
    // author-set `style`, so parseDimension returns its -1 sentinel for both
    // width and height, exercising the "compute from display rows" branches
    // (including both the `rw > w` true and false paths across rows).
    const w = new TracebackWidget();
    w.name = "Error";
    w.message = "boom";
    w.stack = [
      "Error: boom",
      "    at shortFn (/proj/a.ts:1:1)",
      "    at aVeryLongFunctionName (/proj/b.ts:2:2)",
    ].join("\n");
    w.showSource = false;
    w.measure(200, 50);
    expect(w.measuredWidth).toBeGreaterThan(0);
    expect(w.measuredHeight).toBeGreaterThan(0);
  });

  test("measure() with an explicit 'fr' width/height also falls back to the intrinsic size", async () => {
    const { findById } = await mountApp(
      <VBox>
        <Traceback
          id="tb"
          name="Error"
          message="boom"
          stack={"Error: boom\n    at fn (/proj/a.ts:1:1)"}
          showSource={false}
          style={{ width: "1fr", height: "1fr" }}
        />
      </VBox>,
      { cols: 40, rows: 10 },
    );
    const w = findById<TracebackWidget>("tb") as TracebackWidget;
    expect(w.measuredWidth).toBeGreaterThan(0);
    expect(w.measuredHeight).toBeGreaterThan(0);
  });

  test("handleScroll/handleKey/handleMouse respect already-handled events and unrecognized scroll types", async () => {
    const { t, w } = await deepTrace();
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

    // Unrecognized scroll type: wheelScrollTop returns null, no-op.
    w.handleScroll({ type: "wheel_horizontal", handled: false } as never);
    // Key with no name, falling back to ev.key.
    w.handleKey({ key: "down", handled: false } as never);
    await t.settle();
    // Non-press/left mouse event: falls straight through, no scrollbar-drag start.
    w.handleMouse({ type: "move", x: 0, y: 0, handled: false } as never);
    // Click inside the content but not on the scrollbar column: no drag starts.
    const c = w.getContentRect();
    w.handleMouse({ type: "press", button: "left", x: c.x, y: c.y, handled: false } as never);
    await t.settle();
    expect(t.text()).not.toBe(before); // the ev.key-fallback "down" did scroll by one row
  });

  test("dragging the scrollbar thumb on a single-row track is a no-op (trackH <= 1)", async () => {
    const { t, w } = await deepTrace();
    // Force a single-row content rect directly (the test harness floors the
    // screen at 80x24, so a small `style.height` alone won't shrink it).
    w.getContentRect = () => new Region(new Offset(0, 0), new Size(78, 1));
    (w as unknown as { lastVisibleRows: number }).lastVisibleRows = 1;
    expect(() =>
      (w as unknown as { scrollToTrackY: (y: number) => void }).scrollToTrackY(0),
    ).not.toThrow();
    expect(w.selectableLines()[0]).toContain("Error: deep");
    void t;
  });

  test("render is a no-op when invisible or the content area is empty", async () => {
    const { t, w } = await deepTrace();
    w.visible = false;
    expect(() => w.render(t.buffer)).not.toThrow();

    w.visible = true;
    w.getContentRect = () => new Region(new Offset(0, 0), new Size(0, 0));
    expect(() => w.render(t.buffer)).not.toThrow();
  });

  test("long lines clip at the viewport edge instead of overrunning it", async () => {
    const longFrames = Array.from(
      { length: 5 },
      (_, i) =>
        `    at ${"x".repeat(20)}frame${i} (/proj/src/${"y".repeat(20)}f${i}.ts:${i + 1}:1)`,
    );
    const stack = ["Error: wide", ...longFrames].join("\n");
    const t = await mountApp(
      <VBox style={{ width: 78, height: 8 }}>
        <Traceback id="tb" error={Object.assign(new Error("wide"), { stack })} showSource={false} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<TracebackWidget>("tb") as TracebackWidget;
    // Force a narrower content rect than the segments' combined width so the
    // render loop's `x >= content.x + bodyW` break actually gets exercised.
    w.getContentRect = () => new Region(new Offset(0, 0), new Size(10, 8));
    expect(() => w.render(t.buffer)).not.toThrow();
  });
});
