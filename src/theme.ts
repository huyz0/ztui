import { parseColor, type RGB } from "./render/color.ts";
import { logger } from "./utils/logger.ts";

const BLEND_BLACK: RGB = { r: 0, g: 0, b: 0 };
const BLEND_WHITE: RGB = { r: 255, g: 255, b: 255 };

/**
 * The dark UI background used as a fallback wherever no theme/resolver is
 * available to ask (a standalone HTML export, the DevTools page, a browser
 * canvas host, a terminal graphics-clear color) — the catppuccin-mocha theme's
 * `background`. Kept as one constant so those independent fallbacks can't
 * drift from each other.
 */
export const FALLBACK_DARK_BG = "#1e1e2e";

/** A named palette. Its `colors` back the `$token` style values — see the Theming guide. */
export interface Theme {
  /** Unique theme name passed to `ThemeManager.setTheme`. */
  name: string;
  /** Semantic color tokens (referenced in styles as `$primary`, `$surface`, …). */
  colors: {
    /** Primary accent / interactive color (`$primary`). */
    primary: string;
    /** Secondary accent (`$secondary`). */
    secondary: string;
    /** App backdrop (`$background`). */
    background: string;
    /** Default text (`$foreground`). */
    foreground: string;
    /** Raised surface — cards, panels (`$surface`). */
    surface: string;
    /** A second elevation above surface (`$panel`). */
    panel: string;
    /** Tertiary accent / highlights (`$accent`). */
    accent: string;
    /** Positive state (`$success`). */
    success: string;
    /** Caution state (`$warning`). */
    warning: string;
    /** Error / destructive state (`$error`). */
    error: string;
    /** Code comments (syntax). */
    comment?: string;
    /** Input placeholder text. */
    placeholder?: string;
    /** Editor gutter / line numbers. */
    gutter?: string;
    /** De-emphasized text (`$dimmed`). */
    dimmed?: string;
    /** Syntax: keywords. */
    keyword?: string;
    /** Syntax: string literals. */
    string?: string;
    /** Syntax: numeric literals. */
    number?: string;
    /** Syntax: regular expressions. */
    regexp?: string;
    /** Syntax: operators. */
    operator?: string;
    /** Syntax: punctuation. */
    punctuation?: string;
    /** Syntax: built-in identifiers. */
    builtin?: string;
    /** Syntax: type names. */
    type?: string;
    /** Syntax: boolean literals. */
    boolean?: string;
    /** Syntax: function names. */
    function?: string;
    /** Syntax: object properties. */
    property?: string;
    /** Syntax: markup tags. */
    tag?: string;
    /** Syntax: markup attribute names. */
    "attr-name"?: string;
    /** Border lines (`$border`). */
    border?: string;
    /** Focus-ring accent (`$focus`). */
    focus?: string;
    /** Selection background (`$selectionBg`). */
    selectionBg?: string;
    /** Selection foreground (`$selectionFg`). */
    selectionFg?: string;
    /** Drop-shadow tint. */
    shadow?: string;
    /** Any additional custom token. */
    [key: string]: string | undefined;
  };
}

export function isColorLight(color: string): boolean {
  // Use the shared parser so rgb()/rgba()/named colors (all valid Theme.colors
  // values elsewhere in the codebase) are classified correctly instead of
  // silently falling through to "dark" for anything that isn't #hex.
  const rgb = parseColor(color)?.rgb;
  if (!rgb) return false;
  // Standard relative luminance formula
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5;
}

export function isThemeLight(theme: Theme): boolean {
  const bg = theme.colors.background || "#121212";
  return isColorLight(bg);
}

/**
 * Concrete RGB to assume for cells whose colour is `default`/unset when
 * alpha-compositing (see {@link ScreenBuffer.blendRegion}). Uses the active
 * theme's background/foreground so a scrim darkens against the real surface.
 */
export function themeBlendBase(): { bg: RGB; fg: RGB } {
  const theme = ThemeManager.getInstance().getActiveTheme();
  return {
    bg: parseColor(theme.colors.background)?.rgb ?? BLEND_BLACK,
    fg: parseColor(theme.colors.foreground)?.rgb ?? BLEND_WHITE,
  };
}

