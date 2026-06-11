import { describe, expect, test } from "vitest";
import { Traceback, VBox } from "../react/components.tsx";
import type { TracebackWidget } from "../widgets/data/traceback.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 80,
  rows: 20,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
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
});
