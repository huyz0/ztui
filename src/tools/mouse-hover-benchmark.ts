import type { ReactNode } from "react";
import type { TerminalCapabilities } from "../driver/driver.ts";
import { mountTestApp } from "./app-mount.tsx";

export interface MouseHoverSweep {
  xStart: number;
  xEnd: number;
  y: number;
  step?: number;
  repeats?: number;
  path?: Array<{ x: number; y: number }>;
}

export interface MouseHoverBenchmarkOptions {
  ui: ReactNode;
  cols?: number;
  rows?: number;
  capabilities?: Partial<TerminalCapabilities>;
  sweep: MouseHoverSweep;
  settleMs?: number;
}

export interface NamedHoverScenario {
  ui: ReactNode;
  sweep: MouseHoverSweep;
  cols?: number;
  rows?: number;
  settleMs?: number;
}

export interface MouseHoverBenchmarkResult {
  durationMs: number;
  totalEvents: number;
  renders: number;
  writes: number;
  bytesWritten: number;
  capabilities: TerminalCapabilities;
  pathSamples: Array<{ x: number; y: number }>;
  renderReasons: Record<string, number>;
}

export function getNamedHoverScenario(
  name: string,
  // `ui` is injected by the caller (a benchmark script/test) rather than imported
  // here, so this library file under src/ never pulls examples/ into the build.
  opts: { cols?: number; rows?: number; ui?: ReactNode } = {},
): NamedHoverScenario | null {
  const { cols = 100, rows = 30, ui } = opts;
  if (name === "gallery-sidebar-boundary") {
    const sidebarInside = 24;
    const sidebarOutside = 28;
    const top = 3;
    const bottom = Math.max(top + 6, rows - 4);
    const path: Array<{ x: number; y: number }> = [];
    for (let y = top; y <= bottom; y += 2) {
      path.push({ x: sidebarInside, y }, { x: sidebarOutside, y }, { x: sidebarInside, y });
    }
    return {
      ui,
      cols,
      rows,
      settleMs: 80,
      sweep: { xStart: sidebarInside, xEnd: sidebarOutside, y: top, repeats: 4, path },
    };
  }
  return null;
}

function buildSweepPath(sweep: MouseHoverSweep): Array<{ x: number; y: number }> {
  if (sweep.path?.length) {
    const repeats = sweep.repeats ?? 1;
    const path: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < repeats; i++) path.push(...sweep.path);
    return path;
  }
  const { xStart, xEnd, y, step = 1, repeats = 1 } = sweep;
  const delta = xStart <= xEnd ? Math.max(1, step) : -Math.max(1, step);
  const single: Array<{ x: number; y: number }> = [];
  for (let x = xStart; delta > 0 ? x <= xEnd : x >= xEnd; x += delta) {
    single.push({ x, y });
  }
  const path: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < repeats; i++) path.push(...single);
  return path;
}

export async function runMouseHoverBenchmark(
  options: MouseHoverBenchmarkOptions,
): Promise<MouseHoverBenchmarkResult> {
  const { ui, cols = 100, rows = 30, capabilities, sweep, settleMs = 40 } = options;
  const mounted = await mountTestApp(ui, {
    cols,
    rows,
    capabilities: { mouseHover: true, mouseTracking: true, ...capabilities },
  });
  const { app, driver, settle } = mounted;

  const pathSamples = buildSweepPath(sweep);
  let renders = 0;
  const originalWriteFrame = driver.writeFrame.bind(driver);
  driver.writeFrame = (data: string) => {
    renders += 1;
    return originalWriteFrame(data);
  };

  const beforeWrites = driver.writtenData.length;
  const start = performance.now();
  for (const point of pathSamples) {
    driver.simulateMouse(point.x, point.y, "move", "none");
  }
  await settle(settleMs);
  const durationMs = performance.now() - start;
  const bytesWritten = driver.writtenData.length - beforeWrites;

  return {
    durationMs,
    totalEvents: pathSamples.length,
    renders,
    writes: renders,
    bytesWritten,
    capabilities: { ...driver.capabilities },
    pathSamples,
    renderReasons:
      typeof (app as any).getRenderReasonStats === "function"
        ? (app as any).getRenderReasonStats()
        : {},
  };
}

export function formatMouseHoverBenchmark(result: MouseHoverBenchmarkResult): string {
  return [
    `duration_ms=${result.durationMs.toFixed(2)}`,
    `events=${result.totalEvents}`,
    `renders=${result.renders}`,
    `writes=${result.writes}`,
    `bytes=${result.bytesWritten}`,
    `mouse_hover=${String(result.capabilities.mouseHover)}`,
    `render_reasons=${JSON.stringify(result.renderReasons)}`,
  ].join("\n");
}

export { buildSweepPath };
