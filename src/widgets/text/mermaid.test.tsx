import { describe, expect, test } from "vitest";
import { hitTest } from "../../core/hit-test.ts";
import "../../mermaid.ts";
import { mountApp } from "../../test/harness.tsx";

describe("MermaidWidget", () => {
  test("interactive toggle button switches between diagram and source modes", async () => {
    const code = "graph TD\nA --> B";
    const { app } = await mountApp(<mermaid>{code}</mermaid>, {
      cols: 80,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
    });

    const mermaidWidget = app.activeScreen.children[0] as any;
    expect(mermaidWidget.showDiagram).toBe(true);

    const client = mermaidWidget.getClientRect();
    const clickX = client.right - 3;
    const clickY = client.y;

    const hit = hitTest(app.activeScreen, clickX, clickY) as any;
    expect(hit).toBeDefined();
    expect(hit.tagName).toBe("button");

    hit.onClick({ x: clickX, y: clickY, type: "press", button: "left" });
    expect(mermaidWidget.showDiagram).toBe(false);

    const hitOutside = hitTest(app.activeScreen, client.x, client.y) as any;
    expect(hitOutside).toBeDefined();
    expect(hitOutside.tagName).toBe("mermaid");
    if (hitOutside.onClick) {
      hitOutside.onClick({ x: client.x, y: client.y, type: "press", button: "left" });
    }
    expect(mermaidWidget.showDiagram).toBe(false);

    mermaidWidget.onKey({ key: " ", ctrl: false, meta: false, shift: false });
    expect(mermaidWidget.showDiagram).toBe(true);
  });
});
