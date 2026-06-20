/**
 * CLI for the frame profiler. Mounts a demo, drives forced-frame scenarios, and
 * prints the per-phase breakdown + redundant-frame rate.
 *
 *   bun run profile                          # rich demo, 120×40, 200 frames
 *   bun run profile --demo workbench         # a different gallery demo
 *   bun run profile --cols 200 --rows 60     # bigger frame
 *   bun run profile --iterations 500         # more samples
 *   bun run profile --all                    # sweep a set of representative demos
 */
import { createElement } from "react";
import { findDemo } from "../examples/gallery/registry.ts";
import { formatRun, runProfile } from "../src/tools/frame-profile.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const num = (name: string): number | undefined => {
  const v = arg(name);
  return v !== undefined ? Number(v) : undefined;
};
const has = (name: string) => process.argv.includes(`--${name}`);

const cols = num("cols");
const rows = num("rows");
const iterations = num("iterations");
const warmup = num("warmup");
const common = { cols, rows, iterations, warmup };

// `--all` sweeps a spread of demos with different characteristics: text-heavy,
// nested-flex, grid, data-table, and a graphics one.
const demos = has("all")
  ? ["rich", "workbench", "table", "markdown", "kitchen-sink"]
  : [arg("demo") ?? "rich"];

for (const demoId of demos) {
  try {
    const demo = findDemo(demoId);
    if (!demo) throw new Error(`unknown demo (see examples/gallery/registry.ts)`);
    const run = await runProfile(createElement(demo.Component), { label: demoId, ...common });
    console.log(formatRun(run));
    console.log();
  } catch (err) {
    console.error(`✗ ${demoId}: ${(err as Error).message}`);
  }
}
