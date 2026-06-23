import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { Chip, FileChip, Pill } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 40,
  rows: 5,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

describe("Chip", () => {
  test("bracket variant wraps the label", async () => {
    const t = await mountApp(<Chip variant="bracket">tag</Chip>, OPTS);
    await t.settle();
    expect(t.text()).toContain("[tag]");
  });

  test("renders an icon and a removable ×", async () => {
    const t = await mountApp(
      <Chip icon=">" onRemove={() => {}}>
        config.json
      </Chip>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain(">");
    expect(text).toContain("config.json");
    expect(text).toContain("×");
  });

  test("onRemove fires from the × only", async () => {
    let removed = 0;
    const t = await mountApp(
      <Chip id="c" onRemove={() => removed++}>
        x
      </Chip>,
      OPTS,
    );
    await t.settle();
    // The × is the last child of the chip's HBox.
    const chip = t.findById<Widget>("c") as Widget;
    const cross = chip.children[chip.children.length - 1] as Widget;
    cross.onClick?.({} as never);
    expect(removed).toBe(1);
  });
});

describe("Pill", () => {
  test("shows a dot and label", async () => {
    const t = await mountApp(<Pill color="$success">ready</Pill>, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("●");
    expect(text).toContain("ready");
  });
});

describe("FileChip", () => {
  test("shows basename:line and reports the full path on click", async () => {
    const opened: Array<[string, number | undefined]> = [];
    const t = await mountApp(
      <FileChip id="f" path="src/core/app.ts" line={42} onOpen={(p, l) => opened.push([p, l])} />,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("app.ts:42");
    expect(t.text()).not.toContain("src/core"); // basename only
    const chip = t.findById<Widget>("f") as Widget;
    chip.onClick?.({} as never);
    expect(opened).toEqual([["src/core/app.ts", 42]]);
  });
});
