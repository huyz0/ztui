import { registerElement } from "../../dom/element-registry.ts";
import { MermaidWidget } from "./mermaid.ts";

registerElement("ztui-mermaid", () => new MermaidWidget());
registerElement("mermaid", () => new MermaidWidget());
