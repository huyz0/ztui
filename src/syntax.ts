// `ztui/syntax` — code syntax highlighting. Uses `prismjs` (optional peer
// dependency) loaded lazily; without it, code renders as plain text. Importing
// this entry registers the `ztui-syntax` element. Pair with `{ Syntax }` from
// `ztui/react` for JSX.
import "./widgets/text/register-syntax.ts";

export { Syntax as SyntaxEngine } from "./render/rich/syntax.ts";
export { SyntaxWidget } from "./widgets/text/syntax.ts";
