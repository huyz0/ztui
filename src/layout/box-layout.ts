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
    const children = parent.children.filter((c): c is Widget => c instanceof Widget && c.visible);
    if (children.length === 0) return;

    const isVert = this.direction === "vertical";
    const totalLength = isVert ? parentRect.height : parentRect.width;

    // Phase 1: Parse sizes and track fractional fr counts
    let allocatedLength = 0;
    let totalFr = 0;

    const childSizes = children.map((child) => {
      let sizeProp = isVert ? child.computedStyle.height : child.computedStyle.width;
      if (sizeProp === undefined && child.computedStyle.flexGrow !== undefined) {
        sizeProp = `${child.computedStyle.flexGrow}fr`;
      }
      const parsed = parseDimension(sizeProp, totalLength, 1);
      if (typeof parsed === "object" && "fr" in parsed) {
        totalFr += parsed.fr;
        return parsed;
      }
      allocatedLength += parsed;
      return parsed;
    });

    // Phase 2: Compute fr unit sizes
    const remainingLength = Math.max(0, totalLength - allocatedLength);

    // Phase 3: Layout assignment
    let currentOffset = isVert ? parentRect.y : parentRect.x;
    let remainingFrLength = remainingLength;
    let remainingFrCount = totalFr;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const parsedSize = childSizes[i];

      let size = 0;
      if (typeof parsedSize === "object" && "fr" in parsedSize) {
        if (remainingFrCount > 0) {
          const exactSize = (parsedSize.fr / remainingFrCount) * remainingFrLength;
          size = Math.round(exactSize);
          remainingFrLength -= size;
          remainingFrCount -= parsedSize.fr;
        } else {
          size = 0;
        }
      } else {
        size = parsedSize;
      }

      if (isVert) {
        const childWidthVal = parseDimension(
          child.computedStyle.width,
          parentRect.width,
          parentRect.width,
        );
        const childWidth = typeof childWidthVal === "number" ? childWidthVal : parentRect.width;
        child.region = new Region(
          new Offset(parentRect.x, currentOffset),
          new Size(childWidth, size),
        );
      } else {
        const childHeightVal = parseDimension(
          child.computedStyle.height,
          parentRect.height,
          parentRect.height,
        );
        const childHeight = typeof childHeightVal === "number" ? childHeightVal : parentRect.height;
        child.region = new Region(
          new Offset(currentOffset, parentRect.y),
          new Size(size, childHeight),
        );
      }

      currentOffset += size;
    }
  }
}
