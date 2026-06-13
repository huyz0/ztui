import { useState } from "react";
import {
  Button,
  Dock,
  Footer,
  HBox,
  Header,
  HeroIcon,
  Label,
  Spacing,
  VBox,
  View,
} from "../src/index.ts";
import type { Demo } from "./gallery/types.ts";

function HeroiconsDemo() {
  const [activeColor, setActiveColor] = useState("$secondary");
  const colors = ["$secondary", "$success", "$warning", "$error", "$primary", "$accent"];

  const cycleColor = () => {
    const nextIdx = (colors.indexOf(activeColor) + 1) % colors.length;
    setActiveColor(colors[nextIdx]);
  };

  // A demo Component doesn't own process lifecycle (the launcher / global Ctrl+C
  // handles clean shutdown), so Exit just terminates when run standalone.
  const handleExit = () => process.exit(0);

  return (
    <Dock style={{ background: "$surface" }}>
      <Header>✨ ZTUI Heroicons Gallery Demo</Header>

      <Footer>Cycle Color / click Exit │ Exit with CTRL+C</Footer>

      <VBox style={{ padding: 1 }}>
        <HBox style={{ height: 3, margin: new Spacing(0, 0, 1, 0) }}>
          <Button style={{ width: 25, background: activeColor }} onClick={cycleColor}>
            🎨 Cycle Icon Color
          </Button>
          <View style={{ width: 2 }} />
          <Button style={{ width: 20, background: "$error" }} onClick={handleExit}>
            ❌ Exit
          </Button>
        </HBox>

        <VBox style={{ flexGrow: 1, border: "rounded", padding: 1 }}>
          <Label style={{ color: "$foreground", bold: true }}>1. Solid Style (24x24 px)</Label>
          <HBox style={{ height: 1, margin: new Spacing(0, 0, 1, 0) }}>
            <HeroIcon name="home" variant="solid" style={{ color: activeColor }} />
            <Label> Home </Label>
            <HeroIcon name="beaker" variant="solid" style={{ color: activeColor }} />
            <Label> Beaker </Label>
            <HeroIcon name="bell" variant="solid" style={{ color: activeColor }} />
            <Label> Bell </Label>
            <HeroIcon name="heart" variant="solid" style={{ color: activeColor }} />
            <Label> Heart </Label>
            <HeroIcon name="cog" variant="solid" style={{ color: activeColor }} />
            <Label> Cog </Label>
          </HBox>

          <Label style={{ color: "$foreground", bold: true }}>2. Outline Style (24x24 px)</Label>
          <HBox style={{ height: 1, margin: new Spacing(0, 0, 1, 0) }}>
            <HeroIcon name="home" variant="outline" style={{ color: activeColor }} />
            <Label> Home </Label>
            <HeroIcon name="beaker" variant="outline" style={{ color: activeColor }} />
            <Label> Beaker </Label>
            <HeroIcon name="bell" variant="outline" style={{ color: activeColor }} />
            <Label> Bell </Label>
            <HeroIcon name="heart" variant="outline" style={{ color: activeColor }} />
            <Label> Heart </Label>
            <HeroIcon name="cog" variant="outline" style={{ color: activeColor }} />
            <Label> Cog </Label>
          </HBox>

          <Label style={{ color: "$foreground", bold: true }}>
            3. Mini Style (20x20 px, Solid)
          </Label>
          <HBox style={{ height: 1, margin: new Spacing(0, 0, 1, 0) }}>
            <HeroIcon name="home" variant="mini" style={{ color: activeColor }} />
            <Label> Home </Label>
            <HeroIcon name="beaker" variant="mini" style={{ color: activeColor }} />
            <Label> Beaker </Label>
            <HeroIcon name="bell" variant="mini" style={{ color: activeColor }} />
            <Label> Bell </Label>
            <HeroIcon name="heart" variant="mini" style={{ color: activeColor }} />
            <Label> Heart </Label>
            <HeroIcon name="cog" variant="mini" style={{ color: activeColor }} />
            <Label> Cog </Label>
          </HBox>

          <Label style={{ color: "$foreground", bold: true }}>
            4. Micro Style (16x16 px, Solid)
          </Label>
          <HBox style={{ height: 1 }}>
            <HeroIcon name="home" variant="micro" style={{ color: activeColor }} />
            <Label> Home </Label>
            <HeroIcon name="beaker" variant="micro" style={{ color: activeColor }} />
            <Label> Beaker </Label>
            <HeroIcon name="bell" variant="micro" style={{ color: activeColor }} />
            <Label> Bell </Label>
            <HeroIcon name="heart" variant="micro" style={{ color: activeColor }} />
            <Label> Heart </Label>
            <HeroIcon name="cog" variant="micro" style={{ color: activeColor }} />
            <Label> Cog </Label>
          </HBox>
        </VBox>
      </VBox>
    </Dock>
  );
}

export const heroiconsDemo: Demo = {
  id: "heroicons",
  title: "Heroicons",
  group: "Media",
  description: "SVG icons rasterized to the terminal graphics protocol.",
  requires: ["graphics"],
  Component: HeroiconsDemo,
};
