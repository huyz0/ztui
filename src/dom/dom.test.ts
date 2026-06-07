import { describe, expect, test } from "vitest";
import { parseTCSS } from "../css/css-parser.ts";
import { CSSResolver } from "../css/css-resolver.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Spacing } from "../geometry/spacing.ts";
import { BoxLayout } from "../layout/box-layout.ts";
import { DockLayout } from "../layout/dock-layout.ts";
import { GridLayout } from "../layout/grid-layout.ts";
import { TextNode } from "../react/host-config.ts";
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
