import { describe, expect, test } from "vitest";
import { parseTCSS } from "../css/css-parser.ts";
import { CSSResolver } from "../css/css-resolver.ts";
import { TextNode } from "../dom/text-node.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Spacing } from "../geometry/spacing.ts";
import { BoxLayout } from "../layout/box-layout.ts";
import { DockLayout } from "../layout/dock-layout.ts";
import { GridLayout } from "../layout/grid-layout.ts";
import {
  BoxWidget,
  DockWidget,
  FooterWidget,
  GridWidget,
  HBoxWidget,
  HeaderWidget,
  LabelWidget,
  VBoxWidget,
} from "../widgets/index.ts";
import { DOMNode } from "./dom.ts";
import { Widget } from "./widget.ts";

describe("DOM and layout resolution", () => {
  test("DOM tree operations", () => {
    const parent = new DOMNode("view");
    const child = new DOMNode("button");
    child.id = "btn1";
    child.classes.add("clickable");

    parent.appendChild(child);

    expect(parent.children.length).toBe(1);
    expect(child.parent).toBe(parent);
    expect(child.matchesSelector("button")).toBe(true);
    expect(child.matchesSelector("#btn1")).toBe(true);
    expect(child.matchesSelector(".clickable")).toBe(true);
  });

  test("TCSS Parsing and CSS Resolving", () => {
    const rules = parseTCSS(`
      button {
        color: red;
        background: black;
      }
      .blue-bg {
        background: blue;
      }
    `);

    expect(rules.length).toBe(2);
    expect(rules[0].selector).toBe("button");

    const widget = new Widget("button");
    widget.classes.add("blue-bg");

    const resolver = new CSSResolver(rules);
    const style = resolver.resolveStyles(widget, false);

    expect(style.color).toBe("red");
    expect(style.background).toBe("blue"); // Class overrides tag name because specificity of class is 10, tag is 1
  });

  test("BoxLayout resolution", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(100, 10));

    const child1 = new Widget("button");
    child1.style.height = "2h"; // height 2
    const child2 = new Widget("button");
    child2.style.height = "1fr"; // height fill remaining (8)

    parent.appendChild(child1);
    parent.appendChild(child2);

    const layout = new BoxLayout("vertical");
    layout.resolve(parent);

    expect(child1.region.height).toBe(2);
    expect(child2.region.height).toBe(8);
    expect(child1.region.y).toBe(0);
    expect(child2.region.y).toBe(2);
  });

  test("Compound selector matching", () => {
    const widget = new Widget("button");
    widget.id = "my-btn";
    widget.classes.add("primary");
    widget.classes.add("active");

    expect(widget.matchesSelector("button")).toBe(true);
    expect(widget.matchesSelector(".primary")).toBe(true);
    expect(widget.matchesSelector(".active")).toBe(true);
    expect(widget.matchesSelector("#my-btn")).toBe(true);
    expect(widget.matchesSelector("button.primary")).toBe(true);
    expect(widget.matchesSelector("button.primary.active")).toBe(true);
    expect(widget.matchesSelector("button#my-btn.primary.active")).toBe(true);
    expect(widget.matchesSelector(".primary.active")).toBe(true);

    expect(widget.matchesSelector("div")).toBe(false);
    expect(widget.matchesSelector("button.secondary")).toBe(false);
    expect(widget.matchesSelector("button#other-btn")).toBe(false);
  });

  test("CSS Specificity with compound selectors", () => {
    const rules = parseTCSS(`
      button {
        color: red;
        background: black;
      }
      button.primary {
        background: blue;
      }
      button#my-btn.primary {
        color: green;
      }
    `);

    const widget = new Widget("button");
    widget.id = "my-btn";
    widget.classes.add("primary");

    const resolver = new CSSResolver(rules);
    const style = resolver.resolveStyles(widget, false);

    expect(style.color).toBe("green"); // Specificity 111 overrides tag specificity 1
    expect(style.background).toBe("blue"); // Specificity 11 overrides tag specificity 1
  });

  test("BoxLayout fraction remainder distribution", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(10, 10));

    const child1 = new Widget("button");
    child1.style.height = "1fr";
    const child2 = new Widget("button");
    child2.style.height = "1fr";
    const child3 = new Widget("button");
    child3.style.height = "1fr";

    parent.appendChild(child1);
    parent.appendChild(child2);
    parent.appendChild(child3);

    const layout = new BoxLayout("vertical");
    layout.resolve(parent);

    // Sum of heights must equal exactly parent height (10)
    const totalHeight = child1.region.height + child2.region.height + child3.region.height;
    expect(totalHeight).toBe(10);
    expect(child1.region.height).toBe(3);
    expect(child2.region.height).toBe(4);
    expect(child3.region.height).toBe(3);
  });

  test("GridLayout resolution", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(10, 10));

    const child1 = new Widget("button");
    const child2 = new Widget("button");
    const child3 = new Widget("button");
    const child4 = new Widget("button");

    parent.appendChild(child1);
    parent.appendChild(child2);
    parent.appendChild(child3);
    parent.appendChild(child4);

    const layout = new GridLayout(2);
    layout.resolve(parent);

    expect(child1.region.width).toBe(5);
    expect(child1.region.height).toBe(5);
    expect(child1.region.x).toBe(0);
    expect(child1.region.y).toBe(0);

    expect(child2.region.x).toBe(5);
    expect(child2.region.y).toBe(0);

    expect(child3.region.x).toBe(0);
    expect(child3.region.y).toBe(5);

    expect(child4.region.x).toBe(5);
    expect(child4.region.y).toBe(5);
  });

  test("GridLayout distributes the floor-division remainder instead of leaving a gap", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(80, 10));

    const children = Array.from({ length: 6 }, () => new Widget("button"));
    for (const c of children) parent.appendChild(c);

    // 3 columns over 80 width: 80 / 3 = 26.67 -> naive floor division gives
    // cellWidth 26 and only covers 78 of the 80 columns.
    const layout = new GridLayout(3);
    layout.resolve(parent);

    const [c0, c1, c2, c3] = children;
    // The remainder (2) is distributed across the first 2 columns.
    expect(c0.region.width).toBe(27);
    expect(c1.region.width).toBe(27);
    expect(c2.region.width).toBe(26);
    // Columns must be contiguous and span the full 80-wide row.
    expect(c1.region.x).toBe(c0.region.x + c0.region.width);
    expect(c2.region.x).toBe(c1.region.x + c1.region.width);
    expect(c2.region.x + c2.region.width).toBe(80);

    // Second row starts right after the first row's height, with no gap.
    expect(c3.region.y).toBe(c0.region.y + c0.region.height);
  });

  test("DockLayout resolution", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(10, 10));

    const topChild = new Widget("button");
    topChild.style.dock = "top";
    topChild.style.height = 2;

    const bottomChild = new Widget("button");
    bottomChild.style.dock = "bottom";
    bottomChild.style.height = 2;

    const leftChild = new Widget("button");
    leftChild.style.dock = "left";
    leftChild.style.width = 2;

    const rightChild = new Widget("button");
    rightChild.style.dock = "right";
    rightChild.style.width = 2;

    const centerChild = new Widget("button");

    parent.appendChild(topChild);
    parent.appendChild(bottomChild);
    parent.appendChild(leftChild);
    parent.appendChild(rightChild);
    parent.appendChild(centerChild);

    const layout = new DockLayout();
    layout.resolve(parent);

    // Top child region
    expect(topChild.region.x).toBe(0);
    expect(topChild.region.y).toBe(0);
    expect(topChild.region.width).toBe(10);
    expect(topChild.region.height).toBe(2);

    // Bottom child region
    expect(bottomChild.region.x).toBe(0);
    expect(bottomChild.region.y).toBe(8);
    expect(bottomChild.region.width).toBe(10);
    expect(bottomChild.region.height).toBe(2);

    // Left child region (remaining y range: 2 to 8, height 6)
    expect(leftChild.region.x).toBe(0);
    expect(leftChild.region.y).toBe(2);
    expect(leftChild.region.width).toBe(2);
    expect(leftChild.region.height).toBe(6);

    // Right child region
    expect(rightChild.region.x).toBe(8);
    expect(rightChild.region.y).toBe(2);
    expect(rightChild.region.width).toBe(2);
    expect(rightChild.region.height).toBe(6);

    // Center child region (takes the rest)
    expect(centerChild.region.x).toBe(2);
    expect(centerChild.region.y).toBe(2);
    expect(centerChild.region.width).toBe(6);
    expect(centerChild.region.height).toBe(6);
  });

  test("DockLayout gives the fill rect to only the first undocked child", () => {
    // Regression: a second undocked ("fill") child got the same full
    // `remaining` rect as the first instead of an empty one, so it silently
    // overlapped it.
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(10, 10));

    const firstFill = new Widget("box");
    const secondFill = new Widget("box");

    parent.appendChild(firstFill);
    parent.appendChild(secondFill);

    new DockLayout().resolve(parent);

    expect(firstFill.region.width).toBe(10);
    expect(firstFill.region.height).toBe(10);
    // The second fill child must not also claim the full rect.
    expect(secondFill.region.width).toBe(0);
    expect(secondFill.region.height).toBe(0);
  });

  test("DockLayout resolves docks on both sides of a fill child, regardless of source order", () => {
    // Regression: an earlier fix attempt shrank `remaining` immediately after
    // assigning the fill child, which broke the common
    // <Header/><MainContent/><Footer/> pattern — a dock placed *after* the
    // fill child in source order must still get its edge space, not zero.
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(10, 10));

    const header = new Widget("box");
    header.style.dock = "top";
    header.style.height = 2;

    const content = new Widget("box"); // undocked, sits between the two docks

    const footer = new Widget("box");
    footer.style.dock = "bottom";
    footer.style.height = 2;

    parent.appendChild(header);
    parent.appendChild(content);
    parent.appendChild(footer);

    new DockLayout().resolve(parent);

    expect(header.region).toMatchObject({ y: 0, height: 2 });
    expect(footer.region).toMatchObject({ y: 8, height: 2 });
    // The fill child gets everything left after both docks, not just what was
    // left at its position in iteration order.
    expect(content.region).toMatchObject({ y: 2, height: 6 });
  });

  test("DockLayout clamps over-committed fixed docks to the space actually remaining", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(30, 20));

    const top1 = new Widget("box");
    top1.style.dock = "top";
    top1.style.height = 15;

    const top2 = new Widget("box");
    top2.style.dock = "top";
    top2.style.height = 15;

    parent.appendChild(top1);
    parent.appendChild(top2);

    new DockLayout().resolve(parent);

    expect(top1.region.height).toBe(15);
    // top1 already consumed 15 of the 20 available rows; top2 must clamp to
    // the 5 remaining rather than overflowing the container by 10 rows.
    expect(top2.region.y).toBe(15);
    expect(top2.region.height).toBe(5);
    expect(top2.region.y + top2.region.height).toBe(20);
  });

  test("DockLayout skips invisible, absolute, and non-Widget children", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(10, 10));

    const hidden = new Widget("box");
    hidden.style.dock = "top";
    hidden.style.height = 3;
    hidden.visible = false;

    const absolute = new Widget("box");
    absolute.style.dock = "left";
    absolute.style.width = 3;
    absolute.style.position = "absolute";

    const textNode = new TextNode("hello");

    const fill = new Widget("box");

    parent.appendChild(hidden);
    parent.appendChild(absolute);
    parent.appendChild(textNode);
    parent.appendChild(fill);

    new DockLayout().resolve(parent);

    // Neither the invisible nor the absolutely-positioned dock child should
    // have claimed any space from `remaining` — the fill child gets the
    // whole rect.
    expect(fill.region.width).toBe(10);
    expect(fill.region.height).toBe(10);
  });

  test("DockLayout resolves left/right docks with fixed widths and auto (measured) widths", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(20, 10));

    const left = new Widget("box");
    left.style.dock = "left";
    left.style.width = 4;

    const right = new Widget("button"); // auto width -> falls back to measuredWidth
    right.style.dock = "right";

    parent.appendChild(left);
    parent.appendChild(right);

    new DockLayout().resolve(parent);

    expect(left.region.x).toBe(0);
    expect(left.region.width).toBe(4);
    // The auto-width right dock claims its measured width from the right edge.
    expect(right.region.x).toBe(20 - right.measuredWidth);
    expect(right.region.width).toBe(right.measuredWidth);
  });

  test("DockLayout resolves top/bottom docks with auto (measured) heights", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(10, 10));

    const top = new Widget("button"); // auto height -> falls back to measuredHeight
    top.style.dock = "top";

    const bottom = new Widget("button");
    bottom.style.dock = "bottom";

    parent.appendChild(top);
    parent.appendChild(bottom);

    new DockLayout().resolve(parent);

    expect(top.region.y).toBe(0);
    expect(top.region.height).toBe(top.measuredHeight);
    expect(bottom.region.y).toBe(10 - bottom.measuredHeight);
    expect(bottom.region.height).toBe(bottom.measuredHeight);
  });

  test("DockLayout resolves left dock with an auto (measured) width", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(20, 10));

    const left = new Widget("button"); // auto width -> falls back to measuredWidth
    left.style.dock = "left";

    parent.appendChild(left);

    new DockLayout().resolve(parent);

    expect(left.region.x).toBe(0);
    expect(left.region.width).toBe(left.measuredWidth);
  });

  test("DockLayout treats an explicit 'auto' height/width the same as unset", () => {
    // Exercises the `=== "auto" || === undefined` check's first operand
    // (the tests above only left the property unset, hitting the second).
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(20, 10));

    const bottom = new Widget("button");
    bottom.style.dock = "bottom";
    bottom.style.height = "auto";

    const right = new Widget("button");
    right.style.dock = "right";
    right.style.width = "auto";

    parent.appendChild(bottom);
    parent.appendChild(right);

    new DockLayout().resolve(parent);

    expect(bottom.region.height).toBe(bottom.measuredHeight);
    expect(right.region.width).toBe(right.measuredWidth);
  });

  test("DockLayout falls back to remaining space for percentage/fr bottom and right docks", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(20, 20));

    const bottom = new Widget("box");
    bottom.style.dock = "bottom";
    bottom.style.height = "1fr";

    const right = new Widget("box");
    right.style.dock = "right";
    right.style.width = "1fr";

    parent.appendChild(bottom);
    parent.appendChild(right);

    new DockLayout().resolve(parent);

    // Non-numeric dimension results fall back to claiming all of `remaining`.
    expect(bottom.region.height).toBe(20);
    expect(right.region.width).toBe(20);
  });

  test("DockLayout falls back to remaining space for percentage/fr dock dimensions", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(20, 20));

    const top = new Widget("box");
    top.style.dock = "top";
    top.style.height = "1fr"; // parseDimension returns {fr}, not a number

    const left = new Widget("box");
    left.style.dock = "left";
    left.style.width = "1fr";

    parent.appendChild(top);
    parent.appendChild(left);

    new DockLayout().resolve(parent);

    // Non-numeric dimension results (fr weights) fall back to claiming all of
    // `remaining` rather than being treated as a concrete size.
    expect(top.region.height).toBe(20);
    expect(top.region.width).toBe(20);
    // `left`'s fr width also falls back to remaining.width (20), but no
    // vertical space is left after `top` consumed the full rect.
    expect(left.region.width).toBe(20);
    expect(left.region.height).toBe(0);
  });

  test("DOM tree insertBefore and removeChild", () => {
    const parent = new DOMNode("view");
    const child1 = new DOMNode("button");
    const child2 = new DOMNode("button");
    const child3 = new DOMNode("button");

    parent.appendChild(child1);
    parent.appendChild(child3);

    parent.insertBefore(child2, child3); // insert child2 before child3
    expect(parent.children[1]).toBe(child2);

    const child4 = new DOMNode("button");
    parent.insertBefore(child4, new DOMNode("other"));
    expect(parent.children[parent.children.length - 1]).toBe(child4);
  });

  test("CSSResolver coercion of spacing and constraints", () => {
    const rules = parseTCSS(`
      button {
        margin: 1 2 3 4;
        padding: 5;
        minWidth: 100;
      }
    `);
    const widget = new Widget("button");
    const resolver = new CSSResolver(rules);
    const style = resolver.resolveStyles(widget, false);
    expect(style.margin).toBeInstanceOf(Spacing);
    expect((style.margin as Spacing).top).toBe(1);
    expect((style.margin as Spacing).right).toBe(2);
    expect((style.padding as Spacing).top).toBe(5);
    expect((style.padding as Spacing).right).toBe(5);
    expect(style.minWidth).toBe(100);
  });

  test("BoxLayout horizontal resolution", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(10, 10));

    const child1 = new Widget("button");
    child1.style.width = "2w";
    const child2 = new Widget("button");
    child2.style.width = "1fr";

    parent.appendChild(child1);
    parent.appendChild(child2);

    const layout = new BoxLayout("horizontal");
    layout.resolve(parent);

    expect(child1.region.width).toBe(2);
    expect(child2.region.width).toBe(8);
  });

  test("BoxLayout adds cross-axis margins for fixed dimension children", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(20, 20));

    const child = new Widget("button");
    child.style.width = 5;
    child.style.height = 5;
    child.style.margin = 1;

    parent.appendChild(child);

    // Vertical layout: width is cross-axis, height is main-axis.
    const verticalLayout = new BoxLayout("vertical");
    verticalLayout.resolve(parent);

    // Cross-axis (width) should include margin (5 + 2 = 7)
    expect(child.region.width).toBe(7);
    // Main-axis (height) should include margin (5 + 2 = 7)
    expect(child.region.height).toBe(7);
    // client rect should be 5x5
    expect(child.getClientRect().width).toBe(5);
    expect(child.getClientRect().height).toBe(5);

    // Horizontal layout: height is cross-axis, width is main-axis.
    const horizontalLayout = new BoxLayout("horizontal");
    horizontalLayout.resolve(parent);

    expect(child.region.width).toBe(7);
    expect(child.region.height).toBe(7);
    expect(child.getClientRect().width).toBe(5);
    expect(child.getClientRect().height).toBe(5);
  });

  test("DockLayout dimension fallback tests", () => {
    const parent = new Widget("view");
    parent.region = new Region(Offset.ORIGIN, new Size(10, 10));

    const child = new Widget("button");
    child.style.dock = "top";
    child.style.height = "invalid";
    parent.appendChild(child);

    const layout = new DockLayout();
    layout.resolve(parent);
    expect(child.region.height).toBe(1);
  });

  test("matchesSelector invalid selector fallback", () => {
    const widget = new Widget("button");
    expect(widget.matchesSelector("button.class-not-closed[attr")).toBe(false);
  });

  test("Layout container widgets default styles and tags", () => {
    const vbox = new VBoxWidget();
    expect(vbox.tagName).toBe("vbox");
    expect(vbox.defaultStyle.layout).toBe("vertical");

    const hbox = new HBoxWidget();
    expect(hbox.tagName).toBe("hbox");
    expect(hbox.defaultStyle.layout).toBe("horizontal");

    const grid = new GridWidget();
    expect(grid.tagName).toBe("grid");
    expect(grid.defaultStyle.layout).toBe("grid");

    const dock = new DockWidget();
    expect(dock.tagName).toBe("dock");
    expect(dock.defaultStyle.layout).toBe("dock");
  });

  test("HeaderWidget and FooterWidget default style and render", () => {
    const header = new HeaderWidget();
    expect(header.tagName).toBe("header");
    expect(header.defaultStyle.dock).toBe("top");
    expect(header.defaultStyle.height).toBe(1);
    expect(header.getTextContent()).toBe("");

    const footer = new FooterWidget();
    expect(footer.tagName).toBe("footer");
    expect(footer.defaultStyle.dock).toBe("bottom");
    expect(footer.defaultStyle.height).toBe(1);
    expect(footer.getTextContent()).toBe("");
  });

  test("BoxWidget default styles and tags", () => {
    const box = new BoxWidget();
    expect(box.tagName).toBe("box");
  });

  test("Container shrink-wrapping bottom-up measurement pass", () => {
    const parent = new Widget("vbox");
    const label = new LabelWidget();
    const textNode = new TextNode("Hello World");
    label.appendChild(textNode);
    parent.appendChild(label);

    parent.measure(80, 24);

    expect(label.measuredWidth).toBe(11);
    expect(label.measuredHeight).toBe(1);

    expect(parent.measuredWidth).toBe(11);
    expect(parent.measuredHeight).toBe(1);
  });
});
