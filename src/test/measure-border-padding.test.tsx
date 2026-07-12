import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { HBox, Label, VBox } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

describe("Widget.measure border/padding budget", () => {
  test("an auto-sized child doesn't overflow a bordered+padded ancestor's real content box", async () => {
    const t = await mountApp(
      <VBox>
        <VBox id="outer" style={{ width: 30, border: "round", padding: 1 }}>
          <HBox id="inner" style={{ width: "auto" }}>
            <Label>{"x".repeat(28)}</Label>
          </HBox>
        </VBox>
      </VBox>,
    );

    const outer = t.findById<Widget>("outer")!;
    const inner = t.findById<Widget>("inner")!;
    const content = outer.getContentRect();

    // outer: width 30, border 1 + padding 1 per side -> content box is 26
    // wide. The 28-char label would naively measure wider than that if
    // border/padding weren't subtracted before measuring children.
    expect(content.width).toBe(26);
    expect(inner.region.width).toBe(26);
    expect(inner.region.x + inner.region.width).toBeLessThanOrEqual(content.x + content.width);
  });
});
