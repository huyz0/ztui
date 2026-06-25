import { renderCapabilities } from "../../render/ansi-style.ts";
import type { TerminalCapabilities } from "../driver.ts";

/**
 * Whether we may turn on sixel for this terminal when its DA1 reply advertises
 * it (attribute 4). `ZTUI_NO_GRAPHICS` opts the user out entirely; otherwise we
 * upgrade only a terminal that is still at `none` (we don't override a richer
 * protocol like kitty/iterm2 that was already detected).
 */
export function sixelUsable(capabilities: TerminalCapabilities): boolean {
  if (process.env.ZTUI_NO_GRAPHICS) return false;
  return capabilities.graphicsProtocol === "none";
}

export function getBaselineCapabilities(): TerminalCapabilities {
  const term = process.env.TERM || "";
  const colorterm = process.env.COLORTERM || "";
  const termProgram = process.env.TERM_PROGRAM || "";
  const lcTerminal = process.env.LC_TERMINAL || "";

  const isWT = !!process.env.WT_SESSION || !!process.env.WT_PROFILE_ID;

  const truecolor =
    colorterm === "truecolor" ||
    colorterm === "24bit" ||
    termProgram === "WezTerm" ||
    termProgram === "ghostty" ||
    isWT;
  const color256 = term.includes("256color") || truecolor;

  const isWezTerm = termProgram === "WezTerm" || !!process.env.WEZTERM_PANE;
  const isGhostty = termProgram === "ghostty" || !!process.env.GHOSTTY_BIN_DIR;
  const isKitty =
    termProgram === "kitty" || term.includes("kitty") || !!process.env.KITTY_WINDOW_ID;
  const isITerm =
    termProgram === "iTerm.app" || lcTerminal === "iTerm2" || !!process.env.ITERM_SESSION_ID;
  const isFoot = term === "foot" || term.includes("foot");
  const isSixelTerm = term.includes("sixel");
  const isXterm = term.includes("xterm");

  // REP (CSI Pn b) is ECMA-48 and supported across the modern emulators we can
  // identify; left off for unknown/legacy TERMs where an unsupported `\x1b[nb`
  // would drop the repeated glyphs. Conservative on purpose — the diff just
  // writes the run out in full when this is false.
  const repeatChar =
    isWezTerm ||
    isGhostty ||
    isKitty ||
    isITerm ||
    isWT ||
    isFoot ||
    isXterm ||
    !!process.env.VTE_VERSION;

  const hyperlinks =
    isWezTerm || isGhostty || isKitty || isITerm || isWT || !!process.env.VTE_VERSION;

  const mouseHover =
    isWezTerm || isGhostty || isKitty || isITerm || isWT || !!process.env.VTE_VERSION;

  // Escape hatch: `ZTUI_NO_GRAPHICS` (any value) forces text/glyph fallback for
  // icons and images, for terminals that mis-render the graphics protocols.
  const noGraphics = !!process.env.ZTUI_NO_GRAPHICS;

  let graphicsProtocol: "kitty" | "iterm2" | "sixel" | "none" = "none";
  if (noGraphics) {
    graphicsProtocol = "none";
  } else if (isITerm) {
    graphicsProtocol = "iterm2";
  } else if (isWezTerm || isGhostty || isKitty) {
    graphicsProtocol = "kitty";
  } else if (isFoot || isSixelTerm) {
    graphicsProtocol = "sixel";
  }
  // Windows Terminal is NOT assumed to do sixel from its env name (only builds
  // ≥ 1.22 support it, and a sixel DCS to one that doesn't prints as garbage).
  // It's left `none` and upgraded by the DA1 probe only when the terminal
  // reports attribute 4 — the same "confirm, don't guess" rule as pointer shapes.

  return {
    truecolor,
    color256,
    kittyKeyboard: false,
    mouseTracking: true,
    mouseHover,
    hyperlinks,
    synchronizedUpdates: false,
    scrollRegion: true,
    repeatChar,
    glyphProtocol: false,
    clipboard: true,
    notifications: true,
    // Left false until the OSC 22 probe positively confirms support; relying on
    // a env-name heuristic would falsely enable it on terminals that advertise
    // but mis-render shapes (e.g. parts of Ghostty's set).
    pointerShapes: false,
    graphicsProtocol,
    terminalProgram: termProgram || (isWT ? "Windows Terminal" : undefined),
    cellSize: isWT ? { width: 11, height: 22 } : { width: 10, height: 20 },
  };
}

