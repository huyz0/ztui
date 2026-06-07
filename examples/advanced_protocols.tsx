import React, { useState, useEffect } from "react";
import { App, Button, Dock, Footer, HBox, Header, Label, VBox, render } from "../src/index.ts";

// Base64 of a 1x1 red PNG pixel
const RED_PIXEL_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function AdvancedProtocolsApp() {
  const [badgeText, setBadgeText] = useState("ZTUI-ACTIVE");
  const [protocolInfo, setProtocolInfo] = useState("Detecting protocols...");

  useEffect(() => {
    const caps = App.instance?.driver?.capabilities;
    if (caps) {
      setProtocolInfo(
        `Truecolor: ${caps.truecolor} │ KittyKeys: ${caps.kittyKeyboard} │ Hover: ${caps.mouseHover} │ Graphics: ${caps.graphicsProtocol} │ Hyperlinks: ${caps.hyperlinks} │ Glyphs: ${caps.glyphProtocol}`,
      );
    }
  }, []);

  const handleExit = () => {
    App.instance?.stop();
    process.exit(0);
  };

  const handleSetBadge = () => {
    const driver = App.instance?.driver;
    if (driver) {
      const newBadge = `ZTUI-${Math.floor(Math.random() * 9000 + 1000)}`;
      setBadgeText(newBadge);
      // iTerm2 badge escape sequence: SetBadgeFormat=<base64>
      const base64Badge = Buffer.from(newBadge).toString("base64");
      driver.write(`\x1b]1337;SetBadgeFormat=${base64Badge}\x07`);
    }
  };

  const handleRenderImage = () => {
    const driver = App.instance?.driver;
    if (driver) {
      const protocol = driver.capabilities.graphicsProtocol;
      if (protocol === "kitty") {
        // Kitty Graphics protocol sequence
        driver.write(`\n\x1b_Gf=100,a=T,t=d,s=1,v=1;${RED_PIXEL_BASE64}\x1b\\\n`);
      } else if (protocol === "iterm2") {
        // iTerm2 Graphics protocol sequence
        driver.write(`\n\x1b]1337;File=inline=1;width=10;height=5:${RED_PIXEL_BASE64}\x07\n`);
      } else {
        // Graceful fallback: Draw unicode graphics block
        driver.write("\n\x1b[31m██████████ (Fallback Unicode Pixel Block)\x1b[39m\n");
      }
    }
  };

  return (
    <Dock style={{ background: "#1e1e2e" }}>
      <Header>🚀 ZTUI Advanced Terminal Protocols & Graceful Fallbacks</Header>

      <Footer>
        Click button to test image/badge sequences. Links degrade to standard underlined texts.
      </Footer>

      <HBox style={{ padding: 1 }}>
        {/* Left Column - Hyperlinks & Capabilities */}
        <VBox style={{ width: "50%", border: "solid", padding: 1 }}>
          <Label style={{ color: "#cba6f7", bold: true }}>1. OSC 8 Hyperlinks</Label>
          <Label style={{ color: "#89b4fa", link: "https://ghostty.org", margin: 1 }}>
            👉 Open Ghostty Webpage (Ctrl+Click)
          </Label>
          <Label style={{ color: "#a6e3a1", link: "https://github.com", margin: 1 }}>
            👉 Open GitHub (Ctrl+Click)
          </Label>

          <View style={{ height: 1 }} />

          <Label style={{ color: "#f9e2af", bold: true }}>2. Probed Capabilities</Label>
          <Label style={{ color: "#cdd6f4", margin: 1 }}>{protocolInfo}</Label>
        </VBox>

        {/* Right Column - Images & Badges */}
        <VBox style={{ width: "50%", border: "solid", padding: 1 }}>
          <Label style={{ color: "#f5e0dc", bold: true }}>
            3. Images & Badges (WezTerm/iTerm2/Ghostty)
          </Label>

          <Button
            style={{ height: 3, background: "#fab387", color: "black", margin: 1 }}
            onClick={handleSetBadge}
          >
            Set Terminal Window Badge ({badgeText})
          </Button>

          <Button
            style={{ height: 3, background: "#a6e3a1", color: "black", margin: 1 }}
            onClick={handleRenderImage}
          >
            Render Image / Unicode Fallback Block
          </Button>

          <Button
            style={{ height: 3, background: "#f38ba8", color: "black", margin: 1 }}
            onClick={handleExit}
          >
            Exit Application
          </Button>
        </VBox>
      </HBox>
    </Dock>
  );
}

// Simple View wrapper for vertical spacer
function View({ style, children }: { style?: any; children?: any }) {
  return <VBox style={style}>{children}</VBox>;
}

// Run the application
const app = new App();
render(<AdvancedProtocolsApp />, app.activeScreen);
app.run();
