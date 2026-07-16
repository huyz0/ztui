import { describe, expect, test } from "vitest";
import { Box, VBox } from "../react.ts";
import { mountApp } from "../test/harness.tsx";

describe("App layout — absolute positioning", () => {
  test("a position:absolute child is placed relative to its parent's content rect, alongside normal-flow siblings", async () => {
    const { app } = await mountApp(
      <VBox style={{ width: 40, height: 10, background: "black" }}>
        <Box style={{ width: 10, height: 2, background: "red" }} />
        <Box
          id="abs-child"
          style={{
            position: "absolute",
            left: 5,
            top: 3,
            width: 15,
            height: 4,
            background: "blue",
          }}
        />
      </VBox>,
      {
        cols: 80,
        rows: 25,
        capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
      },
    );

    const vbox = app.activeScreen.children[0] as any;
    const standardChild = vbox.children[0] as any;
    const absChild = vbox.children[1] as any;

    expect(standardChild.region.x).toBe(vbox.getContentRect().x);
    expect(standardChild.region.y).toBe(vbox.getContentRect().y);
    expect(standardChild.region.width).toBe(10);
    expect(standardChild.region.height).toBe(2);

    expect(absChild.region.x).toBe(vbox.getContentRect().x + 5);
    expect(absChild.region.y).toBe(vbox.getContentRect().y + 3);
    expect(absChild.region.width).toBe(15);
    expect(absChild.region.height).toBe(4);
  });
});