/** Lighten (`percent > 0`) or darken (`percent < 0`) a hex color; non-hex inputs pass through. */
export function adjustLightness(hexColor: string, percent: number): string {
  if (!hexColor?.startsWith("#")) return hexColor;
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

/** Build a new named theme from `baseTheme`, optionally shifting every color's lightness. */
export function deriveTheme(
  baseTheme: Theme,
  newName: string,
  options: { adjustLightness?: number },
): Theme {
  const derivedColors = { ...baseTheme.colors };
  if (options.adjustLightness !== undefined) {
    for (const [key, val] of Object.entries(derivedColors)) {
      if (val) {
        derivedColors[key] = adjustLightness(val, options.adjustLightness);
      }
    }
  }
  return {
    name: newName,
    colors: derivedColors,
  };
}

/**
 * Fill `border`/`focus`/`selectionBg`/`selectionFg` from other required colors
 * when a theme omits them, so every theme — built-in or user-registered — has
 * consistent values for these tokens rather than leaving them `undefined` for
 * whichever component eventually reads them directly.
 */
function withColorDefaults(theme: Theme): Theme {
  const c = theme.colors;
  if (
    c.border !== undefined &&
    c.focus !== undefined &&
    c.selectionBg !== undefined &&
    c.selectionFg !== undefined
  ) {
    return theme;
  }
  return {
    ...theme,
    colors: {
      ...c,
      border: c.border ?? c.panel ?? c.surface,
      focus: c.focus ?? c.primary,
      selectionBg: c.selectionBg ?? c.primary,
      selectionFg: c.selectionFg ?? c.background,
    },
  };
}

/** Registry of {@link Theme}s and the active selection; changing it re-renders the app. Use the shared {@link ThemeManager.getInstance}. */
export class ThemeManager {
  private static instance: ThemeManager | null = null;
  private themes = new Map<string, Theme>();
  private activeThemeName = "default-dark";
  private listeners = new Set<() => void>();

  /** The shared singleton (pre-seeded with the built-in themes). */
  public static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  constructor() {
    this.registerBuiltInThemes();
  }

  /** Register (or replace) a theme by name. */
  public register(theme: Theme): void {
    this.themes.set(theme.name, withColorDefaults(theme));
  }

  /** Look up a registered theme by name. */
  public getTheme(name: string): Theme | undefined {
    return this.themes.get(name);
  }

  /** The currently active theme (falls back to `default-dark`). */
  public getActiveTheme(): Theme {
    return this.themes.get(this.activeThemeName) || this.themes.get("default-dark")!;
  }

  /** The active theme's name. */
  public getActiveThemeName(): string {
    return this.activeThemeName;
  }

  /** All registered themes, in registration order. */
  public listThemes(): Theme[] {
    return [...this.themes.values()];
  }

  /** Switch the active theme (a no-op with a warning if `name` isn't registered). */
  public setTheme(name: string): void {
    if (this.themes.has(name)) {
      this.activeThemeName = name;
      this.emitThemeChange();
    } else {
      logger.warn(
        "theme",
        `setTheme("${name}") ignored: theme not registered (known: ${[...this.themes.keys()].join(", ")})`,
      );
    }
  }

  /** Subscribe to theme changes; returns an unsubscribe function. */
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
    // 1. default-dark — desaturated, modern-IDE palette (VSCode Dark+ /
    // GitHub Dark lineage). Foreground is dimmed off pure white to avoid
    // halation; primary/accent are muted hues, not full-saturation neon.
    this.register({
      name: "default-dark",
      colors: {
        primary: "#4daafc",
        secondary: "#56b6c2",
        background: "#1a1a1a",
        foreground: "#d6d6d6",
        surface: "#242424",
        panel: "#2d2d2d",
        accent: "#c586c0",
        success: "#4ec07a",
        warning: "#e5c07b",
        error: "#e06c75",
        comment: "#8a8a8a",
        placeholder: "#6e6e6e",
        gutter: "#6e6e6e",
        dimmed: "#8a8a8a",
        keyword: "#c586c0",
        string: "#9ece6a",
        number: "#d19a66",
        function: "#4daafc",
        selectionBg: "#264f78",
        selectionFg: "#d6d6d6",
        border: "#3c3c3c",
        focus: "#4daafc",
      },
    });

    // 2. default-light — neutral light palette; warning/success are darkened
    // so they stay legible as text on white. comment/dimmed and
    // placeholder/gutter are darkened from their original #6e7781/#8c959f —
    // 4.55:1 and 3.04:1 against #ffffff respectively, the latter well under
    // WCAG AA's 4.5:1 for body text — to ~5:1, with real margin instead of a
    // borderline pass.
    this.register({
      name: "default-light",
      colors: {
        primary: "#0969da",
        secondary: "#0e7490",
        background: "#ffffff",
        foreground: "#1f2328",
        surface: "#f6f8fa",
        panel: "#e7ebef",
        accent: "#8250df",
        success: "#1a7f37",
        warning: "#9a6700",
        error: "#cf222e",
        comment: "#677079",
        placeholder: "#6a7179",
        gutter: "#6a7179",
        dimmed: "#677079",
        keyword: "#cf222e",
        string: "#0a3069",
        number: "#0550ae",
        function: "#8250df",
        // Darkened from the original #b6d7fb — only 1.49:1 against #ffffff,
        // catastrophically under WCAG 1.4.11's 3:1 minimum for a non-text UI
        // element (a text selection is exactly that: it needs to be visibly
        // *there*, not just contrast the text inside it). Now 3.69:1.
        selectionBg: "#73879e",
        selectionFg: "#1f2328",
        border: "#d0d7de",
        focus: "#0969da",
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
        comment: "#6c7086",
        placeholder: "#585b70",
        gutter: "#7f849c",
        dimmed: "#6c7086",
        keyword: "#cba6f7",
        string: "#a6e3a1",
        number: "#fab387",
        function: "#89b4fa",
        selectionBg: "#585b70",
        selectionFg: "#cdd6f4",
        border: "#313244",
        focus: "#cba6f7",
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
        comment: "#6e738d",
        placeholder: "#5b6078",
        gutter: "#8087a2",
        dimmed: "#6e738d",
        keyword: "#c6a0f6",
        string: "#a6da95",
        number: "#f5a97f",
        function: "#8bd5ca",
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
        comment: "#737994",
        placeholder: "#626880",
        gutter: "#838ba7",
        dimmed: "#737994",
        keyword: "#ca9ee6",
        string: "#a6d189",
        number: "#ef9f76",
        function: "#81c8be",
      },
    });

    // 6. catppuccin-latte — comment/placeholder/gutter/dimmed darkened from
    // the upstream Catppuccin #6c6f85 (4.37:1 against #eff1f5, just under
    // WCAG AA's 4.5:1 for body text) to ~4.9:1.
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
        comment: "#64677c",
        placeholder: "#64677c",
        gutter: "#64677c",
        dimmed: "#64677c",
        keyword: "#8839ef",
        string: "#40a02b",
        number: "#df8e1d",
        function: "#1e66f5",
        // Darkened from the original #acb0be — only 1.91:1 against #eff1f5,
        // under WCAG 1.4.11's 3:1 minimum for a non-text UI element. Now
        // 4.12:1; selectionFg switched to white since dark text no longer
        // has room to also clear 4.5:1 against a background this dark.
        selectionBg: "#72747d",
        selectionFg: "#ffffff",
        border: "#ccd0da",
        focus: "#8839ef",
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
        comment: "#74819a",
        placeholder: "#74819a",
        gutter: "#74819a",
        dimmed: "#74819a",
        keyword: "#81a1c1",
        string: "#a3be8c",
        number: "#b48ead",
        function: "#88c0d0",
        selectionBg: "#434c5e",
        selectionFg: "#d8dee9",
        border: "#3b4252",
        focus: "#88c0d0",
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
        comment: "#6272a4",
        placeholder: "#6272a4",
        gutter: "#6272a4",
        dimmed: "#6272a4",
        keyword: "#ff79c6",
        string: "#f1fa8c",
        number: "#bd93f9",
        function: "#50fa7b",
        selectionBg: "#44475a",
        selectionFg: "#f8f8f2",
        border: "#44475a",
        focus: "#bd93f9",
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
        comment: "#928374",
        placeholder: "#7c6f64",
        gutter: "#7c6f64",
        dimmed: "#928374",
        keyword: "#fb4934",
        string: "#b8bb26",
        number: "#d3869b",
        function: "#859900",
      },
    });

    // 10. gruvbox-light — comment/gutter/dimmed and placeholder darkened from
    // the upstream Gruvbox #928374/#bdae93 — 3.24:1 and a catastrophic 1.92:1
    // against #fbf1c7, respectively — to ~4.7:1, clearing WCAG AA for body
    // text with margin.
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
        comment: "#75695d",
        placeholder: "#736a5a",
        gutter: "#75695d",
        dimmed: "#75695d",
        keyword: "#9d0006",
        string: "#79740e",
        number: "#8f3f71",
        function: "#076678",
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
        comment: "#565f89",
        placeholder: "#565f89",
        gutter: "#565f89",
        dimmed: "#565f89",
        keyword: "#bb9af3",
        string: "#9ece6a",
        number: "#ff9e64",
        function: "#7aa2f7",
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
        comment: "#5c6370",
        placeholder: "#4b5263",
        gutter: "#5c6370",
        dimmed: "#5c6370",
        keyword: "#c678dd",
        string: "#98c379",
        number: "#d19a66",
        function: "#61afef",
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
        comment: "#6e6a86",
        placeholder: "#555169",
        gutter: "#6e6a86",
        dimmed: "#6e6a86",
        keyword: "#c4a7e7",
        string: "#f6c177",
        number: "#ebbcba",
        function: "#9ccfd8",
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
        comment: "#75715e",
        placeholder: "#75715e",
        gutter: "#75715e",
        dimmed: "#75715e",
        keyword: "#f92672",
        string: "#e6db74",
        number: "#ae81ff",
        function: "#66d9ef",
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
        comment: "#859289",
        placeholder: "#3d484d",
        gutter: "#859289",
        dimmed: "#859289",
        keyword: "#dbbc7f",
        string: "#a7c080",
        number: "#d699b6",
        function: "#7fbbb3",
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
        comment: "#657b83",
        placeholder: "#657b83",
        gutter: "#657b83",
        dimmed: "#657b83",
        keyword: "#859900",
        string: "#2aa198",
        number: "#b58900",
        function: "#268bd2",
        selectionBg: "#073642",
        selectionFg: "#93a1a1",
        border: "#073642",
        focus: "#268bd2",
      },
    });

    // 17. solarized-light — comment/placeholder/gutter/dimmed darkened from
    // the upstream Solarized #657b83 (4.13:1 against #fdf6e3, just under
    // WCAG AA's 4.5:1 for body text) to ~4.7:1.
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
        comment: "#5e727a",
        placeholder: "#5e727a",
        gutter: "#5e727a",
        dimmed: "#5e727a",
        keyword: "#859900",
        string: "#2aa198",
        number: "#b58900",
        function: "#268bd2",
        // The original #eee8d5 was nearly identical to `background` (#fdf6e3)
        // — 1.14:1, effectively invisible — since it doubled as `surface`'s
        // value instead of a real selection color. Replaced with a
        // genuinely distinct blue (derived from `primary`); selectionFg
        // switched to white to stay legible against it. Now 4.41:1 against
        // background, 4.75:1 for the text on top.
        selectionBg: "#2178b5",
        selectionFg: "#ffffff",
        border: "#eee8d5",
        focus: "#268bd2",
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
        comment: "#5f85aa",
        placeholder: "#5f85aa",
        gutter: "#5f85aa",
        dimmed: "#5f85aa",
        keyword: "#ff9d00",
        string: "#3ad900",
        number: "#ff628c",
        function: "#ffc600",
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
        comment: "#767c9d",
        placeholder: "#767c9d",
        gutter: "#767c9d",
        dimmed: "#767c9d",
        keyword: "#5de4c7",
        string: "#fffac2",
        number: "#ff5874",
        function: "#89ddff",
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
        comment: "#727169",
        placeholder: "#727169",
        gutter: "#727169",
        dimmed: "#727169",
        keyword: "#957fb8",
        string: "#98bb6c",
        number: "#ff9e3b",
        function: "#7e9cd8",
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
        comment: "#8b949e",
        placeholder: "#30363d",
        gutter: "#8b949e",
        dimmed: "#8b949e",
        keyword: "#ff7b72",
        string: "#a5d6ff",
        number: "#79c0ff",
        function: "#d2a8ff",
      },
    });

    // 22. horizon
    this.register({
      name: "horizon",
      colors: {
        primary: "#FAB795",
        secondary: "#25B2BC",
        background: "#1C1E26",
        foreground: "#D5D8DA",
        surface: "#232530",
        panel: "#2E303E",
        accent: "#E95678",
        success: "#09F7A0",
        warning: "#FAC29A",
        error: "#F43E5C",
        comment: "#6C6F93",
        placeholder: "#6C6F93",
        gutter: "#6C6F93",
        dimmed: "#6C6F93",
        keyword: "#E95678",
        string: "#FAC29A",
        number: "#FAB795",
        function: "#25B2BC",
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
        comment: "#7c8f8f",
        placeholder: "#7c8f8f",
        gutter: "#7c8f8f",
        dimmed: "#7c8f8f",
        keyword: "#82aaff",
        string: "#ecc48d",
        number: "#f78c6c",
        function: "#21c7a8",
      },
    });
  }
}
