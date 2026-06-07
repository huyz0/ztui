import { appendFileSync } from "node:fs";
import React, { useState } from "react";
import {
  App,
  Button,
  Dock,
  Footer,
  HBox,
  Header,
  HeroicIcon,
  Label,
  Spacing,
  VBox,
  View,
  render,
} from "../src/index.ts";

process.on("unhandledRejection", (reason) => {
  try {
    appendFileSync(
      "ztui.log",
      `[${new Date().toISOString()}] Unhandled Rejection: ${reason instanceof Error ? reason.stack : reason}\n`,
    );
  } catch {}
});

process.on("uncaughtException", (error) => {
  try {
    appendFileSync(
      "ztui.log",
      `[${new Date().toISOString()}] Uncaught Exception: ${error?.stack || error}\n`,
    );
  } catch {}
  process.exit(1);
});

function HeroiconsDemo() {
  const [activeColor, setActiveColor] = useState("#89b4fa");
  const colors = ["#89b4fa", "#a6e3a1", "#f9e2af", "#f38ba8", "#cba6f7", "#f5c2e7"];

  const cycleColor = () => {
    const nextIdx = (colors.indexOf(activeColor) + 1) % colors.length;
    setActiveColor(colors[nextIdx]);
  };

  const handleExit = () => {
    App.instance?.stop();
    process.exit(0);
  };

  return (
    <Dock style={{ background: "#11111b" }}>
      <Header>✨ ZTUI Heroicons Gallery Demo</Header>

      <Footer>Cycle Color / click Exit │ Exit with CTRL+C</Footer>

      <VBox style={{ padding: 1 }}>
        <HBox style={{ height: 3, margin: new Spacing(0, 0, 1, 0) }}>
          <Button
            style={{ width: 25, background: activeColor, color: "black" }}
            onClick={cycleColor}
          >
            🎨 Cycle Icon Color
          </Button>
          <View style={{ width: 2 }} />
          <Button style={{ width: 20, background: "#f38ba8", color: "black" }} onClick={handleExit}>
            ❌ Exit
          </Button>
        </HBox>

        <VBox style={{ flexGrow: 1, border: "single", padding: 1 }}>
          <Label style={{ color: "#f5e0dc", bold: true }}>1. Solid Style (24x24 px)</Label>
          <HBox style={{ height: 1, margin: new Spacing(0, 0, 1, 0) }}>
            <HeroicIcon name="home" variant="solid" style={{ color: activeColor }} />
            <Label> Home </Label>
            <HeroicIcon name="beaker" variant="solid" style={{ color: activeColor }} />
            <Label> Beaker </Label>
            <HeroicIcon name="bell" variant="solid" style={{ color: activeColor }} />
            <Label> Bell </Label>
            <HeroicIcon name="heart" variant="solid" style={{ color: activeColor }} />
            <Label> Heart </Label>
            <HeroicIcon name="cog" variant="solid" style={{ color: activeColor }} />
            <Label> Cog </Label>
          </HBox>

          <Label style={{ color: "#f5e0dc", bold: true }}>2. Outline Style (24x24 px)</Label>
          <HBox style={{ height: 1, margin: new Spacing(0, 0, 1, 0) }}>
            <HeroicIcon name="home" variant="outline" style={{ color: activeColor }} />
            <Label> Home </Label>
            <HeroicIcon name="beaker" variant="outline" style={{ color: activeColor }} />
            <Label> Beaker </Label>
            <HeroicIcon name="bell" variant="outline" style={{ color: activeColor }} />
            <Label> Bell </Label>
            <HeroicIcon name="heart" variant="outline" style={{ color: activeColor }} />
            <Label> Heart </Label>
            <HeroicIcon name="cog" variant="outline" style={{ color: activeColor }} />
            <Label> Cog </Label>
          </HBox>

          <Label style={{ color: "#f5e0dc", bold: true }}>3. Mini Style (20x20 px, Solid)</Label>
          <HBox style={{ height: 1, margin: new Spacing(0, 0, 1, 0) }}>
            <HeroicIcon name="home" variant="mini" style={{ color: activeColor }} />
            <Label> Home </Label>
            <HeroicIcon name="beaker" variant="mini" style={{ color: activeColor }} />
            <Label> Beaker </Label>
            <HeroicIcon name="bell" variant="mini" style={{ color: activeColor }} />
            <Label> Bell </Label>
            <HeroicIcon name="heart" variant="mini" style={{ color: activeColor }} />
            <Label> Heart </Label>
            <HeroicIcon name="cog" variant="mini" style={{ color: activeColor }} />
            <Label> Cog </Label>
          </HBox>

          <Label style={{ color: "#f5e0dc", bold: true }}>4. Micro Style (16x16 px, Solid)</Label>
          <HBox style={{ height: 1 }}>
            <HeroicIcon name="home" variant="micro" style={{ color: activeColor }} />
            <Label> Home </Label>
            <HeroicIcon name="beaker" variant="micro" style={{ color: activeColor }} />
            <Label> Beaker </Label>
            <HeroicIcon name="bell" variant="micro" style={{ color: activeColor }} />
            <Label> Bell </Label>
            <HeroicIcon name="heart" variant="micro" style={{ color: activeColor }} />
            <Label> Heart </Label>
            <HeroicIcon name="cog" variant="micro" style={{ color: activeColor }} />
            <Label> Cog </Label>
          </HBox>
        </VBox>
      </VBox>
    </Dock>
  );
}

const app = new App();
render(<HeroiconsDemo />, app.activeScreen);
app.run({ inspectorPort: 8001 });
