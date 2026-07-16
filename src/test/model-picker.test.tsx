import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { type ModelEntry, ModelPicker } from "../react/components.tsx";
import "../widgets/index.ts";
import { findWidgetByType, mountApp } from "./harness.tsx";

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
  return findWidgetByType<Widget>(t, "TableWidget");
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

  test("a string cost renders verbatim, not as a multiplier badge", async () => {
    const models: ModelEntry[] = [
      { id: "custom", provider: "Vendor", name: "Custom", cost: "$3/Mtok" },
    ];
    const t = await mountApp(<ModelPicker models={models} />, OPTS);
    await t.settle();
    expect(t.text()).toContain("$3/Mto");
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

  test("filtering tolerates models missing a filtered field", async () => {
    const models: ModelEntry[] = [
      { id: "a", provider: "Anthropic", name: "Opus" },
      { id: "b", name: "No Provider" }, // provider is undefined
    ];
    const t = await mountApp(<ModelPicker models={models} />, OPTS);
    await t.settle();
    let input: any;
    t.screen.walk((n) => {
      if ((n as any).constructor?.name === "InputWidget") input = n;
    });
    input.value = "anthropic";
    input.onChange?.("anthropic");
    await t.settle();
    const text = t.text();
    expect(text).toContain("Opus");
    expect(text).not.toContain("No Provider");
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

  test("opens with the cursor already on the row matching `value`, not row 0", async () => {
    // Regression: `index` only ever initialized to 0 and was never synced to
    // `value`, so opening the picker on e.g. the 3rd model still highlighted
    // the 1st row -- Enter right after opening would activate the wrong
    // model.
    let picked: ModelEntry | undefined;
    const t = await mountApp(
      <ModelPicker
        models={MODELS}
        value="llama"
        onSelect={(m) => (picked = m)}
        filterable={false}
      />,
      OPTS,
    );
    await t.settle();
    const table = findTable(t);
    t.screen.focusWidget(table);
    table.handleKey({ name: "enter", key: "enter" } as never);
    expect(picked?.id).toBe("llama");
  });

  test("groups by provider — each provider name shown once", async () => {
    const t = await mountApp(<ModelPicker models={MODELS} filterable={false} />, OPTS);
    await t.settle();
    const occurrences = (t.text().match(/Anthropic/g) ?? []).length;
    expect(occurrences).toBe(1); // two Anthropic rows, but the name heads the group once
    expect(t.text()).toContain("Ollama");
  });

  test("a model missing cost renders a blank cell (column still shown)", async () => {
    const models: ModelEntry[] = [
      { id: "a", provider: "Vendor", name: "Priced", cost: 3 },
      { id: "b", provider: "Vendor", name: "Unpriced" },
    ];
    const t = await mountApp(<ModelPicker models={models} filterable={false} />, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("3×"); // cost > 2 -> $error color branch
    expect(text).toContain("Unpriced");
  });

  test("mixed location (some models without one) falls back to a blank cell", async () => {
    const models: ModelEntry[] = [
      { id: "a", provider: "Vendor", name: "Local", location: "local" },
      { id: "b", provider: "Vendor", name: "Unknown" },
    ];
    const t = await mountApp(<ModelPicker models={models} filterable={false} />, OPTS);
    await t.settle();
    expect(t.text()).toContain("Unknown");
  });

  test("a `value` that matches no row leaves the cursor unmoved", async () => {
    let picked: ModelEntry | undefined;
    const t = await mountApp(
      <ModelPicker
        models={MODELS}
        value="does-not-exist"
        onSelect={(m) => (picked = m)}
        filterable={false}
      />,
      OPTS,
    );
    await t.settle();
    const table = findTable(t);
    t.screen.focusWidget(table);
    table.handleKey({ name: "enter", key: "enter" } as never);
    expect(picked?.id).toBe("opus"); // cursor stayed at row 0
  });

  test("a model with no provider groups under the empty-string bucket", async () => {
    const models: ModelEntry[] = [
      { id: "a", provider: "Vendor", name: "Has provider" },
      { id: "b", name: "No provider" },
    ];
    const t = await mountApp(<ModelPicker models={models} filterable={false} />, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("Has provider");
    expect(text).toContain("No provider");
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