export function parseProbeResponse(
  probeBuffer: string,
  capabilities: TerminalCapabilities,
  stdoutColumns: number,
  stdoutRows: number,
): { leftover: string } {
  let leftover = probeBuffer;

  // Parse DA1 check
  const da1Match = leftover.match(/\x1b\[\?([\d;]+)c/);
  if (da1Match) {
    const params = da1Match[1].split(";");
    if (params.includes("4") && sixelUsable(capabilities)) {
      capabilities.graphicsProtocol = "sixel";
    }
    leftover = leftover.replace(da1Match[0], "");
  }

  // Parse DA2 check
  const da2Match = leftover.match(/\x1b\[>([\d;]*)c/);
  if (da2Match) {
    leftover = leftover.replace(da2Match[0], "");
  }

  // Parse Kitty Keyboard query response: \x1b[?<flags>u
  const kittyKeyMatch = leftover.match(/\x1b\[\?(\d+)u/);
  if (kittyKeyMatch) {
    capabilities.kittyKeyboard = true;
    leftover = leftover.replace(kittyKeyMatch[0], "");
  }

  // Parse Kitty Graphics response: \x1b_Gi=31;<status>\x1b\\
  const kittyGraphMatch = leftover.match(/\x1b_Gi=31;([^\x1b]+)\x1b\\/);
  if (kittyGraphMatch) {
    if (kittyGraphMatch[1].includes("OK")) {
      capabilities.graphicsProtocol = "kitty";
    }
    leftover = leftover.replace(kittyGraphMatch[0], "");
  }

  // Parse Mouse Hover DECRQM response: \x1b[?1003;<status>$y
  const hoverMatch = leftover.match(/\x1b\[\?1003;([0-4])\$y/);
  if (hoverMatch) {
    const status = hoverMatch[1];
    if (status === "1" || status === "2") {
      capabilities.mouseHover = true;
    }
    leftover = leftover.replace(hoverMatch[0], "");
  }

  // Parse OSC 22 pointer-shape query response: \x1b]22;<1|0>(ST|BEL). We query
  // `?default`; a leading "1" means the terminal supports named pointer shapes.
  const pointerMatch = leftover.match(/\x1b\]22;([01])(?:\x1b\\|\x07)/);
  if (pointerMatch) {
    if (pointerMatch[1] === "1") {
      capabilities.pointerShapes = true;
    }
    leftover = leftover.replace(pointerMatch[0], "");
  }

  // Parse Synchronized Updates DECRQM response: \x1b[?2026;<status>$y
  const syncMatch = leftover.match(/\x1b\[\?2026;([0-4])\$y/);
  if (syncMatch) {
    const status = syncMatch[1];
    if (status === "1" || status === "2") {
      capabilities.synchronizedUpdates = true;
    }
    leftover = leftover.replace(syncMatch[0], "");
  }

  // Parse Glyph Protocol support query response: \x1b_25a1;s;fmt=<formats>\x1b\\ or \x1b_25a1;s\x1b\\
  const glyphMatch = leftover.match(/\x1b_25a1;s(?:;[^\x1b]*)?\x1b\\/);
  if (glyphMatch) {
    capabilities.glyphProtocol = true;
    leftover = leftover.replace(glyphMatch[0], "");
  }

  // Parse window pixel size response: \x1b[4;height;widtht
  const pixelSizeMatch = leftover.match(/\x1b\[4;(\d+);(\d+)t/);
  let probedCellWidth = 0;
  let probedCellHeight = 0;
  if (pixelSizeMatch) {
    const height = Number.parseInt(pixelSizeMatch[1], 10);
    const width = Number.parseInt(pixelSizeMatch[2], 10);
    if (width > 0 && height > 0) {
      probedCellWidth = Math.round(width / stdoutColumns);
      probedCellHeight = Math.round(height / stdoutRows);
    }
    leftover = leftover.replace(pixelSizeMatch[0], "");
  }

  // Parse character cell size response: \x1b[6;height;widtht
  const cellSizeMatch = leftover.match(/\x1b\[6;(\d+);(\d+)t/);
  if (cellSizeMatch) {
    const height = Number.parseInt(cellSizeMatch[1], 10);
    const width = Number.parseInt(cellSizeMatch[2], 10);
    if (width > 0 && height > 0) {
      capabilities.cellSize = { width, height };
    }
    leftover = leftover.replace(cellSizeMatch[0], "");
  } else if (probedCellWidth > 0 && probedCellHeight > 0) {
    capabilities.cellSize = { width: probedCellWidth, height: probedCellHeight };
  }

  // Sync capabilities to style module config
  renderCapabilities.truecolor = capabilities.truecolor;
  renderCapabilities.color256 = capabilities.color256;

  return { leftover };
}
