import { createElement, type ReactElement } from "react";
import { registerElement } from "../../dom/element-registry.ts";
import type { Widget, WidgetStyles } from "../../dom/widget.ts";
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
 * Pass `factory` to also register the tag in one step — the common case for a
 * custom widget, so you don't call {@link registerElement} separately:
 *
 * ```tsx
 * export const Gauge = hostComponent("ztui-gauge", () => new GaugeWidget());
 * ```
 *
 * Registration still lives in the framework-neutral core registry
 * ({@link registerElement} from `ztui`); this is just the React binding wiring
 * it up for you. A binding for another framework (Solid, Vue, …) would call
 * `registerElement` from its own component factory the same way, so the
 * widget layer never depends on any particular UI framework.
 *
 * @param tag The host element tag, e.g. "ztui-gauge".
 * @param factory Optional Widget constructor; when given, the tag is registered.
 */
export function hostComponent<P extends ComponentProps = ComponentProps>(
  tag: string,
  factory?: () => Widget,
): (props: P) => ReactElement {
  if (factory) registerElement(tag, factory);
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
