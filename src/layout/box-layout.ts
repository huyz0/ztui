import { Widget } from "../dom/widget.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Layout, parseDimension } from "./layout.ts";

export class BoxLayout extends Layout {
  constructor(public direction: "vertical" | "horizontal") {
    super();
  }

  public resolve(parent: Widget): void {
    const parentRect = parent.getContentRect();
    const children = parent.children.filter(
      (c): c is Widget =>
        c instanceof Widget && c.visible && c.computedStyle.position !== "absolute",
    );
    if (children.length === 0) return;

    const isVert = this.direction === "vertical";
    const totalLength = isVert ? parentRect.height : parentRect.width;
    const mainStart = isVert ? parentRect.y : parentRect.x;

    if (parent.computedStyle.flexWrap !== "wrap") {
      const crossStart = isVert ? parentRect.x : parentRect.y;
      this.layoutLine(children, parentRect, isVert, mainStart, totalLength, crossStart);
      return;
    }

    // Wrap mode: break children into lines that each fit within the main
    // axis, then stack the lines along the cross axis — each line laid out
    // with the same single-line algorithm used for "nowrap".
    const lines = this.breakIntoLines(children, isVert, totalLength);
    let crossOffset = isVert ? parentRect.x : parentRect.y;
    for (const line of lines) {
      const lineCrossSize = this.layoutLine(
        line,
        parentRect,
        isVert,
        mainStart,
        totalLength,
        crossOffset,
      );
      crossOffset += lineCrossSize;
    }
  }

  /**
   * Groups children into lines using their main-axis base size (the same
   * size Phase 1 of {@link layoutLine} would give them before shrinking),
   * starting a new line whenever the next child would overflow the main
   * axis. `fr`/`flexGrow` children never force a wrap on their own — their
   * base size is 0, matching CSS flex-basis: content behavior for a
   * grow-only item.
   */
  private breakIntoLines(children: Widget[], isVert: boolean, totalLength: number): Widget[][] {
    const lines: Widget[][] = [];
    let current: Widget[] = [];
    let currentLength = 0;

    for (const child of children) {
      const sizeProp = isVert ? child.computedStyle.height : child.computedStyle.width;
      const isFr =
        (sizeProp === undefined && child.computedStyle.flexGrow !== undefined) ||
        (typeof sizeProp === "string" && sizeProp.endsWith("fr"));

      let base = 0;
      if (!isFr) {
        if (sizeProp === undefined || sizeProp === "auto") {
          base = isVert ? child.measuredHeight : child.measuredWidth;
        } else {
          const parsed = parseDimension(sizeProp, totalLength, 1);
          base = typeof parsed === "number" ? parsed : 0;
        }
      }

      const m = child.margin;
      const marginSize = isVert ? m.top + m.bottom : m.left + m.right;
      const childFull = base + marginSize;

      if (current.length > 0 && currentLength + childFull > totalLength) {
        lines.push(current);
        current = [];
        currentLength = 0;
      }
      current.push(child);
      currentLength += childFull;
    }
    if (current.length > 0) lines.push(current);
    return lines;
  }

