import {
  type HeroIconVariant,
  registerHeroIcon,
  resolveHeroIcon,
} from "../../../render/heroicons.ts";
import type { ComponentProps } from "../types.ts";
import { Icon } from "./icon.tsx";

export type { HeroIconVariant };
export { registerHeroIcon, resolveHeroIcon };

export interface HeroIconProps extends ComponentProps {
  /** Heroicon name. */
  name: string;
  /** Icon variant (solid, outline, mini, micro). */
  variant?: HeroIconVariant;
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
