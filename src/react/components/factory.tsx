import { createElement, type ReactElement } from "react";
import type { WidgetStyles } from "../../dom/widget.ts";
import type { ComponentProps } from "./types.ts";

/**
 * Builds a React component that maps 1:1 onto a ztui host element.
 *
 * All props (including `children`) are forwarded verbatim to the host element;
 * the reconciler's host-config maps any prop whose name matches a field on the
 * underlying widget. The typed `P` parameter is purely for authoring DX — it
 * lets callers declare a `FooProps` interface and get prop-type checking at the
 * call site without hand-writing a destructure-and-respread wrapper per widget.
 *
 * @param tag The host element tag, e.g. "ztui-button".
 */
export function hostComponent<P extends ComponentProps = ComponentProps>(
  tag: string,
): (props: P) => ReactElement {
  const Component = ({ children, ...props }: P): ReactElement =>
    createElement(tag, props, children);
  Component.displayName = tag;
  return Component;
}

/**
 * Builds a `ztui-box` component that injects a base style preset (e.g. a
 * `flexDirection` or `display` mode). A caller-supplied `style` overrides
 * matching preset keys, so the preset only sets defaults.
 *
 * @param preset Base styles merged underneath the caller's `style`.
 * @param displayName Component display name for React devtools / diagnostics.
 */
export function presetBox(
  preset: WidgetStyles,
  displayName: string,
): (props: ComponentProps) => ReactElement {
  const Component = ({ style, children, ...props }: ComponentProps): ReactElement =>
    createElement("ztui-box", { ...props, style: { ...preset, ...style } }, children);
  Component.displayName = displayName;
  return Component;
}
