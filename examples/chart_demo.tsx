import { useEffect, useState } from "react";
import {
  AreaChart,
  BarChart,
  type BarChartItem,
  HBox,
  Header,
  Label,
  LinePlot,
  PieChart,
  type PieSlice,
  ScatterPlot,
  type ScatterPoint,
  VBox,
  View,
} from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";

const MODELS: BarChartItem[] = [
  { label: "gpt-4o", value: 1280, color: "$accent" },
  { label: "haiku", value: 940, color: "$success" },
  { label: "sonnet", value: 610, color: "$secondary" },
  { label: "opus", value: 320, color: "$warning" },
];

const USAGE: PieSlice[] = [
  { label: "prompt", value: 62, color: "$accent" },
  { label: "completion", value: 28, color: "$success" },
  { label: "cache", value: 10, color: "$warning" },
];

// A static scatter cloud (latency vs. tokens), deterministically jittered.
const CLOUD: ScatterPoint[] = Array.from({ length: 40 }, (_, i) => ({
  x: i + (i % 7),
  y: 20 + ((i * 13) % 60) + Math.sin(i) * 8,
}));

function wave(n: number, phase: number, amp: number): number[] {
  return Array.from({ length: n }, (_, i) => 50 + amp * Math.sin(i / 4 + phase));
}

const cap = { color: "$dimmed", margin: { top: 1 } } as const;

function ChartDemoApp() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => p + 0.3), 120);
    return () => clearInterval(t);
  }, []);

  const p50 = wave(60, phase, 18);
  const p99 = wave(60, phase + 1.2, 30);
  const traffic = wave(60, phase, 22).map((v) => v - 10);

  return (
    <VBox style={{ padding: 1, height: "100%", background: "$background" }}>
      <Header>📊 Charts — Bar · Line · Area · Scatter · Pie</Header>

      <HBox style={{ flexGrow: 1, margin: { top: 1 } }}>
        <VBox style={{ flexGrow: 1, margin: { right: 2 } }}>
          <Label style={{ color: "$dimmed" }}>Tokens by model (BarChart):</Label>
          <BarChart items={MODELS} style={{ width: "100%", height: 4 }} />

          <Label style={cap}>Latency p50 / p99 (LinePlot):</Label>
          <LinePlot
            series={[p50, p99]}
            colors={["$accent", "$warning"]}
            min={0}
            max={100}
            style={{ border: "rounded", width: "100%", height: 6 }}
          />

          <Label style={cap}>Token usage (PieChart):</Label>
          <PieChart items={USAGE} style={{ width: "100%" }} />
        </VBox>

        <VBox style={{ flexGrow: 1 }}>
          <Label style={{ color: "$dimmed" }}>Requests/min (AreaChart):</Label>
          <AreaChart
            data={traffic}
            colors={["$success"]}
            min={0}
            max={100}
            style={{ border: "rounded", width: "100%", height: 6 }}
          />

          <Label style={cap}>Latency vs. tokens (ScatterPlot):</Label>
          <ScatterPlot
            points={CLOUD}
            colors={["$accent"]}
            style={{ border: "rounded", width: "100%", height: 7 }}
          />
        </VBox>
      </HBox>

      <View style={{ height: 1 }} />
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
    "Bar, line, area, scatter and pie — braille plots and stacked bars that degrade to tiny boxes.",
  Component: ChartDemoApp,
};
