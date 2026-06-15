import { createElement, isValidElement, type ReactNode } from "react";
import { Gallery } from "../examples/gallery/gallery.tsx";
import { findDemo } from "../examples/gallery/registry.ts";
import {
  formatMouseHoverBenchmark,
  getNamedHoverScenario,
  runMouseHoverBenchmark,
} from "../src/tools/mouse-hover-benchmark.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadUI(): Promise<ReactNode> {
  const demoId = arg("demo");
  if (demoId) {
    const demo = findDemo(demoId);
    if (!demo) throw new Error(`Unknown demo: ${demoId}`);
    return createElement(demo.Component);
  }
  const mod = arg("module");
  if (mod) {
    const loaded = (await import(mod.startsWith(".") ? `${process.cwd()}/${mod}` : mod)).default;
    if (isValidElement(loaded)) return loaded;
    if (typeof loaded === "function") return createElement(loaded);
    throw new Error(`--module ${mod} must default-export a React element or component`);
  }
  const demo = findDemo("table");
  if (!demo) throw new Error("Default table demo missing from registry");
  return createElement(demo.Component);
}

const cols = Number(arg("cols") ?? 100);
const rows = Number(arg("rows") ?? 30);
const xStart = Number(arg("x-start") ?? 2);
const xEnd = Number(arg("x-end") ?? Math.max(2, cols - 4));
const y = Number(arg("y") ?? 8);
const step = Number(arg("step") ?? 1);
const repeats = Number(arg("repeats") ?? 3);
const settleMs = Number(arg("settle-ms") ?? 40);
const scenarioName = arg("scenario");

const scenario = scenarioName
  ? getNamedHoverScenario(scenarioName, { cols, rows, ui: createElement(Gallery) })
  : null;
if (scenarioName && !scenario) {
  throw new Error(`Unknown hover scenario: ${scenarioName}`);
}

const result = await runMouseHoverBenchmark(
  scenario
    ? {
        ui: scenario.ui,
        cols: scenario.cols ?? cols,
        rows: scenario.rows ?? rows,
        sweep: scenario.sweep,
        settleMs: scenario.settleMs ?? settleMs,
      }
    : {
        ui: await loadUI(),
        cols,
        rows,
        sweep: { xStart, xEnd, y, step, repeats },
        settleMs,
      },
);
console.log(formatMouseHoverBenchmark(result));
