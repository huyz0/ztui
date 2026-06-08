import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderSvgSync } from "./sharp-sync.ts";

vi.mock("node:child_process", () => {
  return {
    spawnSync: vi.fn(() => ({
      error: undefined,
      stdout: JSON.stringify({
        success: true,
        data: {
          pngBase64: "cG5n",
          pixelsBase64: "cGl4ZWxz",
          width: 10,
          height: 20,
        },
      }),
      stderr: "",
    })),
  };
});

describe("sharp-sync", () => {
  beforeEach(() => {
    (spawnSync as any).mockClear();
  });

  test("renderSvgSync successfully parses valid input", () => {
    (spawnSync as any).mockReturnValueOnce({
      error: undefined,
      stdout: JSON.stringify({
        success: true,
        data: {
          pngBase64: "cG5n",
          pixelsBase64: "cGl4ZWxz",
          width: 10,
          height: 20,
        },
      }),
      stderr: "",
    } as any);

    const res = renderSvgSync({
      svg: "<svg></svg>",
      width: 10,
      height: 20,
      isIcon: false,
    });

    expect(res.pngBase64).toBe("cG5n");
    expect(res.pixels).toEqual(new Uint8Array(Buffer.from("pixels")));
    expect(res.width).toBe(10);
    expect(res.height).toBe(20);
  });

  test("renderSvgSync handles spawnSync error", () => {
    (spawnSync as any).mockReturnValueOnce({
      error: new Error("spawn failed"),
      stdout: "",
      stderr: "",
    } as any);

    expect(() => {
      renderSvgSync({
        svg: "<svg></svg>",
        width: 10,
        height: 20,
        isIcon: false,
      });
    }).toThrow("Failed to spawn sharp-render-sync: spawn failed");
  });

  test("renderSvgSync handles invalid JSON stdout", () => {
    (spawnSync as any).mockReturnValueOnce({
      error: undefined,
      stdout: "invalid-json",
      stderr: "some stderr logs",
    } as any);

    expect(() => {
      renderSvgSync({
        svg: "<svg></svg>",
        width: 10,
        height: 20,
        isIcon: false,
      });
    }).toThrow("Failed to parse sharp-render-sync output: invalid-json. Stderr: some stderr logs");
  });

  test("renderSvgSync handles success: false response", () => {
    (spawnSync as any).mockReturnValueOnce({
      error: undefined,
      stdout: JSON.stringify({
        success: false,
        error: "internal sharp error",
      }),
      stderr: "",
    } as any);

    expect(() => {
      renderSvgSync({
        svg: "<svg></svg>",
        width: 10,
        height: 20,
        isIcon: false,
      });
    }).toThrow("Sharp sync render error: internal sharp error");
  });
});
