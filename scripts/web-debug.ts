/**
 * Headless web-backend debugger. Renders a ztui UI in real Chromium via the
 * built-in {@link WebInspector}, saves a screenshot, and prints a pixel-accurate
 * grid report (row gaps, overflow, font-loaded, …). Any coding agent can run
 * this to *see* and verify the web backend without a human at a browser.
 *
 *   bun run web:debug                       # screenshots examples/web_demo_ui
 *   bun run web:debug --out /tmp/frame.png  # custom output path
 *   bun run web:debug --module ./my-ui.tsx  # a module default-exporting a UI
 *   bun run web:debug --headed              # show the browser window
 *
 * A custom module must `export default` a React element or a zero-arg function
 * returning one.
 */
import { createElement, isValidElement, type ReactNode } from "react";
import { WebDemoUI } from "../examples/web_demo_ui.tsx";
import { WebInspector } from "../src/driver/web/web-inspector.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function loadUI(): Promise<ReactNode> {
  const mod = arg("module");
  if (!mod) return createElement(WebDemoUI);
  const loaded = (await import(mod.startsWith(".") ? `${process.cwd()}/${mod}` : mod)).default;
  if (isValidElement(loaded)) return loaded;
  if (typeof loaded === "function") return createElement(loaded);
  throw new Error(`--module ${mod} must default-export a React element or component`);
}

const out = arg("out") ?? "/tmp/ztui-web-debug.png";
const cols = arg("cols") ? Number(arg("cols")) : undefined;
const rows = arg("rows") ? Number(arg("rows")) : undefined;

const insp = await WebInspector.launch(await loadUI(), { cols, rows, headed: has("headed") });
try {
  await insp.screenshot(out);
  const report = await insp.report();
  console.log(`screenshot: ${out}`);
  console.log("canvas report:", JSON.stringify(report, null, 2));
  if (report.pageScrolls) console.warn("⚠ page overflows its window (unwanted scrollbar)");
  if (!report.fontLoaded) console.warn("⚠ Cascadia Mono did not load — using a fallback font");
} finally {
  await insp.close();
}
