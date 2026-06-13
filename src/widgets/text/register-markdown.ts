import { registerElement } from "../../dom/element-registry.ts";
import { MarkdownWidget } from "./markdown.ts";

registerElement("ztui-markdown", () => new MarkdownWidget());
