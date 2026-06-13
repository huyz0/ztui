import { App } from "../src/core.ts";
import {
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
} from "../src/react.ts";

// Gradient-filled rounded rect with a `$success` ring (a `$background` inner
// circle cuts it out) and a `$warning` star — the theme tokens resolve at render.
const BEAUTIFUL_SVG = `
<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lavenderPink" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ff007f;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#7f00ff;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="15" fill="url(#lavenderPink)"/>
  <circle cx="50" cy="50" r="25" fill="$success"/>
  <circle cx="50" cy="50" r="18" fill="$background"/>
  <polygon points="50,38 53,46 62,46 55,51 57,59 50,54 43,59 45,51 38,46 47,46" fill="$warning"/>
</svg>
`;

// 1x1 PNG: a single green pixel at 50% alpha (RGBA 0,255,0,127). Scaled up over a
// solid background it exercises raster decode + bilinear scaling + alpha
// compositing — the half-transparent green blends with the bg into olive.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function ImageDemoApp() {
  const handleExit = () => {
    App.instance?.stop();
    process.exit(0);
  };

  return (
    <Dock style={{ background: "$background" }}>
      {/* Header with premium styling */}
      <Header style={{ background: "$panel", color: "$primary" }}>
        🎨 ZTUI Image & SVG Rendering Engine Demo
      </Header>

      {/* Footer */}
      <Footer style={{ background: "$panel", color: "$dimmed" }}>
        Interactive TUI • Supports Kitty / iTerm2 / Sixel • Graceful Half-Block Fallback
      </Footer>

      {/* Main Content Layout */}
      <HBox style={{ padding: 1 }}>
        {/* Left Side: SVG Image Demo */}
        <VBox style={{ width: "50%", border: "double", borderColor: "$secondary", padding: 1 }}>
          <Label style={{ color: "$secondary", bold: true }}>⚡ Vector Graphics (SVG)</Label>
          <View style={{ height: 1 }} />

          {/* Beautiful SVG Image Components side-by-side */}
          <HBox style={{ width: "100%" }}>
            <VBox style={{ flexGrow: 1, align: "center", margin: 1 }}>
              <Label style={{ color: "$primary", bold: true }}>Protocol</Label>
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
              <Label style={{ color: "$accent", bold: true }}>ANSI</Label>
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
          <Label style={{ color: "$dimmed" }}>
            Rasterized dynamically; `$theme` tokens resolve to the active palette
          </Label>
        </VBox>

        {/* Right Side: Raster Image Demo */}
        <VBox style={{ width: "50%", border: "double", borderColor: "$warning", padding: 1 }}>
          <Label style={{ color: "$warning", bold: true }}>
            🖼️ Raster Graphics (PNG / JPEG / GIF)
          </Label>
          <View style={{ height: 1 }} />

          {/* Half-alpha green PNG, scaled, side-by-side */}
          <HBox style={{ width: "100%" }}>
            <VBox style={{ flexGrow: 1, align: "center", margin: 1 }}>
              <Label style={{ color: "$primary", bold: true }}>Protocol</Label>
              <Image
                src={TINY_PNG_DATA_URL}
                style={{
                  width: 10,
                  height: 5,
                  margin: 1,
                  background: "#ff007f", // Blends the 50%-alpha green pixel over this bg (→ olive)
                }}
              />
            </VBox>
            <VBox style={{ flexGrow: 1, align: "center", margin: 1 }}>
              <Label style={{ color: "$accent", bold: true }}>ANSI</Label>
              <Image
                src={TINY_PNG_DATA_URL}
                ansi={true}
                style={{
                  width: 10,
                  height: 5,
                  margin: 1,
                  background: "#ff007f", // Blends the 50%-alpha green pixel over this bg (→ olive)
                }}
              />
            </VBox>
          </HBox>

          <View style={{ height: 2 }} />
          <Button
            style={{ background: "$error", color: "$background", bold: true, align: "center" }}
            onClick={handleExit}
          >
            Exit Application
          </Button>
        </VBox>
      </HBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const imageDemo: Demo = {
  id: "image",
  title: "Images",
  group: "Media",
  description: "Inline rasterized images.",
  requires: ["graphics"],
  Component: ImageDemoApp,
};
