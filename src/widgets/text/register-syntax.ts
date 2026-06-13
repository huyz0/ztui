import { registerElement } from "../../dom/element-registry.ts";
import { SyntaxWidget } from "./syntax.ts";

registerElement("ztui-syntax", () => new SyntaxWidget());
