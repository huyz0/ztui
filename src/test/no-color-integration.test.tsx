import { afterEach, describe, expect, test } from "vitest";
import { colorMode, ThemeManager } from "../core.ts";
import { Dock, Label } from "../react.ts";
import { renderCapabilities } from "../render/ansi-style.ts";
import { mountApp } from "./harness.tsx";

// colorMode is a process-global; never leave it flipped for later tests.
afterEach(() => colorMode.reset());

describe("NO_COLOR end-to-end (colorMode + App.refresh)", () => {
  test("toggling colour off re-emits every cell without colour, then back on", async () => {
    renderCapabilities.truecolor = true;
    // Bun sets NO_COLOR itself whenever stdout isn't a TTY (true under CI/vitest),
    // so the ambient default can't be trusted — force the baseline explicitly.
    colorMode.set(true);
    const { screen, driver, settle } = await mountApp(
      <Label style={{ color: "#ff0000", bold: true }}>Hi</Label>,
      { cols: 20, rows: 3 },
    );
    await settle();
    const app = screen.parent as unknown as { refresh: (r?: string) => void };

    // Baseline: the red foreground is emitted.
    expect(driver.writtenData).toContain("38;2;255;0;0");

    // Colour off + refresh: the frame re-emits (refresh forces a full repaint),
    // the text and bold attribute survive, but no fg/bg colour escape is sent.
    driver.writtenData = "";
    colorMode.set(false);
    app.refresh("test");
    await settle();
    const off = driver.writtenData;
    expect(off.length).toBeGreaterThan(0); // refresh re-emitted despite identical cells
    expect(off).toContain("Hi");
    expect(off).toContain("\x1b[1m"); // bold attribute kept
    expect(off).not.toContain("\x1b[38"); // no foreground colour

    // Colour back on + refresh: the red foreground returns.
    driver.writtenData = "";
    colorMode.set(true);
    app.refresh("test");
    await settle();
    expect(driver.writtenData).toContain("38;2;255;0;0");
  });
});

describe("unstyled text against a real (BunDriver-style) terminal write stream", () => {
  afterEach(() => ThemeManager.getInstance().setTheme("default-dark"));

  test("a plain unstyled Label renders the active theme's foreground, not nothing", async () => {
    // End-to-end version of the ansi-style.ts unit tests: reproduces the
    // reported bug through the real App render pipeline (App -> ScreenBuffer
    // -> renderDiff -> the MockDriver's written ANSI stream, the same path
    // BunDriver uses for a real terminal). A themed app's own background
    // (here, an explicit `<Dock style={{ background: "$background" }}>`,
    // matching how every full-screen ztui app is built) makes an unstyled
    // Label's text readable only if its foreground also resolves against the
    // theme — not the terminal's own ambient default, which the app has no
    // way to know or control.
    renderCapabilities.truecolor = true;
    colorMode.set(true);
    ThemeManager.getInstance().setTheme("default-light");
    const { driver, settle } = await mountApp(
      <Dock style={{ background: "$background" }}>
        <Label>Hello</Label>
      </Dock>,
      { cols: 20, rows: 3 },
    );
    await settle();
    // default-light foreground #1f2328 -> rgb(31,35,40).
    expect(driver.writtenData).toContain("38;2;31;35;40");
  });
});
