// Demonstrates property animation with easing (useAnimatedValue / useAnimatedColor):
//   • A horizontal bar whose width tweens between random targets — pick the easing
//     curve and watch how the motion changes (snap vs. ease-out vs. bounce).
//   • A "card" whose background colour fades smoothly between states instead of
//     snapping, the natural follow-on to alpha compositing.
//
// Keys: space animate to a new value · e cycle easing · q / Ctrl+C quit.
import { useState } from "react";
import {
  App,
  Box,
  type Easing,
  Footer,
  HBox,
  Header,
  Label,
  render,
  useAnimatedColor,
  useAnimatedValue,
  useHotkey,
  VBox,
} from "../src/index.ts";

const EASINGS: Easing[] = [
  "linear",
  "out-quad",
  "out-cubic",
  "in-out-cubic",
  "out-expo",
  "out-back",
  "out-elastic",
  "out-bounce",
];

const BAR_MAX = 50; // columns the bar can span
const COLORS = ["#89b4fa", "#a6e3a1", "#f9e2af", "#f38ba8", "#cba6f7"];

function AnimationDemo() {
  const [easingIdx, setEasingIdx] = useState(2);
  const [target, setTarget] = useState(0.3);
  const [colorIdx, setColorIdx] = useState(0);
  const easing = EASINGS[easingIdx];

  // A number that smoothly tweens toward `target` (0..1) with the chosen curve.
  const fill = useAnimatedValue(target, { duration: 600, easing });
  // A colour that fades — not snaps — when the target changes.
  const color = useAnimatedColor(COLORS[colorIdx], { duration: 500, easing: "out-cubic" });

  useHotkey({
    key: "space",
    name: "Animate",
    handler: () => {
      setTarget(Math.random());
      setColorIdx((i) => (i + 1) % COLORS.length);
    },
  });
  useHotkey({
    key: "e",
    name: "Cycle easing",
    handler: () => setEasingIdx((i) => (i + 1) % EASINGS.length),
  });
  useHotkey({ key: "q", name: "Quit", handler: () => process.exit(0) });

  const width = Math.max(0, Math.round(fill * BAR_MAX));
  const pct = Math.round(fill * 100);

  return (
    <VBox style={{ width: "100%", height: "100%", background: "$background" }}>
      <Header>ztui — property animation with easing</Header>

      <VBox style={{ padding: 1 }}>
        <HBox>
          <Label style={{ width: 10, color: "$comment" }}>easing:</Label>
          <Label style={{ color: "$foreground", bold: true }}>{easing}</Label>
        </HBox>

        <Box style={{ height: 1 }} />

        {/* The animated bar: its width is driven by the tweened value. */}
        <HBox>
          <Box style={{ width: BAR_MAX, height: 1, background: "$surface" }}>
            <Box style={{ width, height: 1, background: color }} />
          </Box>
          <Label style={{ color: "$comment" }}>{` ${pct}%`}</Label>
        </HBox>

        <Box style={{ height: 1 }} />

        {/* A colour-fading card driven by useAnimatedColor. */}
        <Box style={{ width: BAR_MAX, height: 3, background: color, border: "round" }}>
          <Label style={{ padding: 1, color: "#11111b", bold: true }}>
            colour fades, not snaps
          </Label>
        </Box>
      </VBox>

      <Footer>space animate · e cycle easing · q quit</Footer>
    </VBox>
  );
}

const app = new App();
render(<AnimationDemo />, app.activeScreen);
app.run();
