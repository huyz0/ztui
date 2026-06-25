import { createElement, type ReactElement, type ReactNode } from "react";
import type { ComponentProps } from "../types.ts";

/** Props for {@link ButtonGroup}. */
export interface ButtonGroupProps extends ComponentProps {
  /** Layout direction of the buttons. Default `"horizontal"`. */
  orientation?: "horizontal" | "vertical";
  /** Wrap around at the ends instead of stopping. Default `true`. */
  wrap?: boolean;
  /** The `Button` children to navigate between. */
  children: ReactNode;
}

/**
 * A roving-focus toolbar around `Button` children: arrow keys (`←`/`→`/`↑`/`↓`,
 * plus `Home`/`End`) move focus between the buttons, and the whole group is a
 * single **Tab** stop — so a row of actions reads as one control. Each button
 * keeps its own `onClick`, focus glow, and `formAction`, so dropping a group of
 * `formAction` buttons into a `<Form>` gives an arrow-navigable actions row that
 * still submits/resets the form on Enter.
 *
 * ```tsx
 * <ButtonGroup>
 *   <Button>Cancel</Button>
 *   <Button formAction="submit" style={{ color: "$success" }}>Save</Button>
 * </ButtonGroup>
 * ```
 */
export function ButtonGroup({
  orientation = "horizontal",
  wrap,
  children,
  ...rest
}: ButtonGroupProps): ReactElement {
  return createElement(
    "ztui-button-group",
    {
      ...rest,
      orientation,
      wrap,
      style: { layout: orientation === "vertical" ? "vertical" : "horizontal", ...rest.style },
    },
    children,
  );
}
ButtonGroup.displayName = "ButtonGroup";
