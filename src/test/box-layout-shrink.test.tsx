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

  test("shrunk siblings' rounded widths never sum past the container edge", async () => {
    // Regression: each shrunk child was rounded independently. Three
    // equal-weight children shrinking from a 15-wide row down to 14 converge
    // (via the deficit loop's per-child consumption order) to fractional
    // sizes that all round *up* to 5, summing to 15 in a 14-wide row — 1 cell
    // over the edge — even though the pre-rounding deficit loop converged
    // exactly to a total of 14.
    // A bare root component's explicit width/height doesn't take effect (the
    // root always stretches to the screen, and the App floors screen width to
    // 80), so nest the row inside a full-width root instead of sizing the
    // root itself.
    const t = await mountApp(
      <VBox style={{ width: "100%" }}>
        <HBox id="row" style={{ width: 14 }}>
          <HBox id="a" style={{ width: 5, flexShrink: 1 }} />
          <HBox id="b" style={{ width: 5, flexShrink: 1 }} />
          <HBox id="c" style={{ width: 5, flexShrink: 1 }} />
        </HBox>
      </VBox>,
    );

    const a = t.findById<Widget>("a")!;
    const b = t.findById<Widget>("b")!;
    const c = t.findById<Widget>("c")!;
    const row = t.findById<Widget>("row")!;
    const total = a.region.width + b.region.width + c.region.width;
    expect(total).toBeLessThanOrEqual(14);
    // The last child's region must not extend past the row.
    expect(c.region.right).toBeLessThanOrEqual(row.region.right);
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
