import { describe, expect, test } from "vitest";
import { HBox, StatusBadge, StatusDot, StatusList, VBox } from "../../index.ts";
import { mountApp } from "../../test/harness.tsx";

describe("ZTUI Status Widget Suite", () => {
  test("StatusDot renders a single coloured glyph", async () => {
    const { findById, cellAt } = await mountApp(
      <HBox>
        <StatusDot id="d" state="completed" />
      </HBox>,
      { cols: 10, rows: 3 },
    );
    expect(findById("d")).toBeDefined();
    expect(cellAt(0, 0).char).toBe("✔");
    // completed resolves to the theme success colour (green by default).
    expect(cellAt(0, 0).style.color).toBeTruthy();
  });

  test("StatusDot swaps vocabulary with glyphSet", async () => {
    const { cellAt } = await mountApp(
      <HBox>
        <StatusDot state="failed" glyphSet="ascii" />
      </HBox>,
      { cols: 10, rows: 3 },
    );
    expect(cellAt(0, 0).char).toBe("x");
  });

  test("StatusBadge draws glyph then label, defaulting the label to the state", async () => {
    const { text } = await mountApp(
      <HBox>
        <StatusBadge state="active" />
      </HBox>,
      { cols: 20, rows: 3 },
    );
    expect(text()).toContain("● active");
  });

  test("StatusBadge honours an explicit label", async () => {
    const { text } = await mountApp(
      <HBox>
        <StatusBadge state="ongoing" label="running" />
      </HBox>,
      { cols: 20, rows: 3 },
    );
    expect(text()).toContain("◐ running");
  });

  test("StatusList renders one row per item with detail", async () => {
    const { text } = await mountApp(
      <VBox>
        <StatusList
          items={[
            { state: "completed", label: "build", detail: "4.2s" },
            { state: "failed", label: "e2e", detail: "2 failed" },
          ]}
        />
      </VBox>,
      { cols: 30, rows: 5 },
    );
    const out = text();
    expect(out).toContain("✔ build");
    expect(out).toContain("4.2s");
    expect(out).toContain("✘ e2e");
    expect(out).toContain("2 failed");
  });
});
