// Core & DOM

export { requestAnimationTick } from "./anim/animation.ts";
export {
  ATTENTION_BREATH,
  type BreatheSpec,
  breatheColor,
  breatheIntensity,
  FOCUS_BREATH,
} from "./anim/breathe.ts";
export {
  EASINGS,
  type Easing,
  type EasingFn,
  interpolate,
  resolveEasing,
} from "./anim/easing.ts";
export { motion } from "./anim/motion.ts";
export { ColorTween, Tween, type TweenOptions } from "./anim/tween.ts";
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
export {
  type Toast,
  type ToastLevel,
  ToastManager,
  type ToastOptions,
  toast,
} from "./core/toast.ts";
export { DOMNode } from "./dom/dom.ts";
// Custom-widget registration: map a host tag name to a Widget subclass so it can
// appear in the tree. Pair with `hostComponent` from `ztui/react` for JSX.
// See the "Extending ztui" guide.
export { createWidgetByTagName, registerElement } from "./dom/element-registry.ts";
export { type OverlayPlacement, OverlayRootWidget } from "./dom/overlay.ts";
export { Screen, type ScreenLayer } from "./dom/screen.ts";
export { Scrollable } from "./dom/scrollable.ts";
export type { WidgetStyles } from "./dom/widget.ts";
export { Widget } from "./dom/widget.ts";
export { BunDriver } from "./driver/bun/index.ts";
// Drivers
export {
  type Clipboard,
  Driver,
  type KeyEvent,
  type MouseEvent,
  type TerminalCapabilities,
} from "./driver/driver.ts";
export { MockDriver } from "./driver/mock/index.ts";
export {
  type CanvasCell,
  type CanvasMetrics,
  type CanvasRenderOptions,
  measureCellFromBlock,
  renderBufferToCanvas,
} from "./driver/web/canvas-renderer.ts";
export { serializeForCanvas } from "./driver/web/canvas-serialize.ts";
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
export { type BlendBase, type Cell, type GraphicMetadata, ScreenBuffer } from "./render/buffer.ts";
export type { RGB } from "./render/color.ts";
export { colorMode } from "./render/color-mode.ts";
// Heroicons — lazy loading
export { registerHeroIcon, resolveHeroIcon } from "./render/heroicons.ts";
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
export { type IconDefinition, IconRegistry, iconRegistry } from "./render/icon-registry.ts";
export { RichText as RichTextEngine, type Span } from "./render/rich/text.ts";
export { Segment } from "./render/segment.ts";
export type { StyleProps, UnderlineStyle } from "./render/style.ts";
// Rendering & Styling
export { Style } from "./render/style.ts";
export type { Theme } from "./theme.ts";
export { adjustLightness, deriveTheme, ThemeManager } from "./theme.ts";
export { type LogLevel, logger } from "./utils/logger.ts";
export { CheckboxWidget } from "./widgets/controls/checkbox.ts";
export { FieldErrorWidget } from "./widgets/controls/field-error.ts";
export { type FormMessageMode, FormWidget } from "./widgets/controls/form.ts";
export { RadioGroupWidget, type RadioOption } from "./widgets/controls/radio-group.ts";
export { type SelectOption, SelectWidget } from "./widgets/controls/select.ts";
export { SliderWidget } from "./widgets/controls/slider.ts";
export { SwitchWidget } from "./widgets/controls/switch.ts";
export { TextAreaWidget } from "./widgets/controls/textarea.ts";
export { ToggleButtonWidget } from "./widgets/controls/toggle-button.ts";
export * from "./widgets/controls/validation.ts";
export { ValidationSummaryWidget } from "./widgets/controls/validation-summary.ts";
export { type DiffView, DiffWidget } from "./widgets/data/diff.ts";
export type { ListItem } from "./widgets/data/list-view.ts";
export { ListViewWidget } from "./widgets/data/list-view.ts";
export { RichLogWidget } from "./widgets/data/rich-log.ts";
export { type SelectionGlyphSet, SelectionListWidget } from "./widgets/data/selection-list.ts";
export { SparklineWidget } from "./widgets/data/sparkline.ts";
export type {
  SortDirection,
  SortState,
  TableColumn,
  TableTextStyle,
} from "./widgets/data/table.ts";
export { TableCellWidget, TableWidget } from "./widgets/data/table.ts";
export { TerminalViewWidget } from "./widgets/data/terminal-view.ts";
export { TracebackWidget } from "./widgets/data/traceback.ts";
export type { TreeNode } from "./widgets/data/tree.ts";
export { TreeWidget } from "./widgets/data/tree.ts";
export type { BannerGlyphSet, BannerVariant } from "./widgets/feedback/banner.ts";
export { BannerWidget } from "./widgets/feedback/banner.ts";
export { ProgressBarWidget } from "./widgets/feedback/progress-bar.ts";
export {
  type SpinnerMode as SpinnerWidgetMode,
  SpinnerWidget,
} from "./widgets/feedback/spinner.ts";
export {
  type GlyphSet,
  StatusBadgeWidget,
  StatusDotWidget,
  type StatusListItem as StatusListWidgetItem,
  StatusListWidget,
  type StatusState as StatusStateValue,
  statusGlyph,
} from "./widgets/feedback/status.ts";
export {
  type WaitingGridCells as WaitingGridWidgetCells,
  type WaitingGridVariant,
  WaitingGridWidget,
} from "./widgets/feedback/waiting-grid.ts";
export { type WaitingPanelVariant, WaitingPanelWidget } from "./widgets/feedback/waiting-panel.ts";
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
  type ResolvedIcon,
  registerSetiIcon,
  resolveFileIcon,
} from "./widgets/media/seti/seti-loader.ts";
export { SvgImageWidget } from "./widgets/media/svg-image.ts";
export { JSONUIWidget } from "./widgets/text/json-ui.ts";
export { RichTextWidget } from "./widgets/text/rich-text.ts";

// Register core widget elements with the element registry.
import "./widgets/register-core.ts";
