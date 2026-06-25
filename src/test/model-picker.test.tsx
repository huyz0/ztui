import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { type ModelEntry, ModelPicker } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 70,
  rows: 16,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

const MODELS: ModelEntry[] = [
  {
    id: "opus",
    provider: "Anthropic",
    name: "Opus 4.8",
    cost: 2,
    reasoning: true,
    location: "remote",
  },
  { id: "haiku", provider: "Anthropic", name: "Haiku 4.5", cost: 1, location: "remote" },
  { id: "llama", provider: "Ollama", name: "Llama 3.1", cost: 1, location: "local" },
];

function findTable(t: Awaited<ReturnType<typeof mountApp>>): Widget {
  let found: Widget | undefined;
  t.screen.walk((n) => {
    if ((n as Widget).constructor?.name === "TableWidget") found = n as Widget;
  });
  if (!found) throw new Error("TableWidget not found");
  return found;
}

describe("ModelPicker", () => {
  test("lists every model with its provider and a cost badge", async () => {
    const t = await mountApp(<ModelPicker models={MODELS} value="opus" />, OPTS);
    await t.settle();
    const text = t.text();
    for (const m of MODELS) expect(text).toContain(m.name);
    expect(text).toContain("Anthropic");
    expect(text).toContain("Ollama");
    expect(text).toContain("2×"); // numeric cost → multiplier badge
    expect(text).toContain("✓"); // marker on the selected row
  });

  test("filters rows by text against name and provider", async () => {
    const t = await mountApp(<ModelPicker models={MODELS} filterPlaceholder="find…" />, OPTS);
    await t.settle();
    // Type into the filter box (it owns the only Input in the tree).
    let input: any;
    t.screen.walk((n) => {
      if ((n as any).constructor?.name === "InputWidget") input = n;
    });
    expect(input).toBeTruthy();
    input.value = "ollama";
    input.onChange?.("ollama");
    await t.settle();
    const text = t.text();
    expect(text).toContain("Llama 3.1");
    expect(text).not.toContain("Opus 4.8");
  });

  test("Enter on a row fires onSelect with that model", async () => {
    let picked: ModelEntry | undefined;
    const t = await mountApp(
      <ModelPicker models={MODELS} onSelect={(m) => (picked = m)} filterable={false} />,
      OPTS,
    );
    await t.settle();
    const table = findTable(t);
    t.screen.focusWidget(table);
    // Cursor starts on row 0; Enter activates it. A down then selects row 1.
    table.handleKey({ name: "enter", key: "enter" } as never);
    expect(picked?.id).toBe("opus");
    table.handleKey({ name: "down", key: "down" } as never);
    table.handleKey({ name: "enter", key: "enter" } as never);
    expect(picked?.id).toBe("haiku");
  });

  test("groups by provider — each provider name shown once", async () => {
    const t = await mountApp(<ModelPicker models={MODELS} filterable={false} />, OPTS);
    await t.settle();
    const occurrences = (t.text().match(/Anthropic/g) ?? []).length;
    expect(occurrences).toBe(1); // two Anthropic rows, but the name heads the group once
    expect(t.text()).toContain("Ollama");
  });

  test("a column is omitted when no model supplies that field", async () => {
    const bare: ModelEntry[] = [
      { id: "a", name: "Model A" },
      { id: "b", name: "Model B" },
    ];
    const t = await mountApp(<ModelPicker models={bare} filterable={false} />, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("Model A");
    expect(text).not.toContain("Provider"); // header hidden
    expect(text).not.toContain("Cost");
  });
});
