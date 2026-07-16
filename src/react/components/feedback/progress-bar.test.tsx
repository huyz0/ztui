import { describe, expect, test } from "vitest";
import { HBox } from "../../../react.ts";
import { mountApp } from "../../../test/harness.tsx";
import type { ProgressBarWidget } from "../../../widgets/feedback/progress-bar.ts";
import { CompactProgressBar, ProgressBar } from "./progress-bar.tsx";

describe("ProgressBar (React wrapper)", () => {
  test("animate=true translates to the default 300ms tween", async () => {
    const { findById } = await mountApp(
      <HBox>
        <ProgressBar id="pb" value={50} animate style={{ width: 10 }} />
      </HBox>,
      { cols: 20, rows: 3 },
    );
    expect(findById<ProgressBarWidget>("pb")?.animateMs).toBe(300);
  });

  test("animate=<number> passes that duration straight through", async () => {
    const { findById } = await mountApp(
      <HBox>
        <ProgressBar id="pb" value={50} animate={750} style={{ width: 10 }} />
      </HBox>,
      { cols: 20, rows: 3 },
    );
    expect(findById<ProgressBarWidget>("pb")?.animateMs).toBe(750);
  });

  test("without animate, the widget snaps (animateMs = 0)", async () => {
    const { findById } = await mountApp(
      <HBox>
        <ProgressBar id="pb" value={50} style={{ width: 10 }} />
      </HBox>,
      { cols: 20, rows: 3 },
    );
    expect(findById<ProgressBarWidget>("pb")?.animateMs).toBe(0);
  });

  test("CompactProgressBar defaults to a 5-cell width", async () => {
    const { findById } = await mountApp(
      <HBox>
        <CompactProgressBar id="pb" value={40} />
      </HBox>,
      { cols: 20, rows: 3 },
    );
    expect(findById("pb")!.getClientRect().width).toBe(5);
  });

  test("CompactProgressBar grows to 10 cells when showPercent is set", async () => {
    const { findById, text, settle } = await mountApp(
      <HBox>
        <CompactProgressBar id="pb" value={40} showPercent />
      </HBox>,
      { cols: 20, rows: 3 },
    );
    await settle();
    expect(findById("pb")!.getClientRect().width).toBe(10);
    expect(text()).toContain("40%");
  });

  test("CompactProgressBar honours an explicit width override in style", async () => {
    const { findById } = await mountApp(
      <HBox>
        <CompactProgressBar id="pb" value={40} style={{ width: 15 }} />
      </HBox>,
      { cols: 20, rows: 3 },
    );
    expect(findById("pb")!.getClientRect().width).toBe(15);
  });
});
