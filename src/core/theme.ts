export interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    foreground: string;
    surface: string;
    panel: string;
    accent: string;
    success: string;
    warning: string;
    error: string;
    [key: string]: string;
  };
}

export function adjustLightness(hexColor: string, percent: number): string {
  if (!hexColor.startsWith("#")) return hexColor;
  let hex = hexColor.slice(1);
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);

  const factor = percent / 100;
  let newR = r;
  let newG = g;
  let newB = b;

  if (factor < 0) {
    // Darken
    newR = Math.max(0, Math.floor(r * (1 + factor)));
    newG = Math.max(0, Math.floor(g * (1 + factor)));
    newB = Math.max(0, Math.floor(b * (1 + factor)));
  } else {
    // Lighten
    newR = Math.min(255, Math.floor(r + (255 - r) * factor));
    newG = Math.min(255, Math.floor(g + (255 - g) * factor));
    newB = Math.min(255, Math.floor(b + (255 - b) * factor));
  }

  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

export function deriveTheme(
  baseTheme: Theme,
  newName: string,
  options: { adjustLightness?: number },
): Theme {
  const derivedColors = { ...baseTheme.colors };
  if (options.adjustLightness !== undefined) {
    for (const [key, val] of Object.entries(derivedColors)) {
      derivedColors[key] = adjustLightness(val, options.adjustLightness);
    }
  }
  return {
    name: newName,
    colors: derivedColors,
  };
}

export class ThemeManager {
  private static instance: ThemeManager | null = null;
  private themes = new Map<string, Theme>();
  private activeThemeName = "default-dark";
  private listeners = new Set<() => void>();

  public static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  constructor() {
    this.registerBuiltInThemes();
  }

  public register(theme: Theme): void {
    this.themes.set(theme.name, theme);
  }

  public getTheme(name: string): Theme | undefined {
    return this.themes.get(name);
  }

  public getActiveTheme(): Theme {
    return this.themes.get(this.activeThemeName) || this.themes.get("default-dark")!;
  }

