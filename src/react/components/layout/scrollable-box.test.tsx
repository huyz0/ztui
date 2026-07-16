import { describe, expect, test } from "vitest";
import { Box, ScrollableBox } from "../../../react.ts";
import { mountApp } from "../../../test/harness.tsx";

describe("ScrollableBox", () => {
  test("renders and reflects id/style/children", async () => {
    const { app } = await mountApp(
      <ScrollableBox id="scroll-box-1" style={{ width: 10, height: 10 }}>
        <Box style={{ width: 20, height: 20 }} />
      </ScrollableBox>,
      {
        cols: 80,
        rows: 25,
        capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
      },
    );

    const scrollBox = app.activeScreen.children[0] as any;
    expect(scrollBox.tagName).toBe("scrollable-box");
    expect(scrollBox.id).toBe("scroll-box-1");
    expect(scrollBox.computedStyle.width).toBe(10);
    expect(scrollBox.computedStyle.height).toBe(10);
    expect(scrollBox.children.length).toBe(1);
    expect(scrollBox.children[0].tagName).toBe("box");
  });
});
