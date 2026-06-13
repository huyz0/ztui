// `ztui/mermaid` — Mermaid diagram rendering. Requires `beautiful-mermaid` (peer
// dependency); the SVG render path additionally uses `sharp` (optional). Importing
// this entry registers the `ztui-mermaid` and `mermaid` elements. Pair with
// `{ Mermaid }` from `ztui/react` for JSX.
import "./widgets/text/register-mermaid.ts";

export { MermaidWidget } from "./widgets/text/mermaid.ts";
