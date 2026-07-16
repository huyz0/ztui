import { describe, expect, test } from "vitest";
import { Footer, Header, VBox } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";

describe("Header / Footer", () => {
  test("getTextContent reflects children", async () => {
    const { findById } = await mountApp(
      <VBox>
        <Header id="hdr">Custom Title</Header>
        <Footer id="ftr">Custom Status</Footer>
      </VBox>,
      { cols: 80, rows: 24 },
    );

    const header = findById<any>("hdr")!;
    const footer = findById<any>("ftr")!;

    expect(header.getTextContent()).toBe("Custom Title");
    expect(footer.getTextContent()).toBe("Custom Status");
  });
});
