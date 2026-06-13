import { App, Footer, HBox, Header, Label, render, VBox } from "../src/index.ts";

// Showcases the available border styles, including the new rounded corners
// (mirrors Textual's "round" border: solid edges, rounded corner glyphs).
const styles: Array<{ border: string; color: string; title: string }> = [
  { border: "solid", color: "$secondary", title: "solid" },
  { border: "rounded", color: "$success", title: "rounded" },
  { border: "double", color: "$warning", title: "double" },
  { border: "dashed", color: "$error", title: "dashed" },
];

function BorderDemo() {
  return (
    <VBox style={{ background: "$surface", padding: 1 }}>
      <Header>🟦 ZTUI Border Styles</Header>
      <Footer>Ctrl+C quit</Footer>

      <HBox style={{ padding: 1 }}>
        {styles.map((s) => (
          <VBox
            key={s.title}
            style={{
              border: s.border,
              borderColor: s.color,
              padding: 1,
              width: 18,
              height: 5,
              margin: { right: 2 },
            }}
          >
            <Label>{s.title}</Label>
            <Label style={{ color: "$dimmed" }}>border: "{s.border}"</Label>
          </VBox>
        ))}
      </HBox>
    </VBox>
  );
}

const app = new App();
render(<BorderDemo />, app.activeScreen);
app.run();
