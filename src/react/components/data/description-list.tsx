import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

/** One `term → description` pair in a {@link DescriptionList}. */
export interface DescriptionItem {
  /** The key/label, shown in the left column. */
  term: string;
  /** The value, shown in the right column (wraps when space is tight). */
  description: string;
}

/** Props for {@link DescriptionList}. */
export interface DescriptionListProps extends ComponentProps {
  /** Rows to render, top to bottom. */
  items?: DescriptionItem[];
  /** Fixed term-column width; when unset, auto-sizes to the widest term (capped at 24). */
  termWidth?: number;
  /** Cells between the term and description columns. Default 2. */
  gap?: number;
  /** Align terms within their column. Default `left`. */
  termAlign?: "left" | "right";
  /** Term colour (theme `$var` or literal); defaults to `$dimmed`. */
  termColor?: string;
}

/**
 * A two-column `term : description` list — the terminal analogue of an HTML
 * `<dl>` — for config dumps, key/value detail panes, and metadata summaries.
 * Terms share one auto-sized (or fixed) left column; descriptions fill the rest
 * and word-wrap, with continuation lines aligned under the description column.
 *
 * ```tsx
 * <DescriptionList items={[
 *   { term: "Model", description: "claude-opus-4-8" },
 *   { term: "Context", description: "200k tokens" },
 * ]} />
 * ```
 */
export const DescriptionList = hostComponent<DescriptionListProps>("ztui-description-list");
