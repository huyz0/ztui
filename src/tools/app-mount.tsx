import type { ReactNode } from "react";
import { App } from "../core/app.ts";
import type { Screen } from "../dom/screen.ts";
import type { Widget, WidgetStyles } from "../dom/widget.ts";
import type { TerminalCapabilities } from "../driver/driver.ts";
import { render } from "../react/reconciler.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { renderBufferToText } from "../render/html-renderer.ts";
import { VTEDriver } from "../test/vte-runner.ts";

export interface MountOptions {
  cols?: number;
  rows?: number;
  capabilities?: Partial<TerminalCapabilities>;
  autoRun?: boolean;
  screenStyle?: WidgetStyles;
}

export interface MountResult {
  app: App;
  driver: VTEDriver;
  screen: Screen;
  container: unknown;
  findById: <T extends Widget = any>(id: string) => T | undefined;
  settle: (ms?: number) => Promise<void>;
  buffer: ScreenBuffer;
  cellAt: (x: number, y: number) => ScreenBuffer["cells"][number][number];
  text: () => string;
}

export async function flush(ms = 5): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mountTestApp(ui: ReactNode, opts: MountOptions = {}): Promise<MountResult> {
  const { cols = 80, rows = 24, capabilities, autoRun = true, screenStyle } = opts;
  const driver = new VTEDriver(cols, rows, capabilities);
  const app = new App(driver);

  if (screenStyle) {
    app.activeScreen.style = { ...app.activeScreen.style, ...screenStyle };
  }

  const container = render(ui, app.activeScreen);
  if (autoRun) app.run();

  const findById = <T extends Widget = any>(id: string): T | undefined => {
    let found: T | undefined;
    app.activeScreen.walk((node) => {
      if ((node as Widget).id === id) found = node as T;
    });
    return found;
  };

  const settle = async (ms = 5): Promise<void> => {
    await flush(ms);
    await driver.waitWrite();
  };

  await settle();

  return {
    app,
    driver,
    screen: app.activeScreen,
    container,
    findById,
    settle,
    get buffer() {
      return app.buffer;
    },
    cellAt: (x: number, y: number) => app.buffer.cells[y][x],
    text: () => renderBufferToText(app.buffer),
  };
}
