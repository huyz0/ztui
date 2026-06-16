import { useEffect, useState } from "react";
import { Gauge, Header, Label, VBox, View } from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";
import type { Demo } from "./gallery/types.ts";

const ZONES = [
  { at: 0, color: "$success" },
  { at: 70, color: "$warning" },
  { at: 90, color: "$error" },
];

const clamp = (v: number) => Math.max(0, Math.min(100, v));

function GaugeDemo() {
  const [cpu, setCpu] = useState(34);
  const [mem, setMem] = useState(72);
  const [disk] = useState(94);

  useEffect(() => {
    const id = setInterval(() => {
      setCpu((v) => clamp(v + (Math.random() - 0.5) * 24));
      setMem((v) => clamp(v + (Math.random() - 0.5) * 8));
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <VBox style={{ padding: 1, height: "100%", background: "$background" }}>
      <Header>🎚️ Gauge — severity meters</Header>
      <View style={{ height: 1 }} />

      <Label style={{ color: "$dimmed" }}>Live utilization (green → amber → red):</Label>
      <Gauge label="CPU " value={cpu} unit="%" thresholds={ZONES} style={{ width: 48 }} />
      <Gauge label="MEM " value={mem} unit="%" thresholds={ZONES} style={{ width: 48 }} />
      <Gauge label="DISK" value={disk} unit="%" thresholds={ZONES} style={{ width: 48 }} />

      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>Plain (no thresholds) and unit readouts:</Label>
      <Gauge label="Score" value={7.5} max={10} unit="" color="$accent" style={{ width: 48 }} />
      <Gauge label="Quota" value={820} max={1000} unit=" MB" style={{ width: 48 }} />

      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>Space-constrained (10 wide):</Label>
      <Gauge value={cpu} thresholds={ZONES} style={{ width: 10 }} />

      <View style={{ height: "1fr" }} />
      <ExitButton style={{ margin: 0 }}>Exit</ExitButton>
    </VBox>
  );
}

export const gaugeDemo: Demo = {
  id: "gauge",
  title: "Gauge",
  group: "Feedback",
  description:
    "Single-value severity meters — threshold-coloured fill, value readout, degrades tiny.",
  Component: GaugeDemo,
};
