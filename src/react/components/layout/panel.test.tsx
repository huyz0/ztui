import { describe, expect, test } from "vitest";
import { Label, Panel } from "../../../react.ts";
import { mountApp } from "../../../test/harness.tsx";

describe("Panel", () => {
  test("renders a flat header with title + actions and the body below", async () => {
    const t = await mountApp(
      <Panel title="Terminal" actions={<Label>X</Label>}>
        <Label>BODY</Label>
      </Panel>,
      { cols: 30, rows: 6 },
    );
    const lines = t.text().split("\n");
    expect(lines[0]).toContain("Terminal"); // header row
    expect(lines[0]).toContain("X"); // action on the header row
    expect(lines.slice(1).join("\n")).toContain("BODY"); // body below the header
  });

  test("omits the header entirely when given no icon/title/actions", async () => {
    const t = await mountApp(
      <Panel>
        <Label>ONLY_BODY</Label>
      </Panel>,
      { cols: 30, rows: 4 },
    );
    expect(t.text().split("\n")[0]).toContain("ONLY_BODY"); // body starts at row 0
  });

  test("accepts an icon node in the header", async () => {
    const t = await mountApp(
      <Panel icon={<Label>◆</Label>} title="Files">
        <Label>b</Label>
      </Panel>,
      { cols: 30, rows: 4 },
    );
    const header = t.text().split("\n")[0];
    expect(header).toContain("◆");
    expect(header).toContain("Files");
  });
});
