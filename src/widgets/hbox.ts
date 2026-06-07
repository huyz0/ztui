import { BoxWidget } from "./box.ts";

export class HBoxWidget extends BoxWidget {
  constructor() {
    super();
    this.tagName = "hbox";
    this.defaultStyle = { layout: "horizontal" };
  }
}
