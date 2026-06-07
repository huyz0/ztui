import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type React from "react";
import { iconRegistry } from "../../widgets/icon-registry.ts";
import { Icon } from "./icon.tsx";
import type { ComponentProps } from "./types.ts";

export type HeroicIconVariant = "solid" | "outline" | "mini" | "micro";

export interface HeroicIconProps extends ComponentProps {
  name: string;
  variant?: HeroicIconVariant;
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

export function resolveHeroIcon(iconName: string, variant: HeroicIconVariant = "solid"): string {
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
    throw new Error(`File does not exist: ${filePath}`);
  }
  return readFileSync(filePath, "utf-8");
}

export function HeroicIcon({
  id,
  className,
  style,
  name,
  variant = "solid",
  ...rest
}: HeroicIconProps) {
  const registryName = `hero:${variant}:${name}`;

  if (!iconRegistry.get(registryName)) {
    try {
      const svg = resolveHeroIcon(name, variant);
      const textFallback = fallbackMap[name] || "❖";
      iconRegistry.registerIcon({
        name: registryName,
        svg,
        textFallback,
      });
    } catch (err) {
      console.error("HeroicIcon resolution error:", err);
      // Gracefully fall back, standard <Icon> will show fallback if not registered
    }
  }

  return <Icon id={id} className={className} style={style} name={registryName} {...rest} />;
}
