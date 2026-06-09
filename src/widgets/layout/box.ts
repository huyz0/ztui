import { Scrollable } from "../../dom/scrollable.ts";
import { Widget } from "../../dom/widget.ts";

export class BoxWidget extends Widget {
  constructor() {
    super("box");
  }
}

export class ScrollableBoxWidget extends Scrollable(BoxWidget) {
  constructor() {
    super();
    // We can customize scrollable box tag name if needed, but it will inherit "box" tag.
    // Let's set it to "scrollable-box" for cleaner DOM selector matching.
    this.tagName = "scrollable-box";
  }
}
