import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { HBox, Label, VBox } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

describe("BoxLayout shrink", () => {
  test("shrinks overflowing auto-sized siblings that opt into flexShrink, instead of silently clipping", async () => {
    const t = await mountApp(
      <HBox style={{ width: "100%" }}>
        <HBox id="left" style={{ width: "auto", flexShrink: 1 }}>
          <Label>{"x".repeat(32)}</Label>
        </HBox>
        <VBox id="spacer" style={{ width: "auto", flexGrow: 1, minWidth: 0 }} />
        <HBox id="right" style={{ width: "auto", flexShrink: 1 }}>
          <Label>{"y".repeat(52)}</Label>
        </HBox>
      </HBox>,
    );

    const left = t.findById<Widget>("left")!;
    const right = t.findById<Widget>("right")!;

    // Combined intrinsic width (84) exceeds the 80-col row, so the two
    // auto-sized siblings must shrink proportionally rather than the row
    // silently clipping the right group.
    expect(left.region.width).toBeLessThan(32);
    expect(right.region.width).toBeLessThan(52);
    expect(left.region.width + right.region.width).toBeLessThanOrEqual(80);
  });

  test("without flexShrink, auto-sized siblings keep their measured size (back-compat)", async () => {
    const t = await mountApp(
      <HBox style={{ width: "100%" }}>
        <HBox id="left" style={{ width: "auto" }}>
          <Label>{"x".repeat(32)}</Label>
        </HBox>
        <VBox id="spacer" style={{ width: "auto", flexGrow: 1, minWidth: 0 }} />
        <HBox id="right" style={{ width: "auto" }}>
          <Label>{"y".repeat(52)}</Label>
        </HBox>
      </HBox>,
    );

    const left = t.findById<Widget>("left")!;
    const right = t.findById<Widget>("right")!;
    expect(left.region.width).toBe(32);
    expect(right.region.width).toBe(52);
  });

  test("flexShrink: 0 keeps a sibling at its measured size", async () => {
    const t = await mountApp(
      <HBox style={{ width: "100%" }}>
        <HBox id="left" style={{ width: "auto", flexShrink: 0 }}>
          <Label>{"x".repeat(32)}</Label>
        </HBox>
        <VBox id="spacer" style={{ width: "auto", flexGrow: 1, minWidth: 0 }} />
        <HBox id="right" style={{ width: "auto" }}>
          <Label>{"y".repeat(52)}</Label>
        </HBox>
      </HBox>,
    );

    const left = t.findById<Widget>("left")!;
    expect(left.region.width).toBe(32);
  });
});
