import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { iconRegistry } from "../../widgets/icon-registry.ts";
import { Icon } from "./icon.tsx";
import type { ComponentProps } from "./types.ts";

export type HeroIconVariant = "solid" | "outline" | "mini" | "micro";

export interface HeroIconProps extends ComponentProps {
  name: string;
  variant?: HeroIconVariant;
}

const fallbackMap: Record<string, string> = {
  home: "🏠",
  cog: "⚙",
  settings: "⚙",
  bell: "🔔",
  user: "👤",
  heart: "❤️",
  star: "⭐",
  "magnifying-glass": "🔍",
  search: "🔍",
  trash: "🗑",
  envelope: "✉",
  mail: "✉",
  phone: "📞",
  camera: "📷",
  clock: "🕒",
  calendar: "📅",
  folder: "📁",
  document: "📄",
  paper: "📄",
  bookmark: "🔖",
  lock: "🔒",
  key: "🔑",
  eye: "👁",
  "light-bulb": "💡",
  bolt: "⚡",
  flash: "⚡",
  trophy: "🏆",
  beaker: "🧪",
  gift: "🎁",
  "shopping-cart": "🛒",
  "map-pin": "📍",
};

// Resolve the heroicons package directory lazily (once, at module load — just a path lookup, no I/O)
let heroiconsDir = "";
try {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve("heroicons/package.json");
  heroiconsDir = dirname(packageJsonPath);
} catch (err: any) {
  try {
    appendFileSync(
      "ztui.log",
      `[${new Date().toISOString()}] heroic-icon.tsx top-level resolve error: ${err?.stack || err}\n`,
    );
  } catch {}
}

/**
 * Reads the raw SVG string for a heroicon by name + variant.
 * Throws if heroicons is not installed or the icon doesn't exist.
 */
export function resolveHeroIcon(iconName: string, variant: HeroIconVariant = "solid"): string {
  if (!heroiconsDir) {
    throw new Error(
      "Heroicons directory not resolved. Package may not be installed or path resolution failed.",
    );
  }

  let size = "24";
  let style = "solid";

  if (variant === "outline") {
    style = "outline";
  } else if (variant === "mini") {
    size = "20";
    style = "solid";
  } else if (variant === "micro") {
    size = "16";
    style = "solid";
  }

  const filePath = join(heroiconsDir, size, style, `${iconName}.svg`);
  if (!existsSync(filePath)) {
    throw new Error(`Heroicon file does not exist: ${filePath}`);
  }
  return readFileSync(filePath, "utf-8");
}

/**
 * Lazily registers a heroicon in the global icon registry.
 * The SVG file is read from disk only on the first call for a given name+variant.
 * Subsequent calls for the same key are no-ops.
 */
export function registerHeroIcon(iconName: string, variant: HeroIconVariant = "solid"): string {
  const registryName = `hero:${variant}:${iconName}`;
  if (!iconRegistry.get(registryName)) {
    try {
      const svg = resolveHeroIcon(iconName, variant);
      iconRegistry.registerIcon({
        name: registryName,
        svg,
        textFallback: fallbackMap[iconName] ?? "❖",
      });
    } catch (err) {
      console.error("HeroIcon registration error:", err);
    }
  }
  return registryName;
}

/**
 * A React component that renders a Heroicon.
 * The SVG is loaded from disk lazily on first render and cached in the icon registry.
 */
export function HeroIcon({
  id,
  className,
  style,
  name,
  variant = "solid",
  ...rest
}: HeroIconProps) {
  const registryName = registerHeroIcon(name, variant);
  return <Icon id={id} className={className} style={style} name={registryName} {...rest} />;
}
