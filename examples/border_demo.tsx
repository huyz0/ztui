import { App, Footer, HBox, Header, Label, render, VBox } from "../src/index.ts";

// Showcases the available border styles, including the new rounded corners
// (mirrors Textual's "round" border: solid edges, rounded corner glyphs).
const styles: Array<{ border: string; color: string; title: string }> = [
  { border: "solid", color: "#89b4fa", title: "solid" },
  { border: "rounded", color: "#a6e3a1", title: "rounded" },
  { border: "double", color: "#f9e2af", title: "double" },
  { border: "dashed", color: "#f38ba8", title: "dashed" },
];

function BorderDemo() {
  return (
    <VBox style={{ background: "#11111b", padding: 1 }}>
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
            <Label style={{ color: "#a6adc8" }}>border: "{s.border}"</Label>
          </VBox>
        ))}
      </HBox>
    </VBox>
  );
}

const app = new App();
render(<BorderDemo />, app.activeScreen);
app.run();
