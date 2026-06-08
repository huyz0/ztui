// Core & DOM
export { App } from "./core/app.ts";
export { startInspector } from "./core/inspector.ts";
export { DOMNode } from "./dom/dom.ts";
export { Screen } from "./dom/screen.ts";
export { Scrollable } from "./dom/scrollable.ts";
export type { WidgetStyles } from "./dom/widget.ts";
export { Widget } from "./dom/widget.ts";
export { BunDriver } from "./driver/bun/index.ts";
// Drivers
export { Driver } from "./driver/driver.ts";
export { MockDriver } from "./driver/mock/index.ts";
export { WebDriver } from "./driver/web/index.ts";
// Geometry
export { Offset } from "./geometry/offset.ts";
export { Region } from "./geometry/region.ts";
export { Size } from "./geometry/size.ts";
export { Spacing } from "./geometry/spacing.ts";
export {
  Box,
  Button,
  Dock,
  Footer,
  Grid,
  HBox,
  Header,
  HeroicIcon,
  type HeroicIconProps,
  Icon,
  type IconProps,
  Image,
  type ImageProps,
  Input,
  JSONUI,
  type JSONUIProps,
  Label,
  Markdown,
  type MarkdownProps,
  Mermaid,
  type MermaidProps,
  RichText,
  ScrollableBox,
  SvgImage,
  type SvgImageProps,
  Syntax,
  type SyntaxProps,
  VBox,
  View,
} from "./react/components.tsx";
// React Integration
export { render } from "./react/reconciler.ts";
export { ScreenBuffer } from "./render/buffer.ts";
export { renderBufferToHTML } from "./render/html-renderer.ts";
export { Markdown as MarkdownEngine } from "./render/rich/markdown.ts";
export { Syntax as SyntaxEngine } from "./render/rich/syntax.ts";
export { RichText as RichTextEngine } from "./render/rich/text.ts";
export { Segment } from "./render/segment.ts";
export type { StyleProps } from "./render/style.ts";
// Rendering & Styling
export { Style } from "./render/style.ts";
export { IconWidget } from "./widgets/icon.ts";
// Icon Registry
export { IconRegistry, iconRegistry } from "./widgets/icon-registry.ts";
export { ImageWidget } from "./widgets/image.ts";
export { JSONUIWidget } from "./widgets/json-ui.ts";
export { MarkdownWidget } from "./widgets/markdown.ts";
export { MermaidWidget } from "./widgets/mermaid.ts";
export { RichTextWidget } from "./widgets/rich-text.ts";
export { SvgImageWidget } from "./widgets/svg-image.ts";
export { SyntaxWidget } from "./widgets/syntax.ts";

// Run widget registrations
import "./widgets/index.ts";
