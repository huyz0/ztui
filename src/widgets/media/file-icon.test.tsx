import { createElement } from "react";
import { describe, expect, test, vi } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { FileIcon } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { iconRegistry } from "../../render/icon-registry.ts";
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

describe("FileIconWidget render guards", () => {
  test("invisible widget skips rendering entirely", async () => {
    const t = await mountApp(fileIconEl({ id: "ic", filename: "main.ts", visible: false }));
    const w = t.findById<FileIconWidget>("ic")!;
    await t.settle();
    const client = (w as any).getClientRect();
    expect(t.cellAt(client.x, client.y).icon).toBeUndefined();
  });

  test("a box too small to fit the icon (width < 2) skips writing cells", async () => {
    const t = await mountApp(fileIconEl({ id: "ic", filename: "main.ts" }));
    const w = t.findById<FileIconWidget>("ic")!;
    await t.settle();
    // Force a sub-2-column client rect to hit the early-return guard directly.
    (w as any).region = new Region(new Offset(0, 0), new Size(1, 1));
    t.buffer.cells[0][0].icon = undefined;
    w.render(t.buffer);
    expect(t.cellAt(0, 0).icon).toBeUndefined();
  });

  test("explicit background bypasses the theme-default background fallback", async () => {
    const t = await mountApp(
      fileIconEl({ id: "ic", filename: "main.ts", style: { background: "#00ff00" } }),
    );
    const w = t.findById<FileIconWidget>("ic")!;
    await t.settle();
    const client = (w as any).getClientRect();
    expect(t.cellAt(client.x, client.y).style.background).toBe("#00ff00");
  });

  test("falls back to a two-space placeholder when the resolved icon isn't registered", async () => {
    const getSpy = vi.spyOn(iconRegistry, "get").mockReturnValue(undefined);
    try {
      const t = await mountApp(fileIconEl({ id: "ic", filename: "main.ts" }));
      const w = t.findById<FileIconWidget>("ic")!;
      await t.settle();
      const client = (w as any).getClientRect();
      expect(t.cellAt(client.x, client.y).char).toBe("  ");
    } finally {
      getSpy.mockRestore();
    }
  });

  test("does not write a wide-continuation cell when the icon sits at the last column", async () => {
    const t = await mountApp(fileIconEl({ id: "ic", filename: "main.ts" }));
    const w = t.findById<FileIconWidget>("ic")!;
    await t.settle();
    // Render into a 2-wide buffer with the widget flush against the right edge
    // so client.x + 1 === buffer.width and the wide-continuation write is skipped.
    (w as any).region = new Region(new Offset(1, 0), new Size(2, 1));
    const buf = new ScreenBuffer(2, 1);
    w.render(buf);
    const client = (w as any).getClientRect();
    expect(client.x + 1).toBe(buf.width);
    expect(buf.cells[0][client.x].icon).toBeTruthy();
  });

  test("skips writing cells when the client rect falls outside the buffer", async () => {
    const t = await mountApp(fileIconEl({ id: "ic", filename: "main.ts" }));
    const w = t.findById<FileIconWidget>("ic")!;
    await t.settle();
    // Push the widget's region off the right/bottom edge of a small buffer so
    // getClientRect() returns coordinates >= buffer bounds.
    (w as any).region = new Region(new Offset(5, 5), new Size(2, 1));
    const buf = new ScreenBuffer(4, 4);
    expect(() => w.render(buf)).not.toThrow();
    expect(buf.cells[3][3].icon).toBeUndefined();
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

  test("resolves by extension alone when no filename is given", async () => {
    const t = await mountApp(<FileIcon id="ric" extension="ts" />);
    await t.settle();
    const w = t.findById("ric")!;
    const client = (w as any).getClientRect();
    const cell = t.cellAt(client.x, client.y);
    expect(cell.icon).toBeTruthy();
    expect(cell.style.color).toMatch(/^#/);
  });

  test("falls back to the default icon when neither filename nor extension is given", async () => {
    const t = await mountApp(<FileIcon id="ric" />);
    await t.settle();
    const w = t.findById("ric")!;
    const client = (w as any).getClientRect();
    const cell = t.cellAt(client.x, client.y);
    expect(cell.icon).toBeTruthy();
  });
});
