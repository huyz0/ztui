import { useEffect, useState } from "react";
import {
  App,
  Button,
  Dock,
  Footer,
  HBox,
  Header,
  HeroicIcon,
  Icon,
  iconRegistry,
  Label,
  render,
  Spacing,
  VBox,
} from "../src/index.ts";

iconRegistry.registerIcons([
  {
    name: "home",
    svg: `<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/></svg>`,
    textFallback: "🏠",
  },
  {
    name: "settings",
    svg: `<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" fill="currentColor"/></svg>`,
    textFallback: "⚙️",
  },
  {
    name: "alert",
    svg: `<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/></svg>`,
    textFallback: "⚠️",
  },
]);

// Base64 of a 1x1 red PNG pixel
const RED_PIXEL_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function AdvancedProtocolsApp() {
  const [badgeText, setBadgeText] = useState("ZTUI-ACTIVE");
  const [protocolInfo, setProtocolInfo] = useState<string[]>([
    "Truecolor: Detecting...",
    "KittyKeys: Detecting...",
    "Hover: Detecting...",
    "Graphics: Detecting...",
    "Hyperlinks: Detecting...",
    "Glyphs: Detecting...",
    "Clipboard: Detecting...",
    "Notifications: Detecting...",
  ]);
  const [clipStatus, setClipStatus] = useState("Copy to Clipboard (OSC 52)");

  useEffect(() => {
    const caps = App.instance?.driver?.capabilities;
    if (caps) {
      setProtocolInfo([
        `Truecolor: ${caps.truecolor ? "Yes" : "No"}`,
        `KittyKeys: ${caps.kittyKeyboard ? "Yes" : "No"}`,
        `Hover: ${caps.mouseHover ? "Yes" : "No"}`,
        `Graphics: ${caps.graphicsProtocol}`,
        `Hyperlinks: ${caps.hyperlinks ? "Yes" : "No"}`,
        `Glyphs: ${caps.glyphProtocol ? "Yes" : "No"}`,
        `Clipboard: ${caps.clipboard ? "Yes" : "No"}`,
        `Notifications: ${caps.notifications ? "Yes" : "No"}`,
      ]);
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
      } else if (protocol === "sixel") {
        // Sixel Graphics protocol sequence
        driver.write("\n\x1bPq#0;2;100;0;0#0~~@@~~@@\x1b\\\n");
      } else {
        // Graceful fallback: Draw unicode graphics block
        driver.write("\n\x1b[31m██████████ (Fallback Unicode Pixel Block)\x1b[39m\n");
      }
    }
  };

  const handleClipboardCopy = () => {
    const driver = App.instance?.driver;
    if (driver) {
      driver.clipboard.set("Hello from ZTUI Clipboard!");
      setClipStatus("Copied to Clipboard!");
      setTimeout(() => setClipStatus("Copy to Clipboard (OSC 52)"), 2000);
    }
  };

  const handleTriggerNotification = () => {
    const driver = App.instance?.driver;
    if (driver) {
      driver.showNotification("ZTUI Alert", "This is a test notification from ZTUI!");
    }
  };

  return (
    <Dock style={{ background: "#1e1e2e" }}>
      <Header>🚀 ZTUI Advanced Terminal Protocols & Graceful Fallbacks</Header>

      <Footer>
        Click buttons to test OS integration. Font formats / Links degrade gracefully when
        unsupported.
      </Footer>

      <HBox style={{ padding: 1 }}>
        {/* Left Column - Hyperlinks, Font Formats & Capabilities */}
        <VBox style={{ width: "50%", border: "solid", padding: 1 }}>
          <Label style={{ color: "#cba6f7", bold: true }}>1. Font Formats (SGR 1/2/3/4/9)</Label>
          <HBox style={{ margin: new Spacing(0, 1, 0, 1) }}>
            <Label style={{ bold: true }}>Bold </Label>
            <Label style={{ italic: true }}>Italic </Label>
            <Label style={{ underline: true }}>Underline </Label>
            <Label style={{ dim: true }}>Dim </Label>
            <Label style={{ strikethrough: true }}>Strike </Label>
            <Label style={{ underline: true, strikethrough: true }}>Both</Label>
          </HBox>

          <Label style={{ color: "#cba6f7", bold: true, margin: new Spacing(1, 0, 0, 0) }}>
            2. OSC 8 Hyperlinks
          </Label>
          <Label
            style={{
              color: "#89b4fa",
              link: "https://ghostty.org",
              margin: new Spacing(0, 1, 0, 1),
            }}
          >
            👉 Open Ghostty Webpage (Ctrl+Click)
          </Label>
          <Label
            style={{
              color: "#a6e3a1",
              link: "https://github.com",
              margin: new Spacing(0, 1, 0, 1),
            }}
          >
            👉 Open GitHub (Ctrl+Click)
          </Label>

          <Label style={{ color: "#cba6f7", bold: true, margin: new Spacing(1, 0, 0, 0) }}>
            3. SVG Icons (Vector/Raster Cache) & Heroicons
          </Label>
          <HBox style={{ margin: new Spacing(0, 1, 0, 1), height: 1 }}>
            <Icon name="home" style={{ color: "#a6e3a1" }} />
            <Label> Home </Label>
            <Icon name="settings" style={{ color: "#89b4fa" }} />
            <Label> Settings </Label>
            <HeroicIcon name="beaker" variant="solid" style={{ color: "#f9e2af" }} />
            <Label> Solid Beaker </Label>
            <HeroicIcon name="heart" variant="outline" style={{ color: "#f38ba8" }} />
            <Label> Outline Heart </Label>
            <HeroicIcon name="bell" variant="mini" style={{ color: "#cba6f7" }} />
            <Label> Mini Bell </Label>
          </HBox>

          <Label style={{ color: "#f9e2af", bold: true, margin: new Spacing(1, 0, 0, 0) }}>
            4. Probed Capabilities
          </Label>
          <HBox style={{ margin: new Spacing(0, 1, 0, 1), height: 4 }}>
            <VBox style={{ width: "50%" }}>
              {protocolInfo.slice(0, 4).map((line) => (
                <Label key={line} style={{ color: "#cdd6f4" }}>
                  {line}
                </Label>
              ))}
            </VBox>
            <VBox style={{ width: "50%" }}>
              {protocolInfo.slice(4).map((line) => (
                <Label key={line} style={{ color: "#cdd6f4" }}>
                  {line}
                </Label>
              ))}
            </VBox>
          </HBox>
        </VBox>

        {/* Right Column - OS Integration & Media */}
        <VBox style={{ width: "50%", border: "solid", padding: 1 }}>
          <Label style={{ color: "#f5e0dc", bold: true }}>5. OS Integration & Media</Label>

          <HBox style={{ margin: new Spacing(0, 1, 1, 1) }}>
            <Button
              style={{
                background: "#fab387",
                color: "black",
                flexGrow: 1,
                margin: new Spacing(0, 1, 0, 0),
              }}
              onClick={handleClipboardCopy}
            >
              {clipStatus}
            </Button>

            <Button
              style={{ background: "#fab387", color: "black", flexGrow: 1 }}
              onClick={handleTriggerNotification}
            >
              Show Notification
            </Button>
          </HBox>

          <Button
            style={{
              background: "#a6e3a1",
              color: "black",
              margin: new Spacing(0, 1, 1, 1),
            }}
            onClick={handleRenderImage}
          >
            Render Image (Kitty/iTerm/Sixel/Fallback)
          </Button>

          <Button
            style={{
              background: "#fab387",
              color: "black",
              margin: new Spacing(0, 1, 1, 1),
            }}
            onClick={handleSetBadge}
          >
            Set Terminal Window Badge ({badgeText})
          </Button>

          <Button
            style={{
              background: "#f38ba8",
              color: "black",
              margin: new Spacing(0, 1, 0, 1),
            }}
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
function _View({ style, children }: { style?: any; children?: any }) {
  return <VBox style={style}>{children}</VBox>;
}

// Run the application
const app = new App();
render(<AdvancedProtocolsApp />, app.activeScreen);
app.run();
