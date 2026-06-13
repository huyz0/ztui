import {
  type App,
  HTML_FONT_FAMILY,
  HTML_FONT_SIZE,
  HTML_PADDING,
  type WebDriver,
} from "../../src/core.ts";
import { canvasClientScript } from "../../src/driver/web/canvas-bundle.ts";
import { serializeForCanvas } from "../../src/driver/web/canvas-serialize.ts";
import {
  bundledFontFaces,
  bundledFontPath,
  setiFontFace,
  setiFontPath,
  webHostStyles,
} from "../../src/driver/web/host-page.ts";

/**
 * Serve a headless ztui {@link App} (running on a {@link WebDriver}) to a
 * browser canvas. Extracted from the one-off `web_demo.tsx` so any entry point —
 * a single demo or the whole gallery — gets the web backend for free, with no
 * per-demo duplication. The browser paints the streamed cell grid; key/mouse/
 * wheel/resize are forwarded back to the driver.
 */
export function serveWeb(app: App, driver: WebDriver, port = 3010): void {
  const fonts = [
    ...bundledFontFaces("/fonts/regular.woff2", "/fonts/bold.woff2"),
    setiFontFace("/fonts/seti.woff"),
  ];

  const PAGE = `<!doctype html><meta charset="utf-8"><title>ztui (canvas)</title>
<style>${webHostStyles(fonts)}</style>
<body>
<div id="screen" tabindex="0"></div>
<script type="module" src="/canvas.js"></script>
<script type="module">
const PADDING = ${HTML_PADDING};
const screen = document.getElementById("screen");
await document.fonts.load("${HTML_FONT_SIZE}px '${HTML_FONT_FAMILY.split(",")[0].replace(/'/g, "")}'").catch(() => {});
while (!window.ztuiCanvas) await new Promise((r) => setTimeout(r, 10));
const view = window.ztuiCanvas.create(screen, ${HTML_FONT_SIZE}, "${HTML_FONT_FAMILY}", PADDING);
const cw = view.cellWidth, chh = view.cellHeight;

let lastCols = 0, lastRows = 0;
async function syncSize() {
  const cols = Math.floor((window.innerWidth - 2 * PADDING) / cw);
  const rows = Math.floor((window.innerHeight - 2 * PADDING) / chh);
  if (cols === lastCols && rows === lastRows) return;
  lastCols = cols; lastRows = rows; view.resize(cols, rows);
  await fetch("/resize", { method: "POST", body: JSON.stringify({ cols, rows }) });
}
async function refresh() { view.render(await (await fetch("/cells")).json()); }

function toCell(ev) {
  const r = view.canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.floor((ev.clientX - r.left - PADDING) / cw)),
    y: Math.max(0, Math.floor((ev.clientY - r.top - PADDING) / chh)),
  };
}
const BTN = { 0: "left", 1: "middle", 2: "right" };
function sendMouse(type, ev, button) {
  const { x, y } = toCell(ev);
  return fetch("/mouse", { method: "POST", body: JSON.stringify({ x, y, type, button }) }).then(refresh);
}
document.addEventListener("keydown", (ev) => {
  ev.preventDefault();
  fetch("/key", { method: "POST", body: JSON.stringify({
    key: ev.key, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, altKey: ev.altKey, shiftKey: ev.shiftKey,
  })}).then(refresh);
});
screen.addEventListener("mousedown", (ev) => { ev.preventDefault(); screen.focus(); sendMouse("press", ev, BTN[ev.button] || "left"); });
window.addEventListener("mouseup", (ev) => sendMouse("release", ev, BTN[ev.button] || "left"));
window.addEventListener("mousemove", (ev) => { if (ev.buttons) sendMouse("drag", ev, "left"); });
screen.addEventListener("wheel", (ev) => { ev.preventDefault(); sendMouse(ev.deltaY < 0 ? "scroll_up" : "scroll_down", ev, "none"); }, { passive: false });
window.addEventListener("resize", () => { syncSize().then(refresh); });

await syncSize();
await refresh();
screen.focus();
setInterval(refresh, 100);
</script>`;

  Bun.serve({
    port,
    async fetch(req: Request) {
      const url = new URL(req.url);
      if (url.pathname === "/cells") return Response.json(serializeForCanvas(app.buffer));
      if (url.pathname === "/canvas.js") {
        return new Response(await canvasClientScript(), {
          headers: { "content-type": "text/javascript" },
        });
      }
      if (url.pathname === "/fonts/regular.woff2")
        return new Response(Bun.file(bundledFontPath(400)));
      if (url.pathname === "/fonts/bold.woff2") return new Response(Bun.file(bundledFontPath(700)));
      if (url.pathname === "/fonts/seti.woff") return new Response(Bun.file(setiFontPath()));
      if (url.pathname === "/key" && req.method === "POST") {
        const { translateKeyboardEvent } = await import("../../src/driver/web/dom.ts");
        const key = translateKeyboardEvent(await req.json());
        if (key) driver.dispatchKey(key);
        return new Response("ok");
      }
      if (url.pathname === "/mouse" && req.method === "POST") {
        driver.dispatchMouse(await req.json());
        return new Response("ok");
      }
      if (url.pathname === "/resize" && req.method === "POST") {
        const { cols, rows } = await req.json();
        driver.resize(cols, rows);
        return new Response("ok");
      }
      return new Response(PAGE, { headers: { "content-type": "text/html" } });
    },
  });

  console.log(`ztui (canvas): http://localhost:${port}`);
}
