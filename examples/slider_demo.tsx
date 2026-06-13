import { useState } from "react";
import { Header, Label, Slider, VBox } from "../src/react.ts";
import type { Demo } from "./gallery/types.ts";

function SliderDemo() {
  const [volume, setVolume] = useState(70);
  const [bright, setBright] = useState(40);
  return (
    <VBox style={{ padding: 1, width: 40 }}>
      <Header>Slider</Header>
      <Label style={{ margin: { top: 1 } }}>Volume: {volume}</Label>
      <Slider value={volume} min={0} max={100} step={5} onChange={setVolume} />
      <Label style={{ margin: { top: 1 } }}>Brightness: {bright}</Label>
      <Slider value={bright} min={0} max={100} onChange={setBright} />
    </VBox>
  );
}

export const sliderDemo: Demo = {
  id: "slider",
  title: "Slider",
  group: "Controls",
  description: "Numeric range sliders.",
  autoFocusTag: "@first",
  Component: SliderDemo,
};
