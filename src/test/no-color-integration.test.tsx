import { afterEach, describe, expect, test } from "vitest";
import { colorMode } from "../core.ts";
import { Label } from "../react.ts";
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
