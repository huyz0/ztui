// `ztui/react` — the React binding. Requires `react` + `react-reconciler`
// (optional peer dependencies). React components are host-tag factories and do
// not import the heavy text engines, so this entry stays lightweight. Importing
// it also registers all core widget elements, so rendering core components works
// without importing the `ztui` core entry. To render markdown/syntax/mermaid
// components, also import the matching feature entry (`ztui/markdown`, etc.).
import "./widgets/register-core.ts";

export * from "./react/components.tsx";
export { render } from "./react/reconciler.ts";
