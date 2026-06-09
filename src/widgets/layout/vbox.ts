import { BoxWidget } from "./box.ts";

export class VBoxWidget extends BoxWidget {
  constructor() {
    super();
    this.tagName = "vbox";
    this.defaultStyle = { layout: "vertical" };
  }
}
