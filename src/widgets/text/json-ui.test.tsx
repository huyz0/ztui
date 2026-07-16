import { describe, expect, test } from "vitest";
import { TextNode } from "../../dom/text-node.ts";
import { Widget } from "../../dom/widget.ts";
import { reconciler } from "../../react/reconciler.ts";
import { JSONUI, render } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";
import { JSONUIWidget } from "./json-ui.ts";

describe("JSONUIWidget", () => {
  test("streams, repairs partial JSON, and updates dynamically", async () => {
    let actionName = "";
    const onAction = (name: string) => {
      actionName = name;
    };

    const partialJson = `{
      "type": "ztui-box",
      "id": "container",
      "style": { "padding": {"top": 1, "right": 2, "bottom": 1, "left": 2} },
      "children": [
        {
          "type": "ztui-label",
          "id": "lbl-status",
          "text": "Streaming...`;

    const { app, driver, settle } = await mountApp(
      <JSONUI onAction={onAction}>{partialJson}</JSONUI>,
      {
        cols: 80,
        rows: 25,
        capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
      },
    );

    const jsonuiWidget = app.activeScreen.children[0] as any;
    expect(jsonuiWidget.tagName).toBe("jsonui");
    expect(jsonuiWidget.children.length).toBe(1); // root box

    const box = jsonuiWidget.children[0];
    expect(box.tagName).toBe("box");
    expect(box.id).toBe("container");
    expect(box.padding.right).toBe(2);

    expect(box.children.length).toBe(1); // label
    const label = box.children[0];
    expect(label.tagName).toBe("label");
    expect(label.id).toBe("lbl-status");
    expect(label.getTextContent()).toBe("Streaming..."); // balanced quote/array/object

    // Complete the stream and add a button with a click action.
    const completeJson = `{
      "type": "ztui-box",
      "id": "container",
      "style": { "padding": {"top": 1, "right": 2, "bottom": 1, "left": 2} },
      "children": [
        {
          "type": "ztui-label",
          "id": "lbl-status",
          "text": "Completed"
        },
        {
          "type": "ztui-button",
          "id": "btn-submit",
          "text": "OK",
          "action": "submitted"
        }
      ]
    }`;

    render(<JSONUI onAction={onAction}>{completeJson}</JSONUI>, app.activeScreen);
    await settle();
    await driver.waitWrite();

    const updatedJsonuiWidget = app.activeScreen.children[0] as any;
    const updatedBox = updatedJsonuiWidget.children[0];
    expect(updatedBox.children.length).toBe(2);
    expect(updatedBox.children[0].getTextContent()).toBe("Completed");

    const btn = updatedBox.children[1];
    expect(btn.tagName).toBe("button");
    expect(btn.id).toBe("btn-submit");

    btn.onClick({ x: 0, y: 0 });
    expect(actionName).toBe("submitted");
  });

  test("updates the same container in-place, including clearing children", async () => {
    const json1 = `{"type": "ztui-box", "id": "box1", "style": { "margin": {"top": 1, "bottom": 1} }}`;
    const json2 = `{"type": "ztui-label", "id": "lbl2"}`;
    const jsonInvalid = `{"type": "invalid-tag"}`;

    const { screen, container, settle } = await mountApp(<JSONUI>{json1}</JSONUI>, {
      cols: 80,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
    });

    const widget1 = screen.children[0] as any;
    expect(widget1.children[0].id).toBe("box1");

    reconciler.updateContainer(<JSONUI>{json2}</JSONUI>, container, null, () => {});
    await settle();
    expect(widget1.children[0].id).toBe("lbl2");

    reconciler.updateContainer(<JSONUI>{jsonInvalid}</JSONUI>, container, null, () => {});
    await settle();
    expect(widget1.children.length).toBe(0);

    reconciler.updateContainer(<JSONUI>{""}</JSONUI>, container, null, () => {});
    await settle();
    expect(widget1.children.length).toBe(0);
  });

  test("defaults absent margin/padding sides to 0 and skips a click with no onAction handler", async () => {
    const json = `{
      "type": "ztui-box",
      "id": "container",
      "style": { "margin": {"right": 3, "left": 4}, "padding": {"right": 1, "left": 1} },
      "children": [
        {"type": "not-a-real-widget-tag"},
        {"no-type-field": true},
        {"type": "ztui-button", "id": "btn", "text": "Go", "action": "go"},
        {"type": "ztui-label"}
      ]
    }`;

    const { app, settle } = await mountApp(<JSONUI>{json}</JSONUI>, {
      cols: 80,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
    });
    await settle();

    const box = (app.activeScreen.children[0] as any).children[0];
    expect(box.margin.top).toBe(0);
    expect(box.margin.bottom).toBe(0);
    expect(box.margin.right).toBe(3);
    // The unknown tag and the type-less object yield no widget, so only the
    // button and the id-less label are appended.
    expect(box.children.length).toBe(2);

    const btn = box.children[0];
    expect(btn.id).toBe("btn");
    // The trailing label has no "id" field, so its widget.id is untouched.
    expect(box.children[1].id).toBe("");
    // No onAction was passed to <JSONUI>, so the click handler is a no-op.
    expect(() => btn.onClick({ x: 0, y: 0 })).not.toThrow();
  });

  test("a JSON primitive (not an object) parses but builds no widget tree", async () => {
    const { app, settle } = await mountApp(<JSONUI>{"42"}</JSONUI>, {
      cols: 80,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
    });
    await settle();
    const jsonuiWidget = app.activeScreen.children[0] as any;
    expect(jsonuiWidget.children.length).toBe(0);
  });

  test("DOM API (appendChild/insertBefore/removeChild) can be driven directly", () => {
    const jsonui = new JSONUIWidget();
    const txt3 = new TextNode("C");
    const txt4 = new TextNode("D");
    const normalWidget = new Widget("test");

    jsonui.appendChild(txt3);
    expect(jsonui.getRawJson()).toBe("C");

    jsonui.insertBefore(txt4, txt3);
    expect(jsonui.getRawJson()).toBe("D");

    jsonui.removeChild(txt4);
    expect(jsonui.getRawJson()).toBe("");

    jsonui.appendChild(normalWidget);
    jsonui.insertBefore(normalWidget, txt3);
    jsonui.removeChild(normalWidget);
  });
});
