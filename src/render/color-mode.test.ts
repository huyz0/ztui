import { afterEach, describe, expect, test } from "vitest";
import { renderCapabilities, styleToEscapeCodes } from "./ansi-style.ts";
import { colorMode } from "./color-mode.ts";
import { Style } from "./style.ts";

// colorMode is a process-global consulted by every render; never leave it
// flipped, or later colour assertions elsewhere would break.
afterEach(() => colorMode.reset());

describe("colorMode (NO_COLOR)", () => {
  test("enabled by default, emitting fg/bg colour", () => {
    renderCapabilities.truecolor = true;
    expect(colorMode.enabled).toBe(true);
    const { start } = styleToEscapeCodes(new Style({ color: "#ff0000", background: "#00ff00" }));
    expect(start).toContain("\x1b[38;2;255;0;0m"); // fg
    expect(start).toContain("\x1b[48;2;0;255;0m"); // bg
  });

  test("disabled: drops all fg/bg/underline colour but keeps attributes", () => {
    colorMode.set(false);
    const { start, end } = styleToEscapeCodes(
      new Style({
        color: "#ff0000",
        background: "#00ff00",
        bold: true,
        underline: true,
        underlineColor: "#0000ff",
        reverse: true,
      }),
    );
    // No colour escapes at all (38/48 fg-bg, 58 underline colour).
    expect(start).not.toContain("38;2");
    expect(start).not.toContain("48;2");
    expect(start).not.toContain("58:2");
    expect(start).not.toContain("\x1b[39m");
    expect(end).not.toContain("\x1b[49m");
    // Monochrome attributes survive.
    expect(start).toContain("\x1b[1m"); // bold
    expect(start).toContain("\x1b[4:1m"); // underline (attribute, not colour)
    expect(start).toContain("\x1b[7m"); // reverse
  });

  test("links survive with colour off (OSC 8 is not colour)", () => {
    colorMode.set(false);
    const { start, end } = styleToEscapeCodes(
      new Style({ color: "#ff0000", link: "https://x.dev" }),
    );
    expect(start).toContain("\x1b]8;;https://x.dev\x1b\\");
    expect(end).toContain("\x1b]8;;\x1b\\");
    expect(start).not.toContain("38;2");
  });

  test("the per-Style serialization cache invalidates when colour is toggled", () => {
    // styleToEscapeCodes memoizes per immutable Style instance; toggling the
    // colour mode must drop those cached entries, or the *same* instance would
    // keep emitting its stale (coloured) escapes after NO_COLOR takes effect.
    const style = new Style({ color: "#ff0000", bold: true });
    colorMode.set(true);
    expect(styleToEscapeCodes(style).start).toContain("38;2;255;0;0");
    colorMode.set(false);
    const off = styleToEscapeCodes(style).start;
    expect(off).not.toContain("38;2"); // colour dropped despite the cache hit
    expect(off).toContain("\x1b[1m"); // bold attribute still emitted
    colorMode.set(true);
    expect(styleToEscapeCodes(style).start).toContain("38;2;255;0;0"); // colour back
  });

  test("set then reset restores the environment default", () => {
    const def = colorMode.enabled;
    colorMode.set(!def);
    expect(colorMode.enabled).toBe(!def);
    colorMode.reset();
    expect(colorMode.enabled).toBe(def);
  });

  describe("environment defaults (via reset)", () => {
    const saved = {
      NO_COLOR: process.env.NO_COLOR,
      ZTUI_NO_COLOR: process.env.ZTUI_NO_COLOR,
      FORCE_COLOR: process.env.FORCE_COLOR,
    };
    const clear = () => {
      // Assigning `undefined` coerces to the string "undefined"; delete instead.
      delete process.env.NO_COLOR;
      delete process.env.ZTUI_NO_COLOR;
      delete process.env.FORCE_COLOR;
    };
    afterEach(() => {
      // Restore the real environment, then re-derive the default from it.
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      colorMode.reset();
    });

    test("NO_COLOR (any value, even empty) disables colour", () => {
      clear();
      process.env.NO_COLOR = "";
      colorMode.reset();
      expect(colorMode.enabled).toBe(false);
    });

    test("ZTUI_NO_COLOR disables colour", () => {
      clear();
      process.env.ZTUI_NO_COLOR = "1";
      colorMode.reset();
      expect(colorMode.enabled).toBe(false);
    });

    test("FORCE_COLOR wins over NO_COLOR", () => {
      clear();
      process.env.NO_COLOR = "1";
      process.env.FORCE_COLOR = "1";
      colorMode.reset();
      expect(colorMode.enabled).toBe(true);
    });

    test("a clean environment defaults to colour on", () => {
      clear();
      colorMode.reset();
      expect(colorMode.enabled).toBe(true);
    });

    test("defaults to colour on when there is no process.env at all (e.g. browser)", () => {
      const realProcess = globalThis.process;
      // @ts-expect-error simulating a non-Node global (web bundle) on purpose
      delete globalThis.process;
      try {
        colorMode.reset();
        expect(colorMode.enabled).toBe(true);
      } finally {
        globalThis.process = realProcess;
        colorMode.reset();
      }
    });
  });
});