  /**
   * Lays out one line's worth of children along the main axis, starting at
   * `mainStart` and constrained to `mainLength`, offset `crossStart` along
   * the cross axis. Returns the line's cross-axis size (the max cross size
   * used by any child in the line) so the caller can stack further lines.
   */
  private layoutLine(
    children: Widget[],
    parentRect: Region,
    isVert: boolean,
    mainStart: number,
    mainLength: number,
    crossStart: number,
  ): number {
    // Phase 1: Parse sizes and track fractional fr counts, accumulating margins of all children
    let allocatedLength = 0;
    let totalFr = 0;

    const childSizes = children.map((child) => {
      let sizeProp = isVert ? child.computedStyle.height : child.computedStyle.width;
      if (sizeProp === undefined && child.computedStyle.flexGrow !== undefined) {
        sizeProp = `${child.computedStyle.flexGrow}fr`;
      }

      let parsed: number | { fr: number };
      if (sizeProp === undefined || sizeProp === "auto") {
        parsed = isVert ? child.measuredHeight : child.measuredWidth;
      } else {
        parsed = parseDimension(sizeProp, mainLength, 1);
      }

      // Collect margin size
      const m = child.margin;
      const marginSize = isVert ? m.top + m.bottom : m.left + m.right;
      allocatedLength += marginSize;

      if (typeof parsed === "object" && "fr" in parsed) {
        totalFr += parsed.fr;
        return parsed;
      }
      allocatedLength += parsed;
      return parsed;
    });

    // Phase 1.5: Shrink phase — if fixed/auto-sized children already consume
    // more than the line offers, shrink the ones that opt in via
    // flexShrink (default 0, i.e. off — back-compat) proportionally to
    // their size, down to their minWidth/minHeight floor, before falling
    // back to clamping `fr` children to 0.
    if (allocatedLength > mainLength) {
      let deficit = allocatedLength - mainLength;
      const shrinkable = childSizes
        .map((size, i) => {
          if (typeof size !== "number" || size <= 0) return null;
          const factor = children[i].computedStyle.flexShrink ?? 0;
          if (factor <= 0) return null;
          const min = isVert
            ? (children[i].computedStyle.minHeight ?? 0)
            : (children[i].computedStyle.minWidth ?? 0);
          return { i, weight: factor * size, min };
        })
        .filter((s): s is { i: number; weight: number; min: number } => s !== null);

      let totalWeight = shrinkable.reduce((sum, s) => sum + s.weight, 0);
      while (deficit > 0.001 && totalWeight > 0) {
        let appliedAny = false;
        for (const s of shrinkable) {
          if (s.weight <= 0) continue;
          const current = childSizes[s.i] as number;
          const share = (s.weight / totalWeight) * deficit;
          const shrinkAmount = Math.min(share, current - s.min);
          if (shrinkAmount > 0) {
            childSizes[s.i] = current - shrinkAmount;
            allocatedLength -= shrinkAmount;
            deficit -= shrinkAmount;
            appliedAny = true;
          }
          if (current - shrinkAmount <= s.min) {
            totalWeight -= s.weight;
            s.weight = 0;
          }
        }
        if (!appliedAny) break;
      }

      // Round shrunk sizes to whole cells; re-derive allocatedLength from
      // the rounded values so Phase 2's remaining-space math stays exact.
      for (const s of shrinkable) {
        const rounded = Math.round(childSizes[s.i] as number);
        allocatedLength += rounded - (childSizes[s.i] as number);
        childSizes[s.i] = rounded;
      }
    }

    // Phase 2: Compute fr unit sizes
    const remainingLength = Math.max(0, mainLength - allocatedLength);

    // Phase 3: Layout assignment
    let currentOffset = mainStart;
    let remainingFrLength = remainingLength;
    let remainingFrCount = totalFr;
    let lineCrossSize = 0;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const parsedSize = childSizes[i];
      const m = child.margin;
      const marginSize = isVert ? m.top + m.bottom : m.left + m.right;

      let size = 0;
      if (typeof parsedSize === "object" && "fr" in parsedSize) {
        if (remainingFrCount > 0) {
          const exactSize = (parsedSize.fr / remainingFrCount) * remainingFrLength;
          const distributed = Math.round(exactSize);
          size = distributed + marginSize;
          remainingFrLength -= distributed;
          remainingFrCount -= parsedSize.fr;
        } else {
          size = marginSize;
        }
      } else {
        size = parsedSize + marginSize;
      }

      if (isVert) {
        const childWidthVal = parseDimension(child.computedStyle.width, parentRect.width, -1);
        const childWidth =
          typeof childWidthVal === "number"
            ? childWidthVal === -1
              ? child.computedStyle.width === "auto"
                ? child.measuredWidth + child.margin.left + child.margin.right
                : parentRect.width
              : childWidthVal + child.margin.left + child.margin.right
            : parentRect.width;
        child.region = new Region(
          new Offset(crossStart, currentOffset),
          new Size(childWidth, size),
        );
        lineCrossSize = Math.max(lineCrossSize, childWidth);
      } else {
        const childHeightVal = parseDimension(child.computedStyle.height, parentRect.height, -1);
        const childHeight =
          typeof childHeightVal === "number"
            ? childHeightVal === -1
              ? child.computedStyle.height === "auto"
                ? child.measuredHeight + child.margin.top + child.margin.bottom
                : parentRect.height
              : childHeightVal + child.margin.top + child.margin.bottom
            : parentRect.height;
        child.region = new Region(
          new Offset(currentOffset, crossStart),
          new Size(size, childHeight),
        );
        lineCrossSize = Math.max(lineCrossSize, childHeight);
      }

      currentOffset += size;
    }

    return lineCrossSize;
  }
}
