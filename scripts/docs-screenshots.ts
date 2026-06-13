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

/** Demo ids shot by default (the documented widget batch), with a render size. */
const BATCH: Record<string, { cols: number; rows: number }> = {
  table: { cols: 64, rows: 16 },
  tree: { cols: 48, rows: 18 },
  listview: { cols: 48, rows: 14 },
  "selection-list": { cols: 48, rows: 14 },
  sparkline: { cols: 64, rows: 12 },
  diff: { cols: 72, rows: 18 },
  richlog: { cols: 72, rows: 16 },
  markdown: { cols: 72, rows: 22 },
  textarea: { cols: 64, rows: 16 },
  waiting: { cols: 56, rows: 14 },
  status: { cols: 56, rows: 16 },
  collapsible: { cols: 64, rows: 16 },
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
    const out = join(OUT_DIR, `${id}.png`);
    const insp = await WebInspector.launch(createElement(demo.Component), size);
    try {
      await insp.screenshot(out);
      console.log(
        `✓ ${id.padEnd(16)} → site/src/assets/widgets/${id}.png  (${size.cols}×${size.rows})`,
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
