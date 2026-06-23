import { describe, expect, test } from "vitest";
import type { ToolRenderer } from "../react/components.tsx";
import { DEFAULT_TOOL_RENDERERS, ToolRender } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 60,
  rows: 16,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

describe("ToolRender", () => {
  test("bash renderer: header + syntax-highlighted command + streamed output", async () => {
    const t = await mountApp(
      <ToolRender
        defaultOpen
        call={{
          name: "Bash",
          args: "npm test",
          status: "success",
          data: { command: "npm test", output: ["PASS app.test.ts", "12 passed"], exitCode: 0 },
        }}
      />,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("🖥️"); // bash icon
    expect(text).toContain("Bash"); // card header
    expect(text).toContain("npm test"); // command (header + syntax body)
    expect(text).toContain("12 passed"); // streamed output line
  });

  test("bash summary shows the exit code while collapsed", async () => {
    const t = await mountApp(
      <ToolRender
        call={{ name: "Bash", args: "npm test", data: { command: "npm test", exitCode: 0 } }}
      />,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("exit 0");
  });

  test("edit renderer: shows a diff of before → after", async () => {
    const t = await mountApp(
      <ToolRender
        defaultOpen
        call={{
          name: "Edit",
          args: "a.ts",
          data: { language: "ts", oldText: "const x = 1", newText: "const x = 2" },
        }}
      />,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("Edit");
    expect(text).toContain("const x = 2"); // new line present in the diff
  });

  test("unknown tool falls back to text/markdown", async () => {
    const t = await mountApp(
      <ToolRender defaultOpen call={{ name: "Mystery", data: "just some **text**" }} />,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("just some text");
  });

  test("a custom renderer overrides a built-in", async () => {
    const custom: ToolRenderer = {
      icon: "★",
      summary: () => "custom",
      renderBody: () => null,
    };
    const t = await mountApp(
      <ToolRender
        call={{ name: "Bash", args: "ls" }}
        renderers={{ ...DEFAULT_TOOL_RENDERERS, Bash: custom }}
      />,
      { ...OPTS, cols: 80 },
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("★"); // custom icon replaced 🖥️
    expect(text).toContain("custom"); // custom summary
  });
});
