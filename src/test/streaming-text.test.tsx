import { describe, expect, test } from "vitest";
import type { App } from "../core/app.ts";
import type { DOMNode } from "../dom/dom.ts";
import { StreamingText } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 40,
  rows: 4,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

/** Whether a self-animating caret (spinner) is mounted — its glyph blinks, so
 *  asserting the structure is deterministic where the rendered frame isn't. */
function hasCaret(app: App): boolean {
  let found = false;
  const visit = (n: DOMNode) => {
    if ((n as { tagName?: string }).tagName === "spinner") found = true;
    for (const c of n.children) visit(c);
  };
  visit(app.activeScreen);
  return found;
}

describe("StreamingText", () => {
  test("shows the text and a blinking caret while streaming", async () => {
    const t = await mountApp(<StreamingText streaming>Hello wor</StreamingText>, OPTS);
    await t.settle();
    expect(t.text()).toContain("Hello wor");
    expect(hasCaret(t.app)).toBe(true);
  });

  test("no caret when not streaming", async () => {
    const t = await mountApp(<StreamingText streaming={false}>Done.</StreamingText>, OPTS);
    await t.settle();
    expect(t.text()).toContain("Done.");
    expect(hasCaret(t.app)).toBe(false);
  });
});
