import { Widget } from "../dom/widget.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Layout, parseDimension } from "./layout.ts";

export class DockLayout extends Layout {
  public resolve(parent: Widget): void {
    let remaining = parent.getContentRect();

    for (const child of parent.children) {
      if (
        !(child instanceof Widget) ||
        !child.visible ||
        child.computedStyle.position === "absolute"
      )
        continue;

      const dock = child.computedStyle.dock;
      if (!dock) {
        child.region = remaining.clone();
        continue;
      }

      if (dock === "top") {
        const val = parseDimension(child.computedStyle.height, remaining.height, -1);
        const requested =
          typeof val === "number"
            ? val === -1
              ? child.computedStyle.height === "auto" || child.computedStyle.height === undefined
                ? child.measuredHeight
                : 1
              : val
            : remaining.height;
        // Clamp to what's actually left — an over-committed fixed dock must
        // not extend past the container and overlap/overflow whatever comes
        // after it.
        const height = Math.min(requested, remaining.height);
        child.region = new Region(
          new Offset(remaining.x, remaining.y),
          new Size(remaining.width, height),
        );
        remaining = new Region(
          new Offset(remaining.x, remaining.y + height),
          new Size(remaining.width, Math.max(0, remaining.height - height)),
        );
      } else if (dock === "bottom") {
        const val = parseDimension(child.computedStyle.height, remaining.height, -1);
        const requested =
          typeof val === "number"
            ? val === -1
              ? child.computedStyle.height === "auto" || child.computedStyle.height === undefined
                ? child.measuredHeight
                : 1
              : val
            : remaining.height;
        const height = Math.min(requested, remaining.height);
        child.region = new Region(
          new Offset(remaining.x, remaining.bottom - height),
          new Size(remaining.width, height),
        );
        remaining = new Region(
          remaining.offset,
          new Size(remaining.width, Math.max(0, remaining.height - height)),
        );
      } else if (dock === "left") {
        const val = parseDimension(child.computedStyle.width, remaining.width, -1);
        const requested =
          typeof val === "number"
            ? val === -1
              ? child.computedStyle.width === "auto" || child.computedStyle.width === undefined
                ? child.measuredWidth
                : 10
              : val
            : remaining.width;
        const width = Math.min(requested, remaining.width);
        child.region = new Region(
          new Offset(remaining.x, remaining.y),
          new Size(width, remaining.height),
        );
        remaining = new Region(
          new Offset(remaining.x + width, remaining.y),
          new Size(Math.max(0, remaining.width - width), remaining.height),
        );
      } else if (dock === "right") {
        const val = parseDimension(child.computedStyle.width, remaining.width, -1);
        const requested =
          typeof val === "number"
            ? val === -1
              ? child.computedStyle.width === "auto" || child.computedStyle.width === undefined
                ? child.measuredWidth
                : 10
              : val
            : remaining.width;
        const width = Math.min(requested, remaining.width);
        child.region = new Region(
          new Offset(remaining.right - width, remaining.y),
          new Size(width, remaining.height),
        );
        remaining = new Region(
          remaining.offset,
          new Size(Math.max(0, remaining.width - width), remaining.height),
        );
      }
    }
  }
}
