import { useState } from "react";
import { Dock, Footer, Header, Label, type ModelEntry, ModelPicker } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";
import type { Demo } from "./gallery/types.ts";

// The Agent Kit `ModelPicker`: a filterable table list of models. Each row shows
// the provider, name, a cost multiplier badge (coloured by magnitude), a
// reasoning icon, and a local/remote icon (icons, not text). Type to filter;
// arrow-navigate and Enter to choose. Columns appear only when a field is
// present, and `extraColumns` lets you add your own.
const MODELS: ModelEntry[] = [
  {
    id: "opus",
    provider: "Anthropic",
    name: "Claude Opus 4.8",
    cost: 2,
    reasoning: true,
    location: "remote",
  },
  {
    id: "sonnet",
    provider: "Anthropic",
    name: "Claude Sonnet 4.6",
    cost: 1,
    reasoning: true,
    location: "remote",
  },
  { id: "haiku", provider: "Anthropic", name: "Claude Haiku 4.5", cost: 1, location: "remote" },
  {
    id: "gpt5",
    provider: "OpenAI",
    name: "GPT-5",
    cost: "3×",
    reasoning: true,
    location: "remote",
  },
  { id: "llama", provider: "Ollama", name: "Llama 3.1 70B", cost: 1, location: "local" },
  {
    id: "qwen",
    provider: "Ollama",
    name: "Qwen2.5 Coder",
    cost: 1,
    reasoning: true,
    location: "local",
  },
];

function ModelPickerDemo() {
  const [chosen, setChosen] = useState<ModelEntry>(MODELS[0]);

  return (
    <Dock style={{ background: "$background" }}>
      <Header>🤖 ZTUI Model Picker — filter, then Enter to choose</Header>
      <ModelPicker
        models={MODELS}
        value={chosen.id}
        onSelect={setChosen}
        style={{ padding: 1, height: "1fr" }}
      />
      <Footer>
        <Label>
          Selected: <Label style={{ color: "$accent", bold: true }}>{chosen.name}</Label>
          {quitHint() ? "   ·   Ctrl+C quit" : ""}
        </Label>
      </Footer>
    </Dock>
  );
}

export const modelPickerDemo: Demo = {
  id: "model-picker",
  title: "Model Picker",
  group: "Data",
  description:
    "Filterable table list of LLMs: provider, name, cost badge, reasoning + local/remote icons.",
  autoFocusTag: "table",
  Component: ModelPickerDemo,
};
