import { BoxWidget } from "./box.ts";

export class GridWidget extends BoxWidget {
  constructor() {
    super();
    this.tagName = "grid";
    this.defaultStyle = { layout: "grid" };
  }
}
