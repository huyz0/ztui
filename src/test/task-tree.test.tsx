import { describe, expect, test } from "vitest";
import type { TaskNode } from "../react/components.tsx";
import { TaskTree } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 50,
  rows: 16,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

const items: TaskNode[] = [
  {
    text: "Build feature",
    status: "in_progress",
    children: [
      { text: "Read the spec", status: "completed" },
      {
        text: "Implement",
        status: "in_progress",
        children: [
          { text: "types", status: "completed" },
          { text: "logic", status: "in_progress" },
        ],
      },
    ],
  },
  { text: "Ship it" }, // pending
];

describe("TaskTree", () => {
  test("renders every node with its status glyph and connectors", async () => {
    const t = await mountApp(<TaskTree items={items} />, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("Build feature");
    expect(text).toContain("Read the spec");
    expect(text).toContain("types");
    expect(text).toContain("Ship it");
    expect(text).toContain("✔"); // completed
    expect(text).toContain("◐"); // in progress
    expect(text).toContain("○"); // pending
    // Tree connectors are drawn for nested nodes.
    expect(text).toContain("├─");
    expect(text).toContain("└─");
    expect(text).toContain("│");
  });

  test("title counts done/total across the whole tree", async () => {
    const t = await mountApp(<TaskTree title="Plan" items={items} />, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("Plan");
    // 6 nodes total, 2 completed.
    expect(text).toContain("2/6");
  });

  test("a flat tree still renders (no children)", async () => {
    const t = await mountApp(
      <TaskTree items={[{ text: "only task", status: "pending" }]} title="T" />,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("only task");
    expect(text).toContain("0/1");
    expect(text).toContain("└─"); // single node is the last
  });
});
