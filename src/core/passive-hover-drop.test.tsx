import { createElement } from "react";
import { describe, expect, test } from "vitest";
import { App } from "../core/app.ts";
import { Box, render } from "../react.ts";
import { flush, VTEDriver } from "../test/harness.tsx";

class RuntimeHoverDropDriver extends VTEDriver {
  public override get enforcesRuntimeHoverMode(): boolean {
    return true;
  }
}

describe("passive hover drop", () => {
  test("drops bare move events entirely when passive hover is disabled", async () => {
    const driver = new RuntimeHoverDropDriver(80, 24, { mouseHover: false });
    const app = new App(driver);
    render(createElement(Box, null, "hello"), app.activeScreen);
    app.run();
    await flush(20);
    await driver.waitWrite();

    driver.simulateMouse(1, 1, "move", "none");
    driver.simulateMouse(2, 1, "move", "none");
    await flush(80);
    await driver.waitWrite();

    const stats = (app as any).getMouseDiagnostics();
    expect(stats.rawMovesSeen).toBe(2);
    expect(stats.movesDroppedNoHover).toBe(2);
    expect(stats.receivedMoves).toBe(0);
    app.stop();
  });
});
