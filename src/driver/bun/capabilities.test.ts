import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { TerminalCapabilities } from "../driver.ts";
import {
  CAPABILITY_REPLY_PATTERNS,
  capabilityReplyContext,
  fallbackCellSize,
  parseProbeResponse,
  trailingIncompleteCapabilityReply,
} from "./capabilities.ts";

const ENV_KEYS = ["WT_SESSION", "WT_PROFILE_ID", "TERM"];

describe("fallbackCellSize", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("falls back to the generic default when cellSize is unset", () => {
    const caps = { graphicsProtocol: "none" } as TerminalCapabilities;
    expect(fallbackCellSize(caps)).toEqual({ width: 10, height: 20 });
  });

  test("falls back to Windows Terminal's default font metrics under WT_SESSION", () => {
    process.env.WT_SESSION = "abc";
    const caps = { graphicsProtocol: "none" } as TerminalCapabilities;
    expect(fallbackCellSize(caps)).toEqual({ width: 11, height: 22 });
  });

  test("uses the confirmed cellSize when present, even under Windows Terminal", () => {
    const caps = {
      graphicsProtocol: "none",
      cellSize: { width: 8, height: 16 },
    } as TerminalCapabilities;
    expect(fallbackCellSize(caps)).toEqual({ width: 8, height: 16 });
  });
});

describe("getBaselineCapabilities graphics protocol: sixel from foot/sixel-capable TERM", () => {
  test("a foot or *sixel* TERM name is recognized as sixel-capable", async () => {
    const saved = process.env.TERM;
    process.env.TERM = "foot";
    const { getBaselineCapabilities } = await import("./capabilities.ts");
    expect(getBaselineCapabilities().graphicsProtocol).toBe("sixel");
    process.env.TERM = saved;
  });
});

describe("CAPABILITY_REPLY_PATTERNS handlers", () => {
  function caps(): TerminalCapabilities {
    return {
      graphicsProtocol: "none",
      glyphProtocol: false,
      mouseHover: false,
      synchronizedUpdates: false,
      kittyKeyboard: false,
      pointerShapes: false,
    } as TerminalCapabilities;
  }
  const ctx = { columns: 80, rows: 24 };

  test("kitty graphics OK response sets graphicsProtocol to kitty", () => {
    const c = caps();
    parseProbeResponse("\x1b_Gi=31;OK\x1b\\", c, 80, 24);
    expect(c.graphicsProtocol).toBe("kitty");
  });

  test("kitty graphics non-OK response leaves graphicsProtocol untouched", () => {
    const c = caps();
    parseProbeResponse("\x1b_Gi=31;ENOTSUPPORTED\x1b\\", c, 80, 24);
    expect(c.graphicsProtocol).toBe("none");
  });

  test("mouse-hover DECRQM '2' (permanently set) also enables mouseHover", () => {
    const c = caps();
    parseProbeResponse("\x1b[?1003;2$y", c, 80, 24);
    expect(c.mouseHover).toBe(true);
  });

  test("mouse-hover DECRQM '0' (not supported) leaves mouseHover false", () => {
    const c = caps();
    parseProbeResponse("\x1b[?1003;0$y", c, 80, 24);
    expect(c.mouseHover).toBe(false);
  });

  test("synchronized-updates DECRQM '2' enables synchronizedUpdates", () => {
    const c = caps();
    parseProbeResponse("\x1b[?2026;2$y", c, 80, 24);
    expect(c.synchronizedUpdates).toBe(true);
  });

  test("synchronized-updates DECRQM '0' leaves synchronizedUpdates false", () => {
    const c = caps();
    parseProbeResponse("\x1b[?2026;0$y", c, 80, 24);
    expect(c.synchronizedUpdates).toBe(false);
  });

  test("glyph-protocol reply sets glyphProtocol true", () => {
    const c = caps();
    parseProbeResponse("\x1b_25a1;s;fmt=png\x1b\\", c, 80, 24);
    expect(c.glyphProtocol).toBe(true);
  });

  test("window pixel-size reply (CSI 4) derives cellSize from columns/rows", () => {
    const pattern = CAPABILITY_REPLY_PATTERNS.find((p) => p.regex.source.includes("4;"));
    expect(pattern).toBeDefined();
    const c = caps();
    const match = "\x1b[4;480;800t".match(pattern!.regex)!;
    pattern!.handle(c, match, ctx);
    expect(c.cellSize).toEqual({ width: Math.round(800 / 80), height: Math.round(480 / 24) });
  });

  test("window pixel-size reply with a non-positive dimension is ignored", () => {
    const pattern = CAPABILITY_REPLY_PATTERNS.find((p) => p.regex.source.includes("4;"));
    const c = caps();
    const match = "\x1b[4;0;0t".match(pattern!.regex)!;
    pattern!.handle(c, match, ctx);
    expect(c.cellSize).toBeUndefined();
  });

  test("char cell-size reply (CSI 6) sets cellSize directly", () => {
    const c = caps();
    parseProbeResponse("\x1b[6;20;10t", c, 80, 24);
    expect(c.cellSize).toEqual({ width: 10, height: 20 });
  });

  test("char cell-size reply with a non-positive dimension is ignored", () => {
    const c = caps();
    parseProbeResponse("\x1b[6;0;0t", c, 80, 24);
    expect(c.cellSize).toBeUndefined();
  });
});

describe("capabilityReplyContext", () => {
  test("uses the stdout's real columns/rows when present", () => {
    expect(capabilityReplyContext({ columns: 120, rows: 40 })).toEqual({ columns: 120, rows: 40 });
  });

  test("falls back to 80x24 when columns/rows are absent", () => {
    expect(capabilityReplyContext({})).toEqual({ columns: 80, rows: 24 });
  });
});

describe("trailingIncompleteCapabilityReply", () => {
  test("returns null when the trailing prefix is already terminated (BEL)", () => {
    expect(trailingIncompleteCapabilityReply("\x1b]22;1\x07")).toBeNull();
  });

  test("returns null when the trailing prefix is already terminated (ST)", () => {
    expect(trailingIncompleteCapabilityReply("\x1b_Gi=31;OK\x1b\\")).toBeNull();
  });

  test("returns the trailing slice for a genuinely incomplete reply", () => {
    expect(trailingIncompleteCapabilityReply("hello\x1b[?")).toBe("\x1b[?");
  });

  test("returns null when there is no recognized prefix at all", () => {
    expect(trailingIncompleteCapabilityReply("just plain text")).toBeNull();
  });
});
