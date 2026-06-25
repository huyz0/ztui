import { protocolsDemo } from "../advanced_protocols.tsx";
import { animationDemo } from "../animation_demo.tsx";
import { bannerDemo } from "../banner_demo.tsx";
import { blendDemo } from "../blend_demo.tsx";
import { borderDemo } from "../border_demo.tsx";
import { boxTitleDemo } from "../box_title_demo.tsx";
import { buttonDemo } from "../button_demo.tsx";
import { buttonGroupDemo } from "../button_group_demo.tsx";
import { chartDemo } from "../chart_demo.tsx";
import { chatBubblesDemo } from "../chat_bubbles_demo.tsx";
import { chatDemo } from "../chat_demo.tsx";
import { checkboxDemo } from "../checkbox_demo.tsx";
import { clipboardDemo } from "../clipboard_demo.tsx";
import { collapsibleDemo } from "../collapsible_demo.tsx";
import { contextMenuDemo } from "../contextmenu_demo.tsx";
import { conversationDemo } from "../conversation_demo.tsx";
import { kitchenSinkDemo } from "../demo.tsx";
import { descriptionListDemo } from "../description_list_demo.tsx";
import { diffDemo } from "../diff_demo.tsx";
import { disabledDemo } from "../disabled_demo.tsx";
import { fileIconDemo } from "../fileicon_demo.tsx";
import { focusDemo } from "../focus_demo.tsx";
import { formDemo } from "../form_validation_demo.tsx";
import { galleryViewDemo } from "../gallery_view_demo.tsx";
import { gaugeDemo } from "../gauge_demo.tsx";
import { generativeUiDemo } from "../generative_ui.tsx";
import { groupedListDemo } from "../grouped_list_demo.tsx";
import { heroiconsDemo } from "../heroicons_demo.tsx";
import { hotkeysDemo } from "../hotkeys_demo.tsx";
import { ideDemo } from "../ide_demo.tsx";
import { imageDemo } from "../image_demo.tsx";
import { inputDemo } from "../input_demo.tsx";
import { listviewDemo } from "../listview_demo.tsx";
import { markdownDemo } from "../markdown_stream_demo.tsx";
import { modelPickerDemo } from "../model_picker_demo.tsx";
import { noColorDemo } from "../no_color_demo.tsx";
import { overlayDemo } from "../overlay_demo.tsx";
import { popoverDemo } from "../popover_demo.tsx";
import { qaDemo } from "../questionanswer_demo.tsx";
import { radioDemo } from "../radio_demo.tsx";
import { richDemo } from "../rich_demo.tsx";
import { richlogDemo } from "../richlog_demo.tsx";
import { selectDemo } from "../select_demo.tsx";
import { selectionListDemo } from "../selection_list_demo.tsx";
import { sliderDemo } from "../slider_demo.tsx";
import { sparklineDemo } from "../sparkline_demo.tsx";
import { splitviewDemo } from "../splitview_demo.tsx";
import { statusDemo } from "../status_demo.tsx";
import { switchDemo } from "../switch_demo.tsx";
import { tabsDemo } from "../tabcontainer_demo.tsx";
import { tableDemo } from "../table_demo.tsx";
import { terminalDemo } from "../terminal_view_demo.tsx";
import { textareaDemo } from "../textarea_demo.tsx";
import { themeCardsDemo } from "../theme_cards_demo.tsx";
import { themesDemo } from "../theme_explorer.tsx";
import { toggleButtonDemo } from "../toggle_button_demo.tsx";
import { toolCallDemo } from "../tool_call_demo.tsx";
import { tracebackDemo } from "../traceback_demo.tsx";
import { treeDemo } from "../tree_demo.tsx";
import { waitingDemo } from "../waiting_demo.tsx";
import { workbenchDemo } from "../workbench_demo.tsx";
import { workerDemo } from "../worker_demo.tsx";
import type { Demo } from "./types.ts";

/**
 * Every gallery-aware demo, in display order. Adding a demo is one line here
 * plus exporting a {@link Demo} from its module — the gallery, the CLI handle
 * (`bun run demo <id>`), and headless screenshot enumeration all read this list.
 */
export const demos: Demo[] = [
  kitchenSinkDemo,
  generativeUiDemo,
  workerDemo,
  tableDemo,
  modelPickerDemo,
  groupedListDemo,
  themeCardsDemo,
  galleryViewDemo,
  treeDemo,
  listviewDemo,
  selectionListDemo,
  diffDemo,
  richlogDemo,
  terminalDemo,
  waitingDemo,
  tracebackDemo,
  qaDemo,
  richDemo,
  markdownDemo,
  textareaDemo,
  chatDemo,
  conversationDemo,
  toolCallDemo,
  clipboardDemo,
  borderDemo,
  boxTitleDemo,
  chatBubblesDemo,
  collapsibleDemo,
  splitviewDemo,
  tabsDemo,
  overlayDemo,
  workbenchDemo,
  ideDemo,
  disabledDemo,
  focusDemo,
  formDemo,
  buttonDemo,
  buttonGroupDemo,
  inputDemo,
  checkboxDemo,
  switchDemo,
  selectDemo,
  contextMenuDemo,
  popoverDemo,
  sliderDemo,
  radioDemo,
  toggleButtonDemo,
  animationDemo,
  blendDemo,
  heroiconsDemo,
  fileIconDemo,
  imageDemo,
  protocolsDemo,
  hotkeysDemo,
  themesDemo,
  sparklineDemo,
  chartDemo,
  statusDemo,
  bannerDemo,
  noColorDemo,
  descriptionListDemo,
  gaugeDemo,
];

export function findDemo(id: string): Demo | undefined {
  return demos.find((d) => d.id === id);
}
