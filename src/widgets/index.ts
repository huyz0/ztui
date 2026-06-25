// Kitchen-sink widget aggregate: re-exports every widget class and registers
// every element (core + the optional text engines). Internal test convenience —
// NOT a package entry point. Application code should import the scoped entries
// (`ztui`, `ztui/markdown`, `ztui/syntax`, `ztui/mermaid`) instead.
import "./register-core.ts";
import "./text/register-markdown.ts";
import "./text/register-mermaid.ts";
import "./text/register-syntax.ts";

export { ButtonWidget } from "./controls/button.ts";
export { ButtonGroupWidget } from "./controls/button-group.ts";
export { CheckboxWidget } from "./controls/checkbox.ts";
export { FieldErrorWidget } from "./controls/field-error.ts";
export { type FormMessageMode, FormWidget } from "./controls/form.ts";
export { InputWidget } from "./controls/input.ts";
export { RadioGroupWidget } from "./controls/radio-group.ts";
export { SelectWidget } from "./controls/select.ts";
export { SliderWidget } from "./controls/slider.ts";
export { SwitchWidget } from "./controls/switch.ts";
export { TextAreaWidget } from "./controls/textarea.ts";
export { ToggleButtonWidget } from "./controls/toggle-button.ts";
export * from "./controls/validation.ts";
export { ValidationSummaryWidget } from "./controls/validation-summary.ts";
export { type DescriptionItem, DescriptionListWidget } from "./data/description-list.ts";
export { type DiffView, DiffWidget } from "./data/diff.ts";
export type { ListItem } from "./data/list-view.ts";
export { ListViewWidget } from "./data/list-view.ts";
export { RichLogWidget } from "./data/rich-log.ts";
export { type SelectionGlyphSet, SelectionListWidget } from "./data/selection-list.ts";
export { SparklineWidget } from "./data/sparkline.ts";
export type { SortDirection, SortState, TableColumn, TableTextStyle } from "./data/table.ts";
export { TableCellWidget, TableWidget } from "./data/table.ts";
export { TerminalViewWidget } from "./data/terminal-view.ts";
export { TracebackWidget } from "./data/traceback.ts";
export type { TreeNode } from "./data/tree.ts";
export { TreeWidget } from "./data/tree.ts";
export type { BannerGlyphSet, BannerVariant } from "./feedback/banner.ts";
export { BannerWidget } from "./feedback/banner.ts";
export { type GaugeThreshold, GaugeWidget } from "./feedback/gauge.ts";
export { ProgressBarWidget } from "./feedback/progress-bar.ts";
export { type SpinnerMode, SpinnerWidget } from "./feedback/spinner.ts";
export {
  type GlyphSet,
  StatusBadgeWidget,
  StatusDotWidget,
  type StatusListItem,
  StatusListWidget,
  type StatusState,
  statusGlyph,
} from "./feedback/status.ts";
export {
  type WaitingGridCells,
  type WaitingGridVariant,
  WaitingGridWidget,
} from "./feedback/waiting-grid.ts";
export { type WaitingPanelVariant, WaitingPanelWidget } from "./feedback/waiting-panel.ts";
export { AttentionWidget } from "./layout/attention.ts";
export { BoxWidget, ScrollableBoxWidget } from "./layout/box.ts";
export { type CollapsibleGlyphSet, CollapsibleWidget } from "./layout/collapsible.ts";
export { type DividerOrientation, DividerWidget } from "./layout/divider.ts";
export { DockWidget } from "./layout/dock.ts";
export { FooterWidget } from "./layout/footer.ts";
export { GridWidget } from "./layout/grid.ts";
export { HBoxWidget } from "./layout/hbox.ts";
export { HeaderWidget } from "./layout/header.ts";
export { type SplitterOrientation, SplitterWidget } from "./layout/splitter.ts";
export { TabContainerWidget } from "./layout/tabcontainer.ts";
export { VBoxWidget } from "./layout/vbox.ts";
export { FileIconWidget } from "./media/file-icon.ts";
export { IconWidget } from "./media/icon.ts";
export { ImageWidget } from "./media/image.ts";
export { SvgImageWidget } from "./media/svg-image.ts";
export { JSONUIWidget } from "./text/json-ui.ts";
export { LabelWidget } from "./text/label.ts";
export { MarkdownWidget } from "./text/markdown.ts";
export { MermaidWidget } from "./text/mermaid.ts";
export { RichTextWidget } from "./text/rich-text.ts";
export { SyntaxWidget } from "./text/syntax.ts";
