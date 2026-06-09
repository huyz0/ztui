// Core & DOM
export { App } from "./core/app.ts";
export { startInspector } from "./core/inspector.ts";
export { type LogLevel, logger } from "./core/logger.ts";
export type { Theme } from "./core/theme.ts";
export { adjustLightness, deriveTheme, ThemeManager } from "./core/theme.ts";
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
// Heroicons — lazy loading
export { registerHeroIcon, resolveHeroIcon } from "./react/components/heroic-icon.tsx";
export {
  Box,
  Button,
  Checkbox,
  type CheckboxProps,
  Dock,
  EmailInput,
  type EmailInputProps,
  FileIcon,
  type FileIconProps,
  Footer,
  Grid,
  HBox,
  Header,
  HeroIcon,
  type HeroIconProps,
  type HeroIconVariant,
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
  PasswordInput,
  type PasswordInputProps,
  RadioGroup,
  type RadioGroupProps,
  RichText,
  ScrollableBox,
  Select,
  type SelectProps,
  Slider,
  type SliderProps,
  SvgImage,
  type SvgImageProps,
  Switch,
  type SwitchProps,
  Syntax,
  type SyntaxProps,
  TabContainer,
  type TabContainerProps,
  TextArea,
  type TextAreaProps,
  ToggleButton,
  type ToggleButtonProps,
  VBox,
  View,
} from "./react/components.tsx";
// React Integration
export { render } from "./react/reconciler.ts";
export { ScreenBuffer } from "./render/buffer.ts";
export { renderBufferToHTML } from "./render/html-renderer.ts";
// Icon Registry
export { IconRegistry, iconRegistry } from "./render/icon-registry.ts";
export { Markdown as MarkdownEngine } from "./render/rich/markdown.ts";
export { Syntax as SyntaxEngine } from "./render/rich/syntax.ts";
export { RichText as RichTextEngine } from "./render/rich/text.ts";
export { Segment } from "./render/segment.ts";
export type { StyleProps } from "./render/style.ts";
// Rendering & Styling
export { Style } from "./render/style.ts";
export { CheckboxWidget } from "./widgets/checkbox.ts";
export { FileIconWidget } from "./widgets/file-icon.ts";
export { IconWidget } from "./widgets/icon.ts";
export { ImageWidget } from "./widgets/image.ts";
export { JSONUIWidget } from "./widgets/json-ui.ts";
export { MarkdownWidget } from "./widgets/markdown.ts";
export { MermaidWidget } from "./widgets/mermaid.ts";
export { RadioGroupWidget } from "./widgets/radio-group.ts";
export { RichTextWidget } from "./widgets/rich-text.ts";
export { SelectWidget } from "./widgets/select.ts";
// Seti File Icons — lazy loading
export {
  loadSetiIcons,
  loadSetiTheme,
  registerSetiIcon,
  resolveFileIcon,
} from "./widgets/seti/seti-loader.ts";
export { SliderWidget } from "./widgets/slider.ts";
export { SvgImageWidget } from "./widgets/svg-image.ts";
export { SwitchWidget } from "./widgets/switch.ts";
export { SyntaxWidget } from "./widgets/syntax.ts";
export { TabContainerWidget } from "./widgets/tabcontainer.ts";
export { TextAreaWidget } from "./widgets/textarea.ts";
export { ToggleButtonWidget } from "./widgets/toggle-button.ts";

// Run widget registrations
import "./widgets/index.ts";
