import { Box, Dock, Footer, Header, Label, VBox } from "../src/react.ts";

// Box widgets carry an optional `title` drawn into the top border edge as
// `─ title ─`. It only shows when the box has a border, inherits the border
// color, and truncates with `…` when wider than the box.
function BoxTitleDemo() {
  return (
    <Dock style={{ background: "$surface" }}>
      <Header>🔲 ZTUI Box title — labels on the top border edge</Header>
      <Footer>Ctrl+C quit</Footer>

      <VBox style={{ padding: 1, gap: 1 }}>
        <Box title="Settings" style={{ border: "rounded", padding: 1, width: 40 }}>
          <Label>Rounded border with a plain title.</Label>
        </Box>

        <Box
          title="⚙ Build  ✓ passing"
          style={{ border: "double", borderColor: "$success", padding: 1, width: 40 }}
        >
          <Label style={{ dim: true }}>Title color follows the border color.</Label>
        </Box>

        <Box
          title="A rather long panel title that will not fit"
          style={{ border: "solid", borderColor: "$warning", padding: 1, width: 40 }}
        >
          <Label style={{ dim: true }}>Overlong titles truncate with an ellipsis.</Label>
        </Box>

        <Box style={{ border: "rounded", padding: 1, width: 40 }}>
          <Label style={{ dim: true }}>No title — top border is untouched.</Label>
        </Box>
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const boxTitleDemo: Demo = {
  id: "box-title",
  title: "Box Title",
  group: "Layout",
  description: "Titled box containers.",
  Component: BoxTitleDemo,
};
