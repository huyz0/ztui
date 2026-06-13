import { useState } from "react";
import { deriveTheme, Spacing, ThemeManager } from "../src/core.ts";
import { Button, Dock, Footer, HBox, Header, Input, Label, VBox, View } from "../src/react.ts";
import { ExitButton, quitHint } from "./exit-button.tsx";

function ThemeExplorerApp() {
  const _themes = [
    "default-dark",
    "default-light",
    "catppuccin-mocha",
    "catppuccin-macchiato",
    "catppuccin-frappe",
    "catppuccin-latte",
    "nord",
    "dracula",
    "gruvbox-dark",
    "gruvbox-light",
    "tokyo-night",
    "one-dark",
    "rose-pine",
    "monokai",
    "everforest",
    "solarized-dark",
    "solarized-light",
    "cobalt2",
    "poimandres",
    "kanagawa",
    "github-dark",
    "horizon",
    "nightfly",
    "derived-mocha-light",
    "derived-nord-dark",
  ];

  const [activeTheme, setActiveTheme] = useState("catppuccin-mocha");
  const [localTheme, setLocalTheme] = useState("catppuccin-latte");
  const [textInput, setTextInput] = useState("Type here...");

  // Register some derived themes for exploration
  const themeManager = ThemeManager.getInstance();
  const mocha = themeManager.getTheme("catppuccin-mocha");
  if (mocha && !themeManager.getTheme("derived-mocha-light")) {
    const derivedMocha = deriveTheme(mocha, "derived-mocha-light", { adjustLightness: 30 });
    themeManager.register(derivedMocha);
  }

  const nord = themeManager.getTheme("nord");
  if (nord && !themeManager.getTheme("derived-nord-dark")) {
    const derivedNord = deriveTheme(nord, "derived-nord-dark", { adjustLightness: -30 });
    themeManager.register(derivedNord);
  }

  const switchGlobalTheme = (name: string) => {
    themeManager.setTheme(name);
    setActiveTheme(name);
  };

  return (
    <Dock style={{ background: "$background" }}>
      {/* Header resolves from $primary (theme variable) */}
      <Header>🎨 ZTUI Theme Explorer</Header>

      <Footer>
        Tab: Cycle Focus │ Use Buttons to Switch Global / Local Themes{quitHint(" │ ")}
      </Footer>

      <HBox style={{ padding: 1 }}>
        {/* Left column: Theme controls */}
        <VBox style={{ width: "45%", border: "rounded", borderColor: "$secondary", padding: 1 }}>
          <Label style={{ bold: true, color: "$primary" }}>Global App Theme</Label>
          <Label style={{ color: "$foreground", dim: true }}>Active: {activeTheme}</Label>
          <View style={{ height: 1 }} />

          {/* Theme list scroll list simulation with buttons */}
          <VBox style={{ height: 11 }}>
            <HBox>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("catppuccin-mocha")}
              >
                Mocha
              </Button>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("catppuccin-latte")}
              >
                Latte
              </Button>
            </HBox>
            <HBox>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("nord")}
              >
                Nord
              </Button>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("dracula")}
              >
                Dracula
              </Button>
            </HBox>
            <HBox>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("gruvbox-dark")}
              >
                Gruvbox D
              </Button>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("gruvbox-light")}
              >
                Gruvbox L
              </Button>
            </HBox>
            <HBox>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("tokyo-night")}
              >
                Tokyo N.
              </Button>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("one-dark")}
              >
                One Dark
              </Button>
            </HBox>
            <HBox>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("rose-pine")}
              >
                Rose Pine
              </Button>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("monokai")}
              >
                Monokai
              </Button>
            </HBox>
            <HBox>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("everforest")}
              >
                Everforest
              </Button>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("solarized-dark")}
              >
                Solarized D
              </Button>
            </HBox>
            <HBox>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("solarized-light")}
              >
                Solarized L
              </Button>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("default-dark")}
              >
                Default D
              </Button>
            </HBox>
            <HBox>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("cobalt2")}
              >
                Cobalt2
              </Button>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("poimandres")}
              >
                Poimandres
              </Button>
            </HBox>
            <HBox>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("kanagawa")}
              >
                Kanagawa
              </Button>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("github-dark")}
              >
                GitHub D
              </Button>
            </HBox>
            <HBox>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("horizon")}
              >
                Horizon
              </Button>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("nightfly")}
              >
                Nightfly
              </Button>
            </HBox>
            <HBox>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("derived-mocha-light")}
              >
                Mocha +30%
              </Button>
              <Button
                style={{ margin: new Spacing(0, 1, 0, 1) }}
                onClick={() => switchGlobalTheme("derived-nord-dark")}
              >
                Nord -30%
              </Button>
            </HBox>
          </VBox>

          <View style={{ height: 1 }} />

          <ExitButton style={{ color: "$background", margin: new Spacing(0, 1, 0, 1) }}>
            Exit Explorer
          </ExitButton>
        </VBox>

        {/* Right column: Interactive widgets demonstrating variables & scoped themes */}
        <VBox style={{ width: "55%", padding: new Spacing(0, 0, 0, 1) }}>
          {/* Section 1: Standard variables */}
          <VBox style={{ border: "rounded", borderColor: "$secondary", padding: 1 }}>
            <Label style={{ bold: true, color: "$accent" }}>Standard Widget Elements</Label>
            <Label style={{ color: "$success" }}>✔ Success State Label ($success)</Label>
            <Label style={{ color: "$warning" }}>⚠ Warning State Label ($warning)</Label>
            <Label style={{ color: "$error" }}>✘ Error State Label ($error)</Label>
            <Input
              style={{ height: 3, background: "$panel", color: "$foreground", margin: 1 }}
              value={textInput}
              onChange={(val) => setTextInput(val)}
            />
          </VBox>

          <View style={{ height: 1 }} />

          {/* Section 2: Scoped Theme Box (Inherits specific theme instead of global) */}
          <VBox
            theme={localTheme}
            style={{
              border: "double",
              borderColor: "$primary",
              background: "$background",
              padding: 1,
            }}
          >
            <Label style={{ bold: true, color: "$primary" }}>
              Container-Scoped Theme: {localTheme}
            </Label>
            <Label style={{ color: "$foreground" }}>
              Notice my colors differ from the global theme!
            </Label>
            <View style={{ height: 1 }} />
            <HBox>
              <Button
                style={{ margin: 1 }}
                onClick={() =>
                  setLocalTheme(
                    localTheme === "catppuccin-latte" ? "catppuccin-mocha" : "catppuccin-latte",
                  )
                }
              >
                Toggle Local Mocha/Latte
              </Button>
            </HBox>
          </VBox>
        </VBox>
      </HBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const themesDemo: Demo = {
  id: "themes",
  title: "Theme Explorer",
  group: "Theme",
  description: "Browse & switch themes.",
  Component: ThemeExplorerApp,
};
