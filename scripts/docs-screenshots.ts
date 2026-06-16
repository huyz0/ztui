/**
 * Generate widget screenshots for the documentation site straight from the demo
 * gallery — the single source of truth. Each demo is rendered on the web/canvas
 * backend in headless Chromium (via {@link WebInspector}) and saved as a PNG into
 * `site/src/assets/widgets/<id>.png`, so the gallery's images can never drift
 * from the components they document.
 *
 *   bun run docs:screenshots              # the curated batch below
 *   bun run docs:screenshots table tree   # only these demo ids
 *   bun run docs:screenshots --all        # every gallery demo
 *
 * Run it whenever a documented widget's appearance changes, and commit the PNGs
 * (the Pages build stays Chromium-free).
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { demos } from "../examples/gallery/registry.ts";
import { WebInspector } from "../src/tools/web-inspector.ts";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../site/src/assets/widgets");

/**
 * Demo ids shot by default (the documented widget batch), with a render size and
 * an optional `wait` (ms). Streaming/animated demos (markdown stream, spinners,
 * tweens) drive their content from timers, so we let them run `wait` ms and
 * re-render before capturing — otherwise we'd shoot an empty first frame.
 */
const BATCH: Record<string, { cols: number; rows: number; wait?: number }> = {
  table: { cols: 64, rows: 16 },
  tree: { cols: 48, rows: 18 },
  listview: { cols: 48, rows: 14 },
  "selection-list": { cols: 48, rows: 14 },
  sparkline: { cols: 64, rows: 12 },
  chart: { cols: 72, rows: 17, wait: 400 }, // 2-column gallery; plots settle after a tick
  diff: { cols: 72, rows: 18 },
  richlog: { cols: 72, rows: 16 },
  markdown: { cols: 72, rows: 22, wait: 4000 }, // streams in token-by-token
  textarea: { cols: 64, rows: 16 },
  waiting: { cols: 56, rows: 14, wait: 800 }, // spinners mid-animation
  status: { cols: 56, rows: 16 },
  banner: { cols: 60, rows: 20 },
  gauge: { cols: 56, rows: 18, wait: 400 }, // live meters settle after a tick
  "description-list": { cols: 56, rows: 18 },
  collapsible: { cols: 64, rows: 16 },
  // Batch 2
  terminal: { cols: 72, rows: 18, wait: 5500 }, // plays a ~5s build/test session
  qa: { cols: 64, rows: 16 },
  rich: { cols: 72, rows: 18 },
  splitview: { cols: 72, rows: 18 },
  tabs: { cols: 64, rows: 16 },
  overlay: { cols: 64, rows: 18 },
  workbench: { cols: 84, rows: 24 },
  form: { cols: 56, rows: 20 },
  heroicons: { cols: 64, rows: 12 },
  "file-icon": { cols: 56, rows: 18 },
  image: { cols: 48, rows: 16 },
  // Batch 3 — controls
  button: { cols: 40, rows: 12 },
  input: { cols: 48, rows: 14 },
  checkbox: { cols: 40, rows: 10 },
  switch: { cols: 40, rows: 8 },
  select: { cols: 44, rows: 12 },
  slider: { cols: 44, rows: 10 },
  radio: { cols: 44, rows: 14 },
  "toggle-button": { cols: 40, rows: 8 },
};

const DEFAULT_SIZE = { cols: 72, rows: 20 };

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const ids = args.filter((a) => !a.startsWith("--"));

  const targets = all ? demos.map((d) => d.id) : ids.length > 0 ? ids : Object.keys(BATCH);

  mkdirSync(OUT_DIR, { recursive: true });

  for (const id of targets) {
    const demo = demos.find((d) => d.id === id);
    if (!demo) {
      console.warn(`! skip "${id}" — no such demo id`);
      continue;
    }
    const size = BATCH[id] ?? DEFAULT_SIZE;
    const wait = (BATCH[id] as { wait?: number } | undefined)?.wait ?? 0;
    const out = join(OUT_DIR, `${id}.png`);
    const insp = await WebInspector.launch(createElement(demo.Component), size);
    try {
      if (wait > 0) {
        // Let the demo's timers (streaming, animation) advance, then re-render
        // the now-current buffer before capturing.
        await new Promise((r) => setTimeout(r, wait));
        await insp.render();
      }
      await insp.screenshot(out);
      console.log(
        `✓ ${id.padEnd(16)} → site/src/assets/widgets/${id}.png  (${size.cols}×${size.rows})${
          wait ? `  [+${wait}ms]` : ""
        }`,
      );
    } finally {
      await insp.close();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
