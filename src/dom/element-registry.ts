import { Widget } from "./widget.ts";

/**
 * Tag-name → widget-constructor registry. Lives in the DOM layer (below both
 * `widgets` and `react`) so widget modules can register themselves and the
 * React host-config can look elements up without either side depending on the
 * other. Keeps the framework's element vocabulary decoupled from React.
 */
const elementRegistry: Record<string, () => Widget> = {
  "ztui-view": () => new Widget("view"),
  "ztui-button": () => new Widget("button"),
  "ztui-label": () => new Widget("label"),
  "ztui-input": () => new Widget("input"),
  "ztui-header": () => new Widget("header"),
  "ztui-footer": () => new Widget("footer"),
};

/**
 * Map a host tag name to a {@link Widget} constructor so it can appear in the
 * tree. The extension point for custom widgets — pair with `hostComponent` from
 * `ztui/react` for JSX. See the "Extending ztui" guide.
 *
 * @param tagName Host tag, e.g. `"ztui-gauge"` (case-insensitive).
 * @param ctor Factory returning a fresh widget instance.
 */
export function registerElement(tagName: string, ctor: () => Widget) {
  elementRegistry[tagName.toLowerCase()] = ctor;
}

/** Construct a widget for a registered tag name, or `null` if the tag is unknown. */
export function createWidgetByTagName(tagName: string): Widget | null {
  const ctor = elementRegistry[tagName.toLowerCase()];
  return ctor ? ctor() : null;
}
