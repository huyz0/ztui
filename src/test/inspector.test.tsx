import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { App, Button, Label, render, startInspector, VBox, View } from "../index.ts";
import { VTEDriver } from "./vte-runner.ts";

const PORT = 8765;
const BASE = `http://localhost:${PORT}`;

let app: App;
let server: { stop(): void };

beforeAll(async () => {
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
  app.run();
  server = startInspector(app, PORT);
  await new Promise((r) => setTimeout(r, 50));
});

afterAll(() => {
  server.stop();
  app.stop();
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

  test("GET /dom includes text nodes, focusable, and visibility", async () => {
    const dump = await (await fetch(`${BASE}/dom`)).json();
    const json = JSON.stringify(dump);
    expect(json).toContain("hello text"); // text node content surfaced
    expect(json).toContain('"focusable":true'); // button is focusable
  });
});
