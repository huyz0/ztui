import { describe, expect, test } from "vitest";
import { App } from "../core/app.ts";
import { MockDriver } from "../driver/mock/index.ts";
import { Box, Button, Input, ListView, VBox } from "../react/components.tsx";
import "../widgets/index.ts";
import { flush, mountApp } from "./harness.tsx";

const SET = (shape: string) => `\x1b]22;${shape}\x1b\\`;
const RESET = "\x1b]22;\x1b\\";

/**
 * Drives the App's hover pipeline and asserts the OSC 22 pointer-shape sequences
 * it pushes to the driver as the pointer crosses widget boundaries. The VTE test
 * driver advertises `pointerShapes`, so the feature is live.
 *
 * Hover moves are throttled to ~15 Hz, so each move is spaced past the 66ms
 * window to land on the immediate (non-deferred) path before asserting.
 */
describe("pointer-shape on hover (OSC 22)", () => {
  test("sets the hovered widget's shape and resets on an empty region", async () => {
    const t = await mountApp(
      <VBox style={{ width: 80, height: 24 }}>
        <Box id="link" style={{ cursor: "pointer", width: 20, height: 3 }} />
        <Box id="field" style={{ cursor: "text", width: 20, height: 3 }} />
      </VBox>,
    );
    await t.settle();

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(2, 1, "move", "none"); // over #link
    expect(t.driver.writtenData).toContain(SET("pointer"));

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(2, 4, "move", "none"); // over #field
    expect(t.driver.writtenData).toContain(SET("text"));

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(2, 20, "move", "none"); // empty area below both boxes
    expect(t.driver.writtenData).toContain(RESET);
  });

  test("inherits the shape from the nearest ancestor that sets cursor", async () => {
    const t = await mountApp(
      <Box id="outer" style={{ cursor: "grab", width: 20, height: 6 }}>
        <Box id="inner" style={{ width: 8, height: 2 }} />
      </Box>,
    );
    await t.settle();

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(2, 1, "move", "none"); // over #inner (no cursor of its own)
    expect(t.driver.writtenData).toContain(SET("grab"));
  });

  test("coalesces a redundant shape across moves within the same widget", async () => {
    const t = await mountApp(<Box id="link" style={{ cursor: "pointer", width: 20, height: 4 }} />);
    await t.settle();

    await flush(80);
    t.driver.simulateMouse(2, 1, "move", "none"); // first entry -> emits pointer
    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(5, 2, "move", "none"); // still inside -> no re-emit
    expect(t.driver.writtenData).not.toContain(SET("pointer"));
  });

  test("interactive widgets carry a role-based default shape", async () => {
    const t = await mountApp(
      <VBox style={{ width: 80, height: 24 }}>
        <Button id="btn">Go</Button>
        <Input id="name" />
      </VBox>,
    );
    await t.settle();

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(1, 0, "move", "none"); // over the button
    expect(t.driver.writtenData).toContain(SET("pointer"));

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(1, 2, "move", "none"); // over the input (3 rows tall)
    expect(t.driver.writtenData).toContain(SET("text"));
  });

  test("a clickable Box (onClick) defaults to the pointer shape", async () => {
    const t = await mountApp(
      <Box id="click" onClick={() => {}} style={{ width: 20, height: 3 }} />,
    );
    await t.settle();

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(2, 1, "move", "none");
    expect(t.driver.writtenData).toContain(SET("pointer"));
  });

  test("a disabled interactive widget shows not-allowed", async () => {
    const t = await mountApp(
      <Button id="btn" disabled>
        Go
      </Button>,
    );
    await t.settle();

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(1, 0, "move", "none");
    expect(t.driver.writtenData).toContain(SET("not-allowed"));
  });

  test("an explicit cursor style overrides the role default", async () => {
    const t = await mountApp(
      <Button id="btn" style={{ cursor: "wait" }}>
        Go
      </Button>,
    );
    await t.settle();

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(1, 0, "move", "none");
    expect(t.driver.writtenData).toContain(SET("wait"));
  });

  test("a list shows pointer over rows but the default arrow over its scrollbar", async () => {
    // 30 rows in a 6-tall viewport forces a scrollbar in the rightmost column.
    const items = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, label: `row ${i}` }));
    const t = await mountApp(
      <VBox style={{ width: 80, height: 24 }}>
        <ListView id="list" items={items} style={{ width: 20, height: 6 }} />
      </VBox>,
    );
    await t.settle();

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(2, 2, "move", "none"); // over a row
    expect(t.driver.writtenData).toContain(SET("pointer"));

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(19, 2, "move", "none"); // rightmost column = scrollbar gutter
    expect(t.driver.writtenData).toContain(RESET);
    expect(t.driver.writtenData).not.toContain(SET("pointer"));
  });

  test("the app-level pointerShapes setting defaults on and gates emission when off", async () => {
    const t = await mountApp(
      <VBox style={{ width: 80, height: 24 }}>
        <Box id="link" style={{ cursor: "pointer", width: 20, height: 4 }} />
      </VBox>,
    );
    await t.settle();
    expect(t.app.pointerShapes).toBe(true);

    // Turning it off resets the pointer and suppresses further shapes.
    t.driver.writtenData = "";
    t.app.pointerShapes = false;
    expect(t.driver.writtenData).toContain(RESET);

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(2, 1, "move", "none"); // over #link, but gated off
    expect(t.driver.writtenData).not.toContain("\x1b]22;");

    // Turning it back on resumes emission on the next boundary crossing.
    t.app.pointerShapes = true;
    await flush(80);
    t.driver.simulateMouse(2, 20, "move", "none"); // off #link -> empty
    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(2, 1, "move", "none"); // back over #link
    expect(t.driver.writtenData).toContain(SET("pointer"));
  });

  test("the constructor option overrides the default-on setting", () => {
    expect(new App(new MockDriver()).pointerShapes).toBe(true);
    expect(new App(new MockDriver(), { pointerShapes: false }).pointerShapes).toBe(false);
  });

  test("emits nothing when the terminal lacks pointer-shape support", async () => {
    const t = await mountApp(
      <Box id="link" style={{ cursor: "pointer", width: 20, height: 4 }} />,
      { capabilities: { pointerShapes: false } },
    );
    await t.settle();

    await flush(80);
    t.driver.writtenData = "";
    t.driver.simulateMouse(2, 1, "move", "none");
    expect(t.driver.writtenData).not.toContain("\x1b]22;");
  });
});
