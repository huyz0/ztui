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

  test("formats million-scale counts and hides sections that are absent", async () => {
    // session.input >= 1e6 exercises fmt()'s "M" branch; a turn with
    // input: 0 exercises pct()'s den<=0 branch; omitting contextUsed
    // exercises the `contextUsed ?? 0` fallback while contextSize is set.
    const t = await mountApp(
      <UsageMeter
        turn={{ input: 0, output: 0 }}
        session={{ input: 1_200_000, output: 300_000 }}
        contextSize={100_000}
      />,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("↑1.2M"); // session input, million-scale
    expect(text).toContain("↑0"); // turn input, zero (no cache ratio shown)
    expect(text).toContain("0/100k"); // contextUsed defaults to 0
  });

  test("colour thresholds: high context fill and low/mid cache hit-rate", async () => {
    // ratio >= 0.85 -> fillColor's "$error" branch (untested by the 78% case above).
    const t = await mountApp(
      <UsageMeter
        turn={{ input: 100, output: 10, cacheRead: 5 }} // 5% -> cacheColor "$dimmed"
        contextSize={100_000}
        contextUsed={90_000} // 90% -> fillColor "$error"
      />,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("💾5%");
    expect(text).toContain("90%");
  });

  test("cache hit-rate mid-range hits the warning colour branch", async () => {
    const t = await mountApp(
      <UsageMeter
        turn={{ input: 100, output: 10, cacheRead: 30 }}
        contextSize={100_000}
        contextUsed={20_000}
      />,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("💾30%");
  });

  test("with nothing to show and expandable, canExpand is false (no popover, no crash)", async () => {
    const t = await mountApp(<UsageMeter variant="compact" />, OPTS);
    await t.settle();
    expect(t.text().trim()).toBe("");
  });

  test("compact: omitting turn/session/cost/contextSize hides each section", async () => {
    const t = await mountApp(
      <UsageMeter variant="compact" session={{ input: 5, output: 2 }} expandable={false} />,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).not.toContain("⟳");
    expect(text).toContain("Σ");
    expect(text).not.toContain("💲");
  });

  test("full: omitting turn hides the turn row but keeps session/cost and context", async () => {
    const t = await mountApp(
      <UsageMeter session={{ input: 5, output: 2 }} contextSize={100} contextUsed={10} />,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).not.toContain("Turn");
    expect(text).toContain("Session");
    expect(text).not.toContain("💲"); // no cost given
    expect(text).toContain("Ctx");
  });

  test("expandKey toggles the popover via the registered hotkey", async () => {
    const t = await mountApp(<UsageMeter {...usage} variant="compact" expandKey="ctrl+u" />, {
      ...OPTS,
      cols: 90,
    });
    await t.settle();
    expect(t.text()).not.toContain("Session");
    t.driver.simulateKey("ctrl+u", "u", true);
    await t.settle();
    expect(t.text()).toContain("Session");
  });
});
