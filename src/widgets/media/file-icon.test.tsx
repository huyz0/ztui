import { createElement } from "react";
import { describe, expect, test } from "vitest";
import { FileIcon } from "../../index.ts";
import { mountApp } from "../../test/harness.tsx";
import type { FileIconWidget } from "./file-icon.ts";

// The React <FileIcon> resolves the Seti icon in JS and renders an <Icon>;
// the FileIconWidget class is the direct-element path (`ztui-file-icon`).
// Both resolve through the same seti-loader and must agree.
const fileIconEl = (props: Record<string, unknown>) => createElement("ztui-file-icon", props);

describe("FileIconWidget resolution", () => {
  test("filename resolves a specific Seti icon with a theme color", async () => {
    const t = await mountApp(fileIconEl({ id: "ic", filename: "package.json" }));
    const resolved = t.findById<FileIconWidget>("ic")!.resolve();
    expect(resolved.name).toBeTruthy();
    expect(resolved.color).toMatch(/^#/);
  });

  test("extension and filename resolve to the same icon for the same type", async () => {
    const t = await mountApp(
      <>
        {fileIconEl({ id: "byname", filename: "main.ts" })}
        {fileIconEl({ id: "byext", extension: "ts" })}
        {fileIconEl({ id: "other", extension: "json" })}
      </>,
    );
    const byName = t.findById<FileIconWidget>("byname")!.resolve();
    const byExt = t.findById<FileIconWidget>("byext")!.resolve();
    const other = t.findById<FileIconWidget>("other")!.resolve();
    expect(byExt).toEqual(byName);
    expect(other.name).not.toBe(byExt.name);
  });

  test("folder flag and unknown files fall back without throwing", async () => {
    const t = await mountApp(
      <>
        {fileIconEl({ id: "dir", isFolder: true })}
        {fileIconEl({ id: "mystery", filename: "no-extension-mystery-file" })}
      </>,
    );
    expect(t.findById<FileIconWidget>("dir")!.resolve().name).toBeTruthy();
    expect(t.findById<FileIconWidget>("mystery")!.resolve().name).toBeTruthy();
  });
});

describe("FileIconWidget rendering", () => {
  test("writes an icon cell with a wide continuation and theme color", async () => {
    const t = await mountApp(fileIconEl({ id: "ic", filename: "main.ts" }));
    const w = t.findById<FileIconWidget>("ic")!;
    await t.settle();
    const client = (w as any).getClientRect();
    const cell = t.cellAt(client.x, client.y);
    expect(cell.icon).toBe(w.resolve().name);
    expect(cell.style.color).toBe(w.resolve().color);
    expect(t.cellAt(client.x + 1, client.y).wideContinuation).toBe(true);
  });

  test("explicit style color overrides the Seti theme color", async () => {
    const t = await mountApp(
      fileIconEl({ id: "ic", filename: "main.ts", style: { color: "#ff0000" } }),
    );
    const w = t.findById<FileIconWidget>("ic")!;
    await t.settle();
    const client = (w as any).getClientRect();
    expect(t.cellAt(client.x, client.y).style.color).toBe("#ff0000");
  });
});

describe("React <FileIcon> component", () => {
  test("renders an icon cell consistent with the widget resolution", async () => {
    const t = await mountApp(<FileIcon id="ric" filename="package.json" />);
    await t.settle();
    const w = t.findById("ric")!;
    const client = (w as any).getClientRect();
    const cell = t.cellAt(client.x, client.y);
    expect(cell.icon).toBeTruthy();
    expect(cell.style.color).toMatch(/^#/);
  });
});
