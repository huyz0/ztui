import {
  App,
  Footer,
  HBox,
  Header,
  Label,
  render,
  StatusBadge,
  StatusDot,
  StatusList,
  type StatusState,
  VBox,
} from "../src/index.ts";

// Showcases the status indicators: single-cell StatusDot across glyph sets,
// the StatusBadge / StatusPill chips, and a StatusList task column.

const states: StatusState[] = [
  "active",
  "inactive",
  "ongoing",
  "pending",
  "completed",
  "warning",
  "failed",
];

const card = {
  border: "rounded",
  borderColor: "$panel",
  padding: 1,
  margin: { right: 2 },
} as const;

function StatusDemo() {
  return (
    <VBox style={{ background: "$surface", padding: 1 }}>
      <Header>◍ ZTUI Status Indicators</Header>
      <Footer>Ctrl+C quit</Footer>

      <Label style={{ color: "$foreground", bold: true, margin: { top: 1 } }}>
        StatusDot — single cell, three glyph sets
      </Label>
      <HBox style={{ padding: { top: 1, bottom: 1 } }}>
        {(["unicode", "ascii", "emoji"] as const).map((glyphSet) => (
          <VBox key={glyphSet} style={card}>
            <HBox>
              {states.map((state) => (
                <HBox key={state} style={{ margin: { right: 1 } }}>
                  <StatusDot state={state} glyphSet={glyphSet} />
                </HBox>
              ))}
            </HBox>
            <Label style={{ color: "$dimmed", margin: { top: 1 } }}>{glyphSet}</Label>
          </VBox>
        ))}
      </HBox>

      <Label style={{ color: "$foreground", bold: true }}>StatusBadge — glyph + label</Label>
      <HBox style={{ padding: { top: 1, bottom: 1 } }}>
        {states.map((state) => (
          <StatusBadge key={state} state={state} style={{ margin: { right: 3 } }} />
        ))}
      </HBox>

      <Label style={{ color: "$foreground", bold: true }}>StatusList — task column</Label>
      <HBox style={{ padding: { top: 1 } }}>
        <VBox style={card}>
          <StatusList
            items={[
              { state: "completed", label: "build", detail: "compiled in 4.2s" },
              { state: "ongoing", label: "test", detail: "running 142/200" },
              { state: "pending", label: "deploy", detail: "queued" },
              { state: "warning", label: "lint", detail: "3 warnings" },
              { state: "failed", label: "e2e", detail: "2 assertions failed" },
              { state: "inactive", label: "release", detail: "inactive" },
            ]}
          />
        </VBox>
        <VBox style={card}>
          <StatusList
            glyphSet="emoji"
            items={[
              { state: "completed", label: "build", detail: "compiled in 4.2s" },
              { state: "ongoing", label: "test", detail: "running 142/200" },
              { state: "pending", label: "deploy", detail: "queued" },
              { state: "failed", label: "e2e", detail: "2 assertions failed" },
            ]}
          />
        </VBox>
      </HBox>
    </VBox>
  );
}

const app = new App();
render(<StatusDemo />, app.activeScreen);
app.run();
