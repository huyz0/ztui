import { useEffect, useState } from "react";
import { App, Dock, Footer, HBox, Header, Label, render, Sparkline, VBox } from "../src/index.ts";

// A live agent HUD: dense one-row sparklines for the signals you'd watch while
// a model streams — tokens/sec, latency, and running cost — each updating in
// place as new samples arrive.
const WINDOW = 40;

function useStream(next: (prev: number) => number, seed: number) {
  const [data, setData] = useState<number[]>([seed]);
  useEffect(() => {
    const id = setInterval(() => {
      setData((d) => [...d, next(d[d.length - 1])].slice(-WINDOW));
    }, 150);
    return () => clearInterval(id);
  }, [next]);
  return data;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function SparklineDemo() {
  const tokens = useStream((p) => clamp(p + (Math.random() - 0.45) * 30, 0, 220), 80);
  const latency = useStream((p) => clamp(p + (Math.random() - 0.5) * 40, 20, 400), 120);
  const [cost, setCost] = useState<number[]>([0]);
  useEffect(() => {
    const id = setInterval(() => {
      setCost((d) => [...d, (d[d.length - 1] ?? 0) + Math.random() * 0.4].slice(-WINDOW));
    }, 150);
    return () => clearInterval(id);
  }, []);

  const row = (label: string, data: number[], color: string, suffix = "") => (
    <HBox style={{ height: 1, margin: { bottom: 1 } }}>
      <Label style={{ width: 14, dim: true }}>{label}</Label>
      <Sparkline data={data} showValue style={{ width: 44, color }} />
      <Label style={{ dim: true }}>{suffix}</Label>
    </HBox>
  );

  return (
    <Dock style={{ background: "#11111b" }}>
      <Header>📈 ZTUI Sparkline — live agent HUD</Header>
      <Footer>
        one-row micro-charts · auto-ranged · tails the most recent samples · Ctrl+C quit
      </Footer>

      <VBox style={{ padding: 1 }}>
        {row("tokens/sec", tokens, "$success")}
        {row("latency ms", latency, "$warning")}
        {row("cost ¢", cost, "$accent")}
      </VBox>
    </Dock>
  );
}

const app = new App();
render(<SparklineDemo />, app.activeScreen);
app.run();
