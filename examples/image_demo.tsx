import React from "react";
import {
  App,
  Button,
  Dock,
  Footer,
  HBox,
  Header,
  Image,
  Label,
  SvgImage,
  VBox,
  View,
  render,
} from "../src/index.ts";

// A beautiful, premium gradient SVG featuring a colorful background, circle, and text
const BEAUTIFUL_SVG = `
<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lavenderPink" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ff007f;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#7f00ff;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="15" fill="url(#lavenderPink)"/>
  <circle cx="50" cy="50" r="25" fill="#a6e3a1"/>
  <circle cx="50" cy="50" r="18" fill="#1e1e2e"/>
  <polygon points="50,38 53,46 62,46 55,51 57,59 50,54 43,59 45,51 38,46 47,46" fill="#f9e2af"/>
</svg>
`;

// 1x1 transparent PNG data-url
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function ImageDemoApp() {
  const handleExit = () => {
    App.instance?.stop();
    process.exit(0);
  };

  return (
    <Dock style={{ background: "#1e1e2e" }}>
      {/* Header with premium styling */}
      <Header style={{ background: "#313244", color: "#cba6f7" }}>
        🎨 ZTUI Image & SVG Rendering Engine Demo
      </Header>

      {/* Footer */}
      <Footer style={{ background: "#313244", color: "#a6adc8" }}>
        Interactive TUI • Supports Kitty / iTerm2 / Sixel • Graceful Half-Block Fallback
      </Footer>

      {/* Main Content Layout */}
      <HBox style={{ padding: 1 }}>
        {/* Left Side: SVG Image Demo */}
        <VBox style={{ width: "50%", border: "double", borderColor: "#89b4fa", padding: 1 }}>
          <Label style={{ color: "#89b4fa", bold: true }}>⚡ Vector Graphics (SVG)</Label>
          <View style={{ height: 1 }} />

          {/* Beautiful SVG Image Components side-by-side */}
          <HBox style={{ width: "100%" }}>
            <VBox style={{ flexGrow: 1, align: "center", margin: 1 }}>
              <Label style={{ color: "#cba6f7", bold: true }}>Protocol</Label>
              <SvgImage
                src={BEAUTIFUL_SVG}
                style={{
                  width: 10,
                  height: 5,
                  margin: 1,
                }}
              />
            </VBox>
            <VBox style={{ flexGrow: 1, align: "center", margin: 1 }}>
              <Label style={{ color: "#fab387", bold: true }}>ANSI</Label>
              <SvgImage
                src={BEAUTIFUL_SVG}
                ansi={true}
                style={{
                  width: 10,
                  height: 5,
                  margin: 1,
                }}
              />
            </VBox>
          </HBox>

          <View style={{ height: 1 }} />
          <Label style={{ color: "#a6adc8" }}>Renders dynamically using @resvg/resvg-js</Label>
        </VBox>

        {/* Right Side: Raster Image Demo */}
        <VBox style={{ width: "50%", border: "double", borderColor: "#f9e2af", padding: 1 }}>
          <Label style={{ color: "#f9e2af", bold: true }}>
            🖼️ Raster Graphics (PNG / JPEG / GIF)
          </Label>
          <View style={{ height: 1 }} />

          {/* Transparent PNG components side-by-side */}
          <HBox style={{ width: "100%" }}>
            <VBox style={{ flexGrow: 1, align: "center", margin: 1 }}>
              <Label style={{ color: "#cba6f7", bold: true }}>Protocol</Label>
              <Image
                src={TINY_PNG_DATA_URL}
                style={{
                  width: 10,
                  height: 5,
                  margin: 1,
                  background: "#ff007f", // Background highlights the single transparent pixel scaling
                }}
              />
            </VBox>
            <VBox style={{ flexGrow: 1, align: "center", margin: 1 }}>
              <Label style={{ color: "#fab387", bold: true }}>ANSI</Label>
              <Image
                src={TINY_PNG_DATA_URL}
                ansi={true}
                style={{
                  width: 10,
                  height: 5,
                  margin: 1,
                  background: "#ff007f", // Background highlights the single transparent pixel scaling
                }}
              />
            </VBox>
          </HBox>

          <View style={{ height: 2 }} />
          <Button
            style={{ background: "#f38ba8", color: "#1e1e2e", bold: true, align: "center" }}
            onClick={handleExit}
          >
            Exit Application
          </Button>
        </VBox>
      </HBox>
    </Dock>
  );
}

// Instantiate and run the App
const app = new App();
render(<ImageDemoApp />, app.activeScreen);
app.run();
