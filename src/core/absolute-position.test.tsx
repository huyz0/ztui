import { describe, expect, test } from "vitest";
import { Box, VBox } from "../react.ts";
import { mountApp } from "../test/harness.tsx";

describe("App layout — absolute positioning", () => {
  test("a position:absolute child is placed relative to its parent's content rect, alongside normal-flow siblings", async () => {
    const { findById } = await mountApp(
      <VBox id="vbox" style={{ width: 40, height: 10, background: "black" }}>
        <Box id="standard-child" style={{ width: 10, height: 2, background: "red" }} />
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

    const vbox = findById<any>("vbox")!;
    const standardChild = findById<any>("standard-child")!;
    const absChild = findById<any>("abs-child")!;

    expect(standardChild.region.x).toBe(vbox.getContentRect().x);
    expect(standardChild.region.y).toBe(vbox.getContentRect().y);
    expect(standardChild.region.width).toBe(10);
    expect(standardChild.region.height).toBe(2);

    expect(absChild.region.x).toBe(vbox.getContentRect().x + 5);
    expect(absChild.region.y).toBe(vbox.getContentRect().y + 3);
    expect(absChild.region.width).toBe(15);
    expect(absChild.region.height).toBe(4);
  });

  test("right/bottom anchor an absolute child against the far edge of its parent's content rect", async () => {
    const { findById } = await mountApp(
      <VBox id="vbox" style={{ width: 40, height: 10, background: "black" }}>
        <Box
          id="abs-child"
          style={{
            position: "absolute",
            right: 2,
            bottom: 1,
            width: 10,
            height: 3,
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

    const vbox = findById<any>("vbox")!;
    const absChild = findById<any>("abs-child")!;
    const contentRect = vbox.getContentRect();

    expect(absChild.region.x).toBe(contentRect.right - 10 - 2);
    expect(absChild.region.y).toBe(contentRect.bottom - 3 - 1);
  });

  test("an unresolvable width/height/offset (e.g. an `fr` unit) falls back to the measured size / zero offset", async () => {
    const { findById } = await mountApp(
      <VBox id="vbox" style={{ width: 40, height: 10, background: "black" }}>
        <Box
          id="abs-child"
          style={{
            position: "absolute",
            // A bare "fr" (no leading digit) survives the CSS resolver's
            // left/right/top/bottom integer coercion (which would otherwise
            // truncate e.g. "1fr" down to the plain number 1) so it still
            // reaches `parseDimension` as the string "fr" here.
            left: "fr",
            top: "fr",
            right: "fr",
            bottom: "fr",
            width: "1fr",
            height: "1fr",
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

    const vbox = findById<any>("vbox")!;
    const absChild = findById<any>("abs-child")!;
    const contentRect = vbox.getContentRect();

    // `fr` isn't a resolvable absolute-position unit: width/height fall back to
    // the widget's own measured size, and left/top offsets fall back to 0 (so
    // x/y land exactly on the content rect's origin — `right`/`bottom` lose to
    // `left`/`top` when both are set).
    expect(absChild.region.width).toBe(absChild.measuredWidth);
    expect(absChild.region.height).toBe(absChild.measuredHeight);
    expect(absChild.region.x).toBe(contentRect.x);
    expect(absChild.region.y).toBe(contentRect.y);
  });

  test("an unresolvable `right`/`bottom` (no `left`/`top` set) falls back to a zero offset from the far edge", async () => {
    const { findById } = await mountApp(
      <VBox id="vbox" style={{ width: 40, height: 10, background: "black" }}>
        <Box
          id="abs-child"
          style={{
            position: "absolute",
            // A bare "fr" (no leading digit) survives the CSS resolver's
            // left/right/top/bottom integer coercion (`Number.parseInt` would
            // otherwise truncate e.g. "1fr" down to the plain number 1, taking
            // the *resolved* branch instead of the fallback this test targets).
            right: "fr",
            bottom: "fr",
            width: 5,
            height: 3,
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

    const vbox = findById<any>("vbox")!;
    const absChild = findById<any>("abs-child")!;
    const contentRect = vbox.getContentRect();

    // `right`/`bottom` are only consulted when `left`/`top` are absent. `fr` is
    // unresolvable here too, so the offset falls back to 0 — the child sits
    // flush against the far edge instead of inset by the (unresolvable) `fr`.
    expect(absChild.region.x).toBe(contentRect.right - 5);
    expect(absChild.region.y).toBe(contentRect.bottom - 3);
  });
});
