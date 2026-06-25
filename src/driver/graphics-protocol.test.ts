import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getBaselineCapabilities, parseProbeResponse } from "./bun/capabilities.ts";

/**
 * Graphics-protocol detection must not *guess* sixel from an env name. Windows
 * Terminal only gained sixel in build 1.22, and emitting a sixel DCS to a build
 * that lacks it prints the raw escape as on-screen garbage (and corrupts icon
 * redraws). So WT stays `none` at baseline and is upgraded only when the DA1
 * probe reports attribute 4 — the same "confirm, don't guess" rule as pointer
 * shapes.
 */

const GRAPHICS_ENV = [
  "WT_SESSION",
  "WT_PROFILE_ID",
  "TERM",
  "TERM_PROGRAM",
  "COLORTERM",
  "KITTY_WINDOW_ID",
  "WEZTERM_PANE",
  "GHOSTTY_BIN_DIR",
  "ITERM_SESSION_ID",
  "LC_TERMINAL",
  "ZTUI_NO_GRAPHICS",
];

describe("graphics protocol detection", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of GRAPHICS_ENV) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of GRAPHICS_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("Windows Terminal does not claim sixel from the env heuristic alone", () => {
    process.env.WT_SESSION = "abc-123";
    expect(getBaselineCapabilities().graphicsProtocol).toBe("none");
  });

  test("Windows Terminal upgrades to sixel only when DA1 reports attribute 4", () => {
    process.env.WT_SESSION = "abc-123";
    const caps = getBaselineCapabilities();
    expect(caps.graphicsProtocol).toBe("none"); // not guessed from the env name
    parseProbeResponse("\x1b[?61;4;6;22c", caps, 80, 24);
    expect(caps.graphicsProtocol).toBe("sixel");
  });

  test("Windows Terminal without a sixel attribute stays text-only", () => {
    process.env.WT_SESSION = "abc-123";
    const caps = getBaselineCapabilities();
    parseProbeResponse("\x1b[?61;6;22c", caps, 80, 24); // no "4"
    expect(caps.graphicsProtocol).toBe("none");
  });

  test("ZTUI_NO_GRAPHICS forces text fallback and the probe can't re-enable it", () => {
    process.env.ZTUI_NO_GRAPHICS = "1";
    process.env.KITTY_WINDOW_ID = "1"; // would otherwise be kitty
    const caps = getBaselineCapabilities();
    expect(caps.graphicsProtocol).toBe("none");
    parseProbeResponse("\x1b[?61;4c", caps, 80, 24);
    expect(caps.graphicsProtocol).toBe("none");
    delete process.env.ZTUI_NO_GRAPHICS;
  });

  test("kitty/iTerm are still recognised from the environment", () => {
    process.env.KITTY_WINDOW_ID = "1";
    expect(getBaselineCapabilities().graphicsProtocol).toBe("kitty");
    delete process.env.KITTY_WINDOW_ID;
    process.env.TERM_PROGRAM = "iTerm.app";
    expect(getBaselineCapabilities().graphicsProtocol).toBe("iterm2");
  });
});
