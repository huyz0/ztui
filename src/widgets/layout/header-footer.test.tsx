import { describe, expect, test } from "vitest";
import { Footer, Header, VBox } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";

describe("Header / Footer", () => {
  test("getTextContent reflects children", async () => {
    const { screen } = await mountApp(
      <VBox>
        <Header>Custom Title</Header>
        <Footer>Custom Status</Footer>
      </VBox>,
      { cols: 80, rows: 24 },
    );

    const header = screen.children[0].children[0] as any;
    const footer = screen.children[0].children[1] as any;

    expect(header.getTextContent()).toBe("Custom Title");
    expect(footer.getTextContent()).toBe("Custom Status");
  });
});
