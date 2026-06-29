import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { App, startInspector } from "../core.ts";
import { Button, Label, render, VBox, View } from "../react.ts";
import { VTEDriver } from "../test/vte-runner.ts";
import { logger } from "../utils/logger.ts";

const PORT = 8765;
const BASE = `http://localhost:${PORT}`;

let app: App;
let server: { stop(): void };
let logDir: string;

beforeAll(async () => {
  // Point the logger at a private file before app.run(): the default `ztui.log`
  // is a single CWD file the logger singleton shares across every test worker,
  // and each `app.run()` truncates-then-rewrites it (`logger.init`). A reader
  // hitting `/log` could otherwise catch that file mid-truncate at 0 bytes —
  // the source of this test's historical flake. An isolated file can't race.
  logDir = mkdtempSync(join(tmpdir(), "ztui-inspector-"));
  logger.configure({ filePath: join(logDir, "ztui.log") });

  const driver = new VTEDriver(80, 24);
  app = new App(driver);
  render(
    <VBox>
      <Button id="ok">Click</Button>
      <Label>hello text</Label>
      <View id="panel" />
    </VBox>,
    app.activeScreen,
  );
  app.run(); // writes the session header to our isolated log file
  server = startInspector(app, PORT);
  await new Promise((r) => setTimeout(r, 50));
});

afterAll(() => {
  server.stop();
  app.stop();
  logger.reset(); // don't leak this test's file config onto later tests in the worker
  rmSync(logDir, { recursive: true, force: true });
});

describe("inspector endpoints", () => {
  test("GET / lists the new endpoints", async () => {
    const text = await (await fetch(`${BASE}/`)).text();
    expect(text).toContain("/state");
    expect(text).toContain("/log");
    expect(text).toContain("/dom");
  });

  test("GET /state returns an app snapshot", async () => {
    const state = await (await fetch(`${BASE}/state`)).json();
    expect(state.terminalSize).toEqual({ width: 80, height: 24 });
    expect(state.screenStackDepth).toBeGreaterThanOrEqual(1);
    expect(typeof state.activeTheme).toBe("string");
    expect(state.log).toHaveProperty("file");
    expect(state.log).toHaveProperty("level");
    expect(state.capabilities).toHaveProperty("graphicsProtocol");
  });

  test("GET /log returns log text and honors ?lines", async () => {
    const text = await (await fetch(`${BASE}/log?lines=5`)).text();
    expect(typeof text).toBe("string");
    // app.run() wrote a session header via logger.init
    expect(text.length).toBeGreaterThan(0);
  });

  test("GET /tree returns an indented ASCII view", async () => {
    const text = await (await fetch(`${BASE}/tree`)).text();
    expect(text).toContain("button#ok");
    expect(text).toContain('text("Click")');
    // children are indented under their parent
    expect(text).toMatch(/\n {2,}button#ok/);
  });

  test("GET /screenshot returns the on-screen text grid", async () => {
    const text = await (await fetch(`${BASE}/screenshot`)).text();
    // The Button label and the Label text should both appear in the paint.
    expect(text).toContain("Click");
    expect(text).toContain("hello text");
  });

  test("GET /dom includes text nodes, focusable, and visibility", async () => {
    const dump = await (await fetch(`${BASE}/dom`)).json();
    const json = JSON.stringify(dump);
    expect(json).toContain("hello text"); // text node content surfaced
    expect(json).toContain('"focusable":true'); // button is focusable
  });

  test("GET / lists the browser DevTools panel", async () => {
    const text = await (await fetch(`${BASE}/`)).text();
    expect(text).toContain("/devtools");
  });

  test("GET /devtools serves the browser panel HTML", async () => {
    const res = await fetch(`${BASE}/devtools`);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("ztui DevTools");
    expect(html).toContain("/render");
    expect(html).toContain("/dom");
    expect(html).toContain("/state");
  });
});
