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

  test("fallback renderer accepts { text } objects, and renders nothing without one", async () => {
    const t = await mountApp(
      <ToolRender defaultOpen call={{ name: "Mystery", data: { text: "**bold** object form" } }} />,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("bold object form");

    const empty = await mountApp(<ToolRender defaultOpen call={{ name: "Mystery" }} />, OPTS);
    await empty.settle();
    expect(empty.text()).not.toContain("undefined");
  });

  test("bash renderer falls back to args for the command and hides summary without an exit code", async () => {
    const t = await mountApp(
      <ToolRender defaultOpen call={{ name: "Bash", args: "echo hi" }} />,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("echo hi"); // falls back to args when data.command is absent
    expect(text).not.toContain("exit"); // no exitCode -> no summary
  });

  test("edit renderer renders nothing without data, and falls back to empty strings for missing text", async () => {
    const noData = await mountApp(
      <ToolRender defaultOpen call={{ name: "Edit", args: "a.ts" }} />,
      OPTS,
    );
    await noData.settle();
    expect(noData.text()).not.toContain("diff");

    const partial = await mountApp(
      <ToolRender defaultOpen call={{ name: "Edit", data: { newText: "only new" } }} />,
      OPTS,
    );
    await partial.settle();
    expect(partial.text()).toContain("only new");

    const noNewText = await mountApp(
      <ToolRender defaultOpen call={{ name: "Edit", data: { oldText: "only old" } }} />,
      OPTS,
    );
    await noNewText.settle();
    expect(noNewText.text()).toContain("only old");
  });

  test("bash renderer falls back to an empty command with neither data.command nor args", async () => {
    const t = await mountApp(<ToolRender defaultOpen call={{ name: "Bash", data: {} }} />, OPTS);
    await t.settle();
    expect(t.text()).not.toContain("undefined");
  });

  test("write renderer falls back to no language and empty content when data is missing", async () => {
    const t = await mountApp(<ToolRender defaultOpen call={{ name: "Write", data: {} }} />, OPTS);
    await t.settle();
    // Should render without throwing; nothing meaningful to assert on empty content.
    expect(t.text()).not.toContain("undefined");
  });

  test("write renderer: shows the path as summary and highlights the content", async () => {
    const t = await mountApp(
      <ToolRender
        defaultOpen
        call={{
          name: "Write",
          args: "b.ts",
          data: { language: "ts", content: "const y = 3", path: "b.ts" },
        }}
      />,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("📄"); // write icon
    expect(text).toContain("b.ts"); // path used as the collapsed summary
    expect(text).toContain("const y = 3"); // highlighted content
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
