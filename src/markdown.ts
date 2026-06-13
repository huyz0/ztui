// `ztui/markdown` — markdown rendering. Requires `marked` (peer dependency).
// Fenced code blocks are highlighted via the syntax engine when `prismjs` is
// installed (otherwise plain text), and ` ```mermaid ` blocks render as diagrams
// when `ztui/mermaid` has been imported. Importing this entry registers the
// `ztui-markdown` element. Pair with `{ Markdown }` from `ztui/react` for JSX.
import "./widgets/text/register-markdown.ts";

export { Markdown as MarkdownEngine } from "./render/rich/markdown.ts";
export { MarkdownWidget } from "./widgets/text/markdown.ts";
