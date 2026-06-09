import { beforeAll, describe, expect, test } from "vitest";
import { FileIcon, iconRegistry, loadSetiIcons, resolveFileIcon } from "../../../index.ts";
import { mountApp } from "../../../test/harness.tsx";

describe("Seti File Icon Theme Loader and Component", () => {
  beforeAll(() => {
    // Make sure Seti icons are loaded once for the tests
    loadSetiIcons();
  });

  test("Correctly resolves files to Seti icon definitions", () => {
    // Exact file name match
    const packageJson = resolveFileIcon("package.json");
    expect(packageJson.name).toBe("seti:_npm");
    expect(packageJson.color).toBe("#41535b");

    // Standard extension match
    const tsFile = resolveFileIcon("index.ts");
    expect(tsFile.name).toBe("seti:_typescript");
    expect(tsFile.color).toBe("#519aba");

    // Multi-part extension match (.test.js -> test.js -> _javascript_1)
    const testJs = resolveFileIcon("app.test.js");
    expect(testJs.name).toBe("seti:_javascript_1");

    // Folder resolution
    const folder = resolveFileIcon("src", true);
    expect(folder.name).toBe("seti:_folder");
    expect(folder.color).toBe("#89b4fa");

    // Unknown fallback
    const unknown = resolveFileIcon("file.unknown");
    expect(unknown.name).toBe("seti:_default");
    expect(unknown.color).toBe("#d4d7d6");
  });

  test("Correctly parsed glyph outlines as SVGs in the registry", () => {
    const jsIcon = iconRegistry.get("seti:_javascript");
    expect(jsIcon).toBeDefined();
    expect(jsIcon?.svg).toContain("<svg");
    expect(jsIcon?.svg).toContain('viewBox="0 0 ');
    expect(jsIcon?.svg).toContain("<path d=");
    // Should contain the original glyph codepoint character as fallback
    expect(jsIcon?.textFallback).toBe(String.fromCodePoint(0xe051));
  });

  test("Renders <FileIcon> component within ZTUI render context", async () => {
    const { cellAt } = await mountApp(<FileIcon filename="server.go" id="icon-under-test" />, {
      cols: 40,
      rows: 5,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
    });

    const cell = cellAt(0, 0);
    expect(cell.icon).toBe("seti:_go2");
    expect(cell.style.color).toBe("#519aba"); // VS Code's Seti go color
  });
});
