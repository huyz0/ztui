// Core & DOM
export { App } from "./core/app.ts";
export {
  eventToKey,
  formatKeyLabel,
  type Hotkey,
  type HotkeyGroup,
  type HotkeyOptions,
  HotkeyRegistry,
  hotkeys,
  isPriorityKey,
  matchesFilter,
  normalizeKey,
} from "./core/hotkeys.ts";
export { startInspector } from "./core/inspector.ts";
export { type LogLevel, logger } from "./core/logger.ts";
export type { Theme } from "./core/theme.ts";
export { adjustLightness, deriveTheme, ThemeManager } from "./core/theme.ts";
export {
  type Toast,
  type ToastLevel,
  ToastManager,
  type ToastOptions,
  toast,
} from "./core/toast.ts";
export { DOMNode } from "./dom/dom.ts";
export { type OverlayPlacement, OverlayRootWidget } from "./dom/overlay.ts";
export { Screen, type ScreenLayer } from "./dom/screen.ts";
export { Scrollable } from "./dom/scrollable.ts";
export type { WidgetStyles } from "./dom/widget.ts";
export { Widget } from "./dom/widget.ts";
export { BunDriver } from "./driver/bun/index.ts";
// Drivers
export { Driver } from "./driver/driver.ts";
export { MockDriver } from "./driver/mock/index.ts";
export {
  type CanvasCell,
  type CanvasMetrics,
  type CanvasRenderOptions,
  measureCellFromBlock,
  renderBufferToCanvas,
  serializeForCanvas,
} from "./driver/web/canvas-renderer.ts";
export {
  type AttachOptions,
  attachToDOM,
  type CellMetrics,
  measureCell,
  translateKeyboardEvent,
  translateMouseEvent,
} from "./driver/web/dom.ts";
export { WebDriver } from "./driver/web/index.ts";
// Geometry
export { Offset } from "./geometry/offset.ts";
export { Region } from "./geometry/region.ts";
export { Size } from "./geometry/size.ts";
export { Spacing } from "./geometry/spacing.ts";
// Heroicons — lazy loading
export { registerHeroIcon, resolveHeroIcon } from "./react/components/media/heroic-icon.tsx";
export {
  Box,
  Button,
  Checkbox,
  type CheckboxProps,
  Collapsible,
  type CollapsibleProps,
  CompactProgressBar,
  type CompactProgressBarProps,
  Dialog,
  type DialogProps,
  Diff,
  type DiffProps,
  Dock,
  EmailInput,
  type EmailInputProps,
  FieldError,
  type FieldErrorProps,
  FileIcon,
  type FileIconProps,
  Footer,
  Form,
  type FormProps,
  Grid,
  HBox,
  Header,
  HeroIcon,
  type HeroIconProps,
  type HeroIconVariant,
  HotkeyPalette,
  type HotkeyPaletteProps,
  Icon,
  type IconProps,
  Image,
  type ImageProps,
  Input,
  JSONUI,
  type JSONUIProps,
  Label,
  ListView,
  type ListViewProps,
  Markdown,
  type MarkdownProps,
  Mermaid,
  type MermaidProps,
  PasswordInput,
  type PasswordInputProps,
  ProgressBar,
  type ProgressBarProps,
  type QAMode,
  type QAOption,
  type QAResult,
  QuestionAnswer,
  type QuestionAnswerProps,
  RadioGroup,
  type RadioGroupProps,
  RichLog,
  type RichLogProps,
  RichText,
  ScrollableBox,
  Select,
  type SelectProps,
  Slider,
  type SliderProps,
  Sparkline,
  type SparklineProps,
  Spinner,
  type SpinnerMode,
  type SpinnerProps,
  StatusBadge,
  type StatusBadgeProps,
  StatusDot,
  type StatusDotProps,
  StatusList,
  type StatusListItem,
  type StatusListProps,
  type StatusState,
  StickyPanel,
  type StickyPanelProps,
  SvgImage,
  type SvgImageProps,
  Switch,
  type SwitchProps,
  Syntax,
  type SyntaxProps,
  TabContainer,
  type TabContainerProps,
  Table,
  type TableProps,
  TextArea,
  type TextAreaProps,
  type ToastGlyphSet,
  ToastHost,
  type ToastHostProps,
  type ToastPosition,
  ToggleButton,
  type ToggleButtonProps,
  Tree,
  type TreeProps,
  useHotkey,
  useToast,
  ValidationSummary,
  type ValidationSummaryProps,
  VBox,
  View,
  WaitingGrid,
  type WaitingGridCells,
  type WaitingGridProps,
  type WaitingGridVariant,
  WaitingPanel,
  type WaitingPanelProps,
  type WaitingPanelVariant,
} from "./react/components.tsx";
// React Integration
export { render } from "./react/reconciler.ts";
export { ScreenBuffer } from "./render/buffer.ts";
export {
  BUNDLED_FONT_FAMILY,
  HTML_CELL_HEIGHT,
  HTML_FONT_FAMILY,
  HTML_FONT_SIZE,
  HTML_LINE_HEIGHT,
  HTML_PADDING,
  renderBufferToHTML,
  renderBufferToText,
} from "./render/html-renderer.ts";
// Icon Registry
export { IconRegistry, iconRegistry } from "./render/icon-registry.ts";
export { Markdown as MarkdownEngine } from "./render/rich/markdown.ts";
export { Syntax as SyntaxEngine } from "./render/rich/syntax.ts";
export { RichText as RichTextEngine } from "./render/rich/text.ts";
export { Segment } from "./render/segment.ts";
export type { StyleProps } from "./render/style.ts";
// Rendering & Styling
export { Style } from "./render/style.ts";
export { CheckboxWidget } from "./widgets/controls/checkbox.ts";
export { FieldErrorWidget } from "./widgets/controls/field-error.ts";
export { type FormMessageMode, FormWidget } from "./widgets/controls/form.ts";
export { ProgressBarWidget } from "./widgets/controls/progress-bar.ts";
export { RadioGroupWidget } from "./widgets/controls/radio-group.ts";
export { SelectWidget } from "./widgets/controls/select.ts";
export { SliderWidget } from "./widgets/controls/slider.ts";
export {
  type SpinnerMode as SpinnerWidgetMode,
  SpinnerWidget,
} from "./widgets/controls/spinner.ts";
export {
  type GlyphSet,
  StatusBadgeWidget,
  StatusDotWidget,
  type StatusListItem as StatusListWidgetItem,
  StatusListWidget,
  type StatusState as StatusStateValue,
  statusGlyph,
} from "./widgets/controls/status.ts";
export { SwitchWidget } from "./widgets/controls/switch.ts";
export { TextAreaWidget } from "./widgets/controls/textarea.ts";
export { ToggleButtonWidget } from "./widgets/controls/toggle-button.ts";
export * from "./widgets/controls/validation.ts";
export { ValidationSummaryWidget } from "./widgets/controls/validation-summary.ts";
export {
  type WaitingGridCells as WaitingGridWidgetCells,
  WaitingGridWidget,
} from "./widgets/controls/waiting-grid.ts";
export { WaitingPanelWidget } from "./widgets/controls/waiting-panel.ts";
export { type DiffView, DiffWidget } from "./widgets/data/diff.ts";
export type { ListItem } from "./widgets/data/list-view.ts";
export { ListViewWidget } from "./widgets/data/list-view.ts";
export { RichLogWidget } from "./widgets/data/rich-log.ts";
export { SparklineWidget } from "./widgets/data/sparkline.ts";
export type {
  SortDirection,
  SortState,
  TableColumn,
  TableTextStyle,
} from "./widgets/data/table.ts";
export { TableCellWidget, TableWidget } from "./widgets/data/table.ts";
export type { TreeNode } from "./widgets/data/tree.ts";
export { TreeWidget } from "./widgets/data/tree.ts";
export {
  type CollapsibleGlyphSet,
  CollapsibleWidget,
} from "./widgets/layout/collapsible.ts";
export { TabContainerWidget } from "./widgets/layout/tabcontainer.ts";
export { FileIconWidget } from "./widgets/media/file-icon.ts";
export { IconWidget } from "./widgets/media/icon.ts";
export { ImageWidget } from "./widgets/media/image.ts";
// Seti File Icons — lazy loading
export {
  loadSetiIcons,
  loadSetiTheme,
  registerSetiIcon,
  resolveFileIcon,
} from "./widgets/media/seti/seti-loader.ts";
export { SvgImageWidget } from "./widgets/media/svg-image.ts";
export { JSONUIWidget } from "./widgets/text/json-ui.ts";
export { MarkdownWidget } from "./widgets/text/markdown.ts";
export { MermaidWidget } from "./widgets/text/mermaid.ts";
export { RichTextWidget } from "./widgets/text/rich-text.ts";
export { SyntaxWidget } from "./widgets/text/syntax.ts";

// Run widget registrations
import "./widgets/index.ts";
