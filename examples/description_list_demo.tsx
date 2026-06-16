import { DescriptionList, Header, Label, VBox, View } from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";
import type { Demo } from "./gallery/types.ts";

function DescriptionListDemo() {
  return (
    <VBox style={{ padding: 1, height: "100%", background: "$background" }}>
      <Header>📋 DescriptionList — key/value detail panes</Header>
      <View style={{ height: 1 }} />

      <Label style={{ color: "$dimmed" }}>Session (auto-sized term column):</Label>
      <DescriptionList
        style={{ width: 52, border: "rounded", padding: { left: 1, right: 1 } }}
        items={[
          { term: "Model", description: "claude-opus-4-8" },
          { term: "Context", description: "200k tokens" },
          { term: "Mode", description: "fast (Opus, faster output)" },
          {
            term: "Notes",
            description:
              "Long values wrap and stay aligned under the description column, however many lines they take.",
          },
        ]}
      />

      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>Right-aligned terms, fixed width:</Label>
      <DescriptionList
        termAlign="right"
        termWidth={10}
        termColor="$accent"
        style={{ width: 40 }}
        items={[
          { term: "status", description: "running" },
          { term: "uptime", description: "3h 12m" },
          { term: "pid", description: "48213" },
        ]}
      />

      <View style={{ height: "1fr" }} />
      <ExitButton style={{ margin: 0 }}>Exit</ExitButton>
    </VBox>
  );
}

export const descriptionListDemo: Demo = {
  id: "description-list",
  title: "DescriptionList",
  group: "Data",
  description: "Aligned term : description rows for config and detail panes — wraps and truncates.",
  Component: DescriptionListDemo,
};
