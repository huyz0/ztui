/**
 * Single launcher for every demo, on either backend. Content (the demo's
 * Component) is fully decoupled from bootstrap, so the same registry serves
 * both the TUI and the web canvas with no per-demo duplication.
 *
 *   bun run examples/gallery/run.tsx              # gallery, terminal
 *   bun run examples/gallery/run.tsx --web        # gallery, browser :3010
 *   bun run examples/gallery/run.tsx sparkline    # one demo, terminal
 *   bun run examples/gallery/run.tsx sparkline --web
 *   bun run examples/gallery/run.tsx --list       # print every demo id
 */
import { createElement } from "react";
import { App, BunDriver, render, WebDriver } from "../../src/index.ts";
import { autoFocus } from "./auto-focus.ts";
import { Gallery } from "./gallery.tsx";
import { demos, findDemo } from "./registry.ts";
import { serveWeb } from "./serve-web.ts";
import type { Demo } from "./types.ts";

const argv = process.argv.slice(2);
const web = argv.includes("--web");
const id = argv.find((a) => !a.startsWith("-"));

// `--list`: print the registry (grouped) and exit — the discoverable source of
// demo ids, so package.json needs no per-demo script.
if (argv.includes("--list")) {
  let group = "";
  for (const d of demos) {
    if (d.group !== group) {
      group = d.group;
      console.log(`\n${group}`);
    }
    console.log(`  ${d.id.padEnd(16)} ${d.title}`);
  }
  process.exit(0);
}

let root: React.ReactNode;
let single: Demo | undefined;
if (id) {
  single = findDemo(id);
  if (!single) {
    console.error(`Unknown demo "${id}". Available: ${demos.map((d) => d.id).join(", ")}`);
    process.exit(1);
  }
  root = createElement(single.Component);
} else {
  root = createElement(Gallery);
}

const driver = web ? new WebDriver() : new BunDriver();
const app = new App(driver);
render(root, app.activeScreen);
app.run();

// The gallery focuses per selection; a single demo focuses once after mount.
if (single?.autoFocusTag) autoFocus(app, single.autoFocusTag);

if (web) serveWeb(app, driver as WebDriver, 3010);
