import { describe, expect, test } from "vitest";
import {
  ChatInputWidget,
  CopyButtonWidget,
  DevToolsHighlightWidget,
  DropdownOverlayWidget,
  MenuListWidget,
  QuoteBarWidget,
  SelectWidget,
} from "../core.ts";
import { createWidgetByTagName } from "../dom/element-registry.ts";
import "./register-core.ts";

describe("previously-orphaned widget classes are exported from the core entry", () => {
  // Regression test: MenuListWidget/ChatInputWidget/DevToolsHighlightWidget were
  // registered (so their JSX tags worked) but never re-exported from core.ts,
  // and CopyButtonWidget/QuoteBarWidget were fully orphaned (registered nowhere,
  // exported nowhere) — all silently blocking direct import/instanceof use.
  // DropdownOverlayWidget (Select's internal overlay) was likewise unexported,
  // inconsistent with ComboboxOverlayWidget which already is.
  test("registered tags produce instances of the now-exported classes", () => {
    expect(createWidgetByTagName("ztui-menu-list")).toBeInstanceOf(MenuListWidget);
    expect(createWidgetByTagName("ztui-chat-input")).toBeInstanceOf(ChatInputWidget);
    expect(createWidgetByTagName("ztui-devtools-highlight")).toBeInstanceOf(
      DevToolsHighlightWidget,
    );
  });

  test("classes with no registered tag are still directly constructible", () => {
    expect(new CopyButtonWidget()).toBeInstanceOf(CopyButtonWidget);
    expect(new QuoteBarWidget()).toBeInstanceOf(QuoteBarWidget);
    expect(new DropdownOverlayWidget(new SelectWidget(), 0, 0, 10, 5)).toBeInstanceOf(
      DropdownOverlayWidget,
    );
  });
});
