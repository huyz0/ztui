import { useEffect, useState } from "react";
import { BarChart, type BarChartItem, Header, Label, LinePlot, VBox, View } from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";

const MODELS: BarChartItem[] = [
  { label: "gpt-4o", value: 1280, color: "$accent" },
  { label: "haiku", value: 940, color: "$success" },
  { label: "sonnet", value: 610, color: "$secondary" },
  { label: "opus", value: 320, color: "$warning" },
];

function wave(n: number, phase: number, amp: number): number[] {
  return Array.from({ length: n }, (_, i) => 50 + amp * Math.sin(i / 4 + phase));
}

function ChartDemoApp() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => p + 0.3), 120);
    return () => clearInterval(t);
  }, []);

  const p50 = wave(60, phase, 18);
  const p99 = wave(60, phase + 1.2, 30);

  return (
    <VBox style={{ padding: 1, height: "100%", background: "$background" }}>
      <Header>📊 Charts — BarChart & LinePlot</Header>
      <View style={{ height: 1 }} />

      <Label style={{ color: "$dimmed" }}>Tokens by model (BarChart):</Label>
      <BarChart items={MODELS} style={{ width: 50, height: 4 }} />

      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>Latency p50 / p99 (braille LinePlot):</Label>
      <LinePlot
        series={[p50, p99]}
        colors={["$accent", "$warning"]}
        min={0}
        max={100}
        style={{ border: "rounded", width: 60, height: 8 }}
      />

      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>Same plot, space-constrained (10×3):</Label>
      <LinePlot
        series={[p50, p99]}
        colors={["$accent", "$warning"]}
        min={0}
        max={100}
        style={{ width: 10, height: 3 }}
      />

      <View style={{ height: "1fr" }} />
      <ExitButton style={{ margin: 0 }}>Exit</ExitButton>
    </VBox>
  );
}

import type { Demo } from "./gallery/types.ts";

export const chartDemo: Demo = {
  id: "chart",
  title: "Charts",
  group: "Data",
  description:
    "Horizontal bar chart and a braille line plot — degrades to tiny, constrained boxes.",
  Component: ChartDemoApp,
};
