import {
  Footer,
  HBox,
  Header,
  Label,
  Spinner,
  type SpinnerMode,
  VBox,
  WaitingGrid,
  type WaitingGridVariant,
  WaitingPanel,
  type WaitingPanelVariant,
} from "../src/react.ts";

// Showcases the waiting indicators: single-cell Spinner modes, the small
// WaitingGrid variants, and the free-size WaitingPanel animations.

const spinnerModes: SpinnerMode[] = ["rotate", "bounce", "blink", "hex", "quadrant", "arc"];
const gridVariants: WaitingGridVariant[] = ["ring", "radar", "shimmer"];
const panelVariants: WaitingPanelVariant[] = ["ripple", "orbit", "rain"];

const card = {
  border: "rounded",
  borderColor: "$panel",
  padding: 1,
  margin: { right: 2 },
} as const;

function WaitingDemo() {
  return (
    <VBox style={{ background: "$surface", padding: 1 }}>
      <Header>⏳ ZTUI Waiting Indicators</Header>
      <Footer>Ctrl+C quit</Footer>

      <Label style={{ color: "$foreground", bold: true, margin: { top: 1 } }}>
        Spinner — single cell, inline
      </Label>
      <HBox style={{ padding: { top: 1, bottom: 1 } }}>
        {spinnerModes.map((mode) => (
          <HBox key={mode} style={{ margin: { right: 3 } }}>
            <Spinner mode={mode} style={{ margin: { right: 1 } }} />
            <Label style={{ color: "$dimmed" }}>{mode}</Label>
          </HBox>
        ))}
      </HBox>

      <Label style={{ color: "$foreground", bold: true }}>WaitingGrid — small panel</Label>
      <HBox style={{ padding: { top: 1, bottom: 1 } }}>
        {gridVariants.map((variant) => (
          <VBox key={variant} style={card}>
            <HBox>
              <WaitingGrid variant={variant} style={{ margin: { right: 2 } }} />
              <WaitingGrid variant={variant} cells={4} />
            </HBox>
            <Label style={{ color: "$dimmed", margin: { top: 1 } }}>{variant}</Label>
          </VBox>
        ))}
      </HBox>

      <Label style={{ color: "$foreground", bold: true }}>WaitingPanel — free size</Label>
      <HBox style={{ padding: { top: 1 } }}>
        {panelVariants.map((variant) => (
          <VBox key={variant} style={card}>
            <WaitingPanel variant={variant} style={{ width: 20, height: 7 }} />
            <Label style={{ color: "$dimmed", margin: { top: 1 } }}>{variant}</Label>
          </VBox>
        ))}
      </HBox>
    </VBox>
  );
}

import type { Demo } from "./gallery/types.ts";

export const waitingDemo: Demo = {
  id: "waiting",
  title: "Waiting",
  group: "Feedback",
  description: "Spinners & waiting panels.",
  Component: WaitingDemo,
};
