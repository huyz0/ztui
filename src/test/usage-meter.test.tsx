import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { UsageMeter } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 60,
  rows: 6,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

const usage = {
  turn: { input: 1234, output: 340, cacheRead: 840, cacheWrite: 120 },
  session: { input: 45000, output: 12000, cacheRead: 32000 },
  contextSize: 200000,
  contextUsed: 156000,
  cost: 0.12,
};

describe("UsageMeter", () => {
  test("full: turn, session, cache ratios, cost and context fill", async () => {
    const t = await mountApp(<UsageMeter {...usage} />, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("↑1.2k"); // turn input, abbreviated
    expect(text).toContain("↓340"); // turn output
    expect(text).toContain("💾68%"); // cache read ratio (840/1234)
    expect(text).toContain("✍10%"); // cache write ratio (120/1234)
    expect(text).toContain("↑45k"); // session input
    expect(text).toContain("💲0.12"); // cost
    expect(text).toContain("156k/200k"); // context used/size
    expect(text).toContain("78%"); // context fill
    expect(text).toContain("█"); // the fill bar
  });

  test("compact: a single dense line with context numbers + percent", async () => {
    const t = await mountApp(<UsageMeter {...usage} variant="compact" expandable={false} />, {
      ...OPTS,
      cols: 90,
    });
    await t.settle();
    const lines = t
      .text()
      .split("\n")
      .filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("⟳");
    expect(lines[0]).toContain("Σ");
    expect(lines[0]).toContain("🪟156k/200k 78%"); // numbers + percent
  });

  test("compact: clicking expands the full meter in a popover", async () => {
    const t = await mountApp(<UsageMeter id="m" {...usage} variant="compact" />, {
      ...OPTS,
      cols: 90,
    });
    await t.settle();
    expect(t.text()).not.toContain("Session"); // full-row labels not shown yet
    const anchor = t.findById<Widget>("m") as Widget;
    anchor.onClick?.({} as never);
    await t.settle();
    const text = t.text();
    expect(text).toContain("Turn"); // full layout's row labels appear
    expect(text).toContain("Session");
    expect(text).toContain("Ctx");
  });

  test("renders only the sections it's given", async () => {
    const t = await mountApp(<UsageMeter turn={{ input: 10, output: 5 }} />, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("↑10");
    expect(text).not.toContain("Session");
    expect(text).not.toContain("Ctx");
  });
});
