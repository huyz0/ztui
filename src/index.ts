// Core & DOM
export { App } from "./core/app.ts";
export { DOMNode } from "./dom/dom.ts";
export { Widget } from "./dom/widget.ts";
export type { WidgetStyles } from "./dom/widget.ts";
export { Screen } from "./dom/screen.ts";

// Geometry
export { Offset } from "./geometry/offset.ts";
export { Size } from "./geometry/size.ts";
export { Region } from "./geometry/region.ts";
export { Spacing } from "./geometry/spacing.ts";

// Rendering & Styling
export { Style } from "./render/style.ts";
export type { StyleProps } from "./render/style.ts";
export { Segment } from "./render/segment.ts";
export { ScreenBuffer } from "./render/buffer.ts";

// React Integration
export { render } from "./react/reconciler.ts";
export {
  View,
  Button,
  Label,
  Input,
  Header,
  Footer,
  Box,
  VBox,
  HBox,
  Grid,
  Dock,
  Icon,
  type IconProps,
  HeroicIcon,
  type HeroicIconProps,
} from "./react/components.tsx";

// Icon Registry
export { iconRegistry, IconRegistry } from "./widgets/icon-registry.ts";
export { IconWidget } from "./widgets/icon.ts";

// Drivers
export { Driver } from "./driver/driver.ts";
export { BunDriver } from "./driver/bun/index.ts";
export { MockDriver } from "./driver/mock/index.ts";
export { WebDriver } from "./driver/web/index.ts";
export { renderBufferToHTML } from "./render/html-renderer.ts";
export { startInspector } from "./core/inspector.ts";

// Run widget registrations
import "./widgets/index.ts";
