import { registerElement } from "../react/host-config.ts";

import { BoxWidget } from "./box.ts";
import { ButtonWidget } from "./button.ts";
import { DockWidget } from "./dock.ts";
import { FooterWidget } from "./footer.ts";
import { GridWidget } from "./grid.ts";
import { HBoxWidget } from "./hbox.ts";
import { HeaderWidget } from "./header.ts";
import { InputWidget } from "./input.ts";
import { LabelWidget } from "./label.ts";
import { VBoxWidget } from "./vbox.ts";

export { BoxWidget } from "./box.ts";
export { LabelWidget } from "./label.ts";
export { ButtonWidget } from "./button.ts";
export { InputWidget } from "./input.ts";
export { HeaderWidget } from "./header.ts";
export { FooterWidget } from "./footer.ts";
export { VBoxWidget } from "./vbox.ts";
export { HBoxWidget } from "./hbox.ts";
export { GridWidget } from "./grid.ts";
export { DockWidget } from "./dock.ts";

registerElement("ztui-box", () => new BoxWidget());
registerElement("ztui-label", () => new LabelWidget());
registerElement("ztui-button", () => new ButtonWidget());
registerElement("ztui-input", () => new InputWidget());
registerElement("ztui-header", () => new HeaderWidget());
registerElement("ztui-footer", () => new FooterWidget());
registerElement("ztui-vbox", () => new VBoxWidget());
registerElement("ztui-hbox", () => new HBoxWidget());
registerElement("ztui-grid", () => new GridWidget());
registerElement("ztui-dock", () => new DockWidget());
