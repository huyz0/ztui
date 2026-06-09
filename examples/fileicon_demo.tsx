import { useEffect, useState } from "react";
import {
  App,
  Button,
  Dock,
  FileIcon,
  Footer,
  HBox,
  Header,
  Label,
  loadSetiIcons,
  render,
  resolveFileIcon,
  VBox,
  View,
} from "../src/index.ts";

const sampleFiles = [
  { name: "package.json", isFolder: false },
  { name: "tsconfig.json", isFolder: false },
  { name: "biome.json", isFolder: false },
  { name: "src", isFolder: true },
  { name: "src/index.ts", isFolder: false },
  { name: "src/widgets/seti/seti-loader.ts", isFolder: false },
  { name: "src/react/components/file-icon.tsx", isFolder: false },
  { name: "README.md", isFolder: false },
  { name: "logo.png", isFolder: false },
  { name: "styles.css", isFolder: false },
  { name: "Makefile", isFolder: false },
  { name: "cargo.toml", isFolder: false },
  { name: "main.rs", isFolder: false },
  { name: "index.html", isFolder: false },
  { name: "dockerfile", isFolder: false },
  { name: "server.go", isFolder: false },
  { name: "script.sh", isFolder: false },
  { name: "config.yaml", isFolder: false },
];

function FileIconDemo() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [graphicsProtocol, setGraphicsProtocol] = useState<string>("none");
  const [glyphSupport, setGlyphSupport] = useState<boolean>(false);

  // Initialize/resolve capabilities on mount
  useEffect(() => {
    // Automatically load Seti icons
    try {
      loadSetiIcons();
    } catch (err) {
      console.error("Failed to load Seti icons:", err);
    }

    if (App.instance) {
      setGraphicsProtocol(App.instance.driver.capabilities.graphicsProtocol);
      setGlyphSupport(App.instance.driver.capabilities.glyphProtocol);
    }
  }, []);

  const handleKey = (ev: any) => {
    if (ev.name === "up") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      ev.handled = true;
    } else if (ev.name === "down") {
      setSelectedIndex((prev) => Math.min(sampleFiles.length - 1, prev + 1));
      ev.handled = true;
    }
  };

  const handleExit = () => {
    App.instance?.stop();
    process.exit(0);
  };

  const selectedFile = sampleFiles[selectedIndex];
  const resolved = resolveFileIcon(selectedFile.name, selectedFile.isFolder);

  return (
    <Dock style={{ background: "#1e1e2e" }}>
      <Header>📁 ZTUI VS Code Seti File Icons Explorer</Header>

      <Footer>
        Use Up/Down Arrow keys to select file │ Tab: Move Focus │ Exit with Exit Button or CTRL+C
      </Footer>

      <HBox style={{ flexGrow: 1, padding: 1 }}>
        {/* Left Panel: Interactive File List */}
        <VBox
          focusable={true}
          onKey={handleKey}
          style={{
            width: 40,
            border: "rounded",
            borderColor: "#cba6f7",
            padding: 1,
            background: "#181825",
          }}
        >
          <Label style={{ color: "#cba6f7", bold: true }}>🗁 Workspace Files</Label>
          <View style={{ height: 1 }} />

          <VBox style={{ flexGrow: 1 }}>
            {sampleFiles.map((file, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <HBox
                  key={file.name}
                  onClick={() => setSelectedIndex(idx)}
                  style={{
                    height: 1,
                    background: isSelected ? "#313244" : "transparent",
                  }}
                >
                  <FileIcon filename={file.name} isFolder={file.isFolder} />
                  <Label
                    style={{
                      color: isSelected ? "#f5e0dc" : "#cdd6f4",
                      bold: isSelected,
                    }}
                  >
                    {` ${file.name}`}
                  </Label>
                </HBox>
              );
            })}
          </VBox>
        </VBox>

        <View style={{ width: 2 }} />

        {/* Right Panel: Detail Card & Preview */}
        <VBox
          style={{
            flexGrow: 1,
            border: "rounded",
            borderColor: "#89b4fa",
            padding: 1,
            background: "#181825",
          }}
        >
          <Label style={{ color: "#89b4fa", bold: true }}>🔍 Icon Resolution Details</Label>
          <View style={{ height: 1 }} />

          <VBox style={{ border: "dashed", borderColor: "gray", padding: 1, height: 12 }}>
            <HBox style={{ height: 1 }}>
              <Label style={{ color: "#a6e3a1", bold: true }}>Selected File: </Label>
              <Label style={{ color: "#cdd6f4" }}>{selectedFile.name}</Label>
            </HBox>
            <HBox style={{ height: 1 }}>
              <Label style={{ color: "#a6e3a1", bold: true }}>Is Directory: </Label>
              <Label style={{ color: "#cdd6f4" }}>{selectedFile.isFolder ? "Yes" : "No"}</Label>
            </HBox>

            <View style={{ height: 1 }} />

            <HBox style={{ height: 1 }}>
              <Label style={{ color: "#f9e2af", bold: true }}>Icon Name: </Label>
              <Label style={{ color: "#cdd6f4" }}>{resolved.name}</Label>
            </HBox>
            <HBox style={{ height: 1 }}>
              <Label style={{ color: "#f9e2af", bold: true }}>Theme Color: </Label>
              <Label style={{ color: resolved.color }}>{resolved.color}</Label>
            </HBox>

            <View style={{ height: 1 }} />

            <HBox style={{ height: 1 }}>
              <Label style={{ color: "#cba6f7", bold: true }}>Preview: </Label>
              <FileIcon filename={selectedFile.name} isFolder={selectedFile.isFolder} />
            </HBox>
          </VBox>

          <View style={{ height: 1 }} />

          {/* Terminal Capabilities Status */}
          <Label style={{ color: "#f5c2e7", bold: true }}>🖥 Terminal Capabilities</Label>
          <VBox style={{ padding: 1, background: "#11111b" }}>
            <Label style={{ color: "#cdd6f4" }}>
              • Graphics Protocol:{" "}
              <Label style={{ color: graphicsProtocol !== "none" ? "#a6e3a1" : "#f38ba8" }}>
                {graphicsProtocol.toUpperCase()}
              </Label>
            </Label>
            <Label style={{ color: "#cdd6f4" }}>
              • Glyph Protocol:{" "}
              <Label style={{ color: glyphSupport ? "#a6e3a1" : "#f38ba8" }}>
                {glyphSupport ? "SUPPORTED" : "UNSUPPORTED"}
              </Label>
            </Label>
          </VBox>

          <View style={{ height: "fr" }} />

          <Button
            onClick={handleExit}
            style={{
              width: 15,
              height: 1,
              background: "#f38ba8",
              color: "black",
              align: "center",
            }}
          >
            ❌ Exit
          </Button>
        </VBox>
      </HBox>
    </Dock>
  );
}

const app = new App();
render(<FileIconDemo />, app.activeScreen);
app.run();
