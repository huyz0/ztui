import { BoxWidget } from "./box.ts";

export class DockWidget extends BoxWidget {
  constructor() {
    super();
    this.tagName = "dock";
    this.defaultStyle = { layout: "dock" };
  }
}
