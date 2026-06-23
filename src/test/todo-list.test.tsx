import { describe, expect, test } from "vitest";
import { TodoList } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 40,
  rows: 12,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

const items = [
  { text: "Read the spec", status: "completed" as const },
  { text: "Implement it", status: "in_progress" as const },
  { text: "Write tests" }, // defaults to pending
  { text: "Drop the old API", status: "cancelled" as const },
];

describe("TodoList", () => {
  test("renders one row per task with its status glyph", async () => {
    const t = await mountApp(<TodoList items={items} />, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("✔"); // completed
    expect(text).toContain("◐"); // in progress
    expect(text).toContain("○"); // pending
    expect(text).toContain("✗"); // cancelled
    for (const it of items) expect(text).toContain(it.text);
  });

  test("title shows a live done/total count", async () => {
    const t = await mountApp(<TodoList title="Plan" items={items} />, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("Plan");
    expect(text).toContain("1/4"); // one completed of four
  });

  test("empty list renders nothing fatal", async () => {
    const t = await mountApp(<TodoList items={[]} title="Plan" />, OPTS);
    await t.settle();
    expect(t.text()).toContain("0/0");
  });
});