  public setTheme(name: string): void {
    if (this.themes.has(name)) {
      this.activeThemeName = name;
      this.emitThemeChange();
    } else {
      console.warn(`Theme '${name}' not found.`);
    }
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emitThemeChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private registerBuiltInThemes(): void {
    // 1. default-dark
    this.register({
      name: "default-dark",
      colors: {
        primary: "#00ffff",
        secondary: "#569cd6",
        background: "#121212",
        foreground: "#ffffff",
        surface: "#1e1e1e",
        panel: "#2d2d2d",
        accent: "#ff00ff",
        success: "#4caf50",
        warning: "#ffeb3b",
        error: "#f44336",
      },
    });

    // 2. default-light
    this.register({
      name: "default-light",
      colors: {
        primary: "#0088cc",
        secondary: "#333333",
        background: "#ffffff",
        foreground: "#000000",
        surface: "#f5f5f5",
        panel: "#e0e0e0",
        accent: "#9c27b0",
        success: "#2e7d32",
        warning: "#fbc02d",
        error: "#c62828",
      },
    });

    // 3. catppuccin-mocha
    this.register({
      name: "catppuccin-mocha",
      colors: {
        primary: "#cba6f7",
        secondary: "#89b4fa",
        background: "#1e1e2e",
        foreground: "#cdd6f4",
        surface: "#313244",
        panel: "#45475a",
        accent: "#f5c2e7",
        success: "#a6e3a1",
        warning: "#f9e2af",
        error: "#f38ba8",
      },
    });

    // 4. catppuccin-macchiato
    this.register({
      name: "catppuccin-macchiato",
      colors: {
        primary: "#c6a0f6",
        secondary: "#8bd5ca",
        background: "#24273a",
        foreground: "#cad3f5",
        surface: "#363a4f",
        panel: "#494d64",
        accent: "#f5bde6",
        success: "#a6da95",
        warning: "#eed49f",
        error: "#ed8796",
      },
    });

    // 5. catppuccin-frappe
    this.register({
      name: "catppuccin-frappe",
      colors: {
        primary: "#ca9ee6",
        secondary: "#81c8be",
        background: "#303446",
        foreground: "#c6d0f5",
        surface: "#414559",
        panel: "#51576d",
        accent: "#f4b8e4",
        success: "#a6d189",
        warning: "#e5c890",
        error: "#e78284",
      },
    });

    // 6. catppuccin-latte
    this.register({
      name: "catppuccin-latte",
      colors: {
        primary: "#8839ef",
        secondary: "#1e66f5",
        background: "#eff1f5",
        foreground: "#4c4f69",
        surface: "#ccd0da",
        panel: "#bcc0cc",
        accent: "#ea76cb",
        success: "#40a02b",
        warning: "#df8e1d",
        error: "#d20f39",
      },
    });

    // 7. nord
    this.register({
      name: "nord",
      colors: {
        primary: "#88c0d0",
        secondary: "#81a1c1",
        background: "#2e3440",
        foreground: "#d8dee9",
        surface: "#3b4252",
        panel: "#434c5e",
        accent: "#5e81ac",
        success: "#a3be8c",
        warning: "#ebcb8b",
        error: "#bf616a",
      },
    });

    // 8. dracula
    this.register({
      name: "dracula",
      colors: {
        primary: "#bd93f9",
        secondary: "#8be9fd",
        background: "#282a36",
        foreground: "#f8f8f2",
        surface: "#44475a",
        panel: "#6272a4",
        accent: "#ff79c6",
        success: "#50fa7b",
        warning: "#f1fa8c",
        error: "#ff5555",
      },
    });

    // 9. gruvbox-dark
    this.register({
      name: "gruvbox-dark",
      colors: {
        primary: "#d79921",
        secondary: "#458588",
        background: "#282828",
        foreground: "#ebdbb2",
        surface: "#3c3836",
        panel: "#504945",
        accent: "#b16286",
        success: "#98971a",
        warning: "#fabd2f",
        error: "#cc241d",
      },
    });

    // 10. gruvbox-light
    this.register({
      name: "gruvbox-light",
      colors: {
        primary: "#b57614",
        secondary: "#076678",
        background: "#fbf1c7",
        foreground: "#3c3836",
        surface: "#ebdbb2",
        panel: "#d5c4a1",
        accent: "#8f3f71",
        success: "#79740e",
        warning: "#b57614",
        error: "#9d0006",
      },
    });

    // 11. tokyo-night
    this.register({
      name: "tokyo-night",
      colors: {
        primary: "#7aa2f7",
        secondary: "#bb9af3",
        background: "#1a1b26",
        foreground: "#a9b1d6",
        surface: "#24283b",
        panel: "#414868",
        accent: "#ff9e64",
        success: "#9ece6a",
        warning: "#e0af68",
        error: "#f7768e",
      },
    });

    // 12. one-dark
    this.register({
      name: "one-dark",
      colors: {
        primary: "#61afef",
        secondary: "#56b6c2",
        background: "#282c34",
        foreground: "#abb2bf",
        surface: "#353b45",
        panel: "#5c6370",
        accent: "#c678dd",
        success: "#98c379",
        warning: "#e5c07b",
        error: "#e06c75",
      },
    });

    // 13. rose-pine
    this.register({
      name: "rose-pine",
      colors: {
        primary: "#c4a7e7",
        secondary: "#9ccfd8",
        background: "#191724",
        foreground: "#e0def4",
        surface: "#1f1d2e",
        panel: "#26233a",
        accent: "#ebbcba",
        success: "#31748f",
        warning: "#f6c177",
        error: "#eb6f92",
      },
    });

    // 14. monokai
    this.register({
      name: "monokai",
      colors: {
        primary: "#ae81ff",
        secondary: "#66d9ef",
        background: "#272822",
        foreground: "#f8f8f2",
        surface: "#383a30",
        panel: "#49483e",
        accent: "#f92672",
        success: "#a6e22e",
        warning: "#e6db74",
        error: "#fd971f",
      },
    });

    // 15. everforest
    this.register({
      name: "everforest",
      colors: {
        primary: "#7fbbb3",
        secondary: "#83c092",
        background: "#2d353b",
        foreground: "#d3c6aa",
        surface: "#343f44",
        panel: "#3d484d",
        accent: "#d699b6",
        success: "#a7c080",
        warning: "#dbbc7f",
        error: "#e67e80",
      },
    });

    // 16. solarized-dark
    this.register({
      name: "solarized-dark",
      colors: {
        primary: "#268bd2",
        secondary: "#2aa198",
        background: "#002b36",
        foreground: "#839496",
        surface: "#073642",
        panel: "#586e75",
        accent: "#d33682",
        success: "#859900",
        warning: "#b58900",
        error: "#dc322f",
      },
    });

    // 17. solarized-light
    this.register({
      name: "solarized-light",
      colors: {
        primary: "#268bd2",
        secondary: "#2aa198",
        background: "#fdf6e3",
        foreground: "#586e75",
        surface: "#eee8d5",
        panel: "#93a1a1",
        accent: "#d33682",
        success: "#859900",
        warning: "#b58900",
        error: "#dc322f",
      },
    });

    // 18. cobalt2
    this.register({
      name: "cobalt2",
      colors: {
        primary: "#ffc600",
        secondary: "#1F4662",
        background: "#193549",
        foreground: "#ffffff",
        surface: "#234E6D",
        panel: "#122738",
        accent: "#ff0088",
        success: "#27D796",
        warning: "#ff9d00",
        error: "#ff628c",
      },
    });

    // 19. poimandres
    this.register({
      name: "poimandres",
      colors: {
        primary: "#5de4c7",
        secondary: "#89ddff",
        background: "#1a1e28",
        foreground: "#a6accd",
        surface: "#202533",
        panel: "#16161e",
        accent: "#d0679d",
        success: "#5de4c7",
        warning: "#fffac2",
        error: "#ff5874",
      },
    });

    // 20. kanagawa
    this.register({
      name: "kanagawa",
      colors: {
        primary: "#7e9cd8",
        secondary: "#98bb6c",
        background: "#1f1f28",
        foreground: "#dcd7ba",
        surface: "#2a2a37",
        panel: "#16161d",
        accent: "#ff9e3b",
        success: "#76946a",
        warning: "#e6c384",
        error: "#c34043",
      },
    });

    // 21. github-dark
    this.register({
      name: "github-dark",
      colors: {
        primary: "#4493f8",
        secondary: "#3fb950",
        background: "#0d1117",
        foreground: "#e6edf3",
        surface: "#161b22",
        panel: "#21262d",
        accent: "#bc8cff",
        success: "#3fb950",
        warning: "#d29922",
        error: "#f85149",
      },
    });

    // 22. horizon
    this.register({
      name: "horizon",
      colors: {
        primary: "#FAB795",
        secondary: "#25B2BC",
        background: "#1C1E26",
        foreground: "#6C6F93",
        surface: "#232530",
        panel: "#2E303E",
        accent: "#E95678",
        success: "#09F7A0",
        warning: "#FAC29A",
        error: "#F43E5C",
      },
    });

    // 23. nightfly
    this.register({
      name: "nightfly",
      colors: {
        primary: "#82aaff",
        secondary: "#21c7a8",
        background: "#011627",
        foreground: "#a1aab8",
        surface: "#0d2b45",
        panel: "#091f30",
        accent: "#ae81ff",
        success: "#21c7a8",
        warning: "#e6db74",
        error: "#ff5874",
      },
    });
  }
}
