/**
 * The self-contained browser DevTools panel served at `GET /devtools` by
 * {@link startInspector}. Vanilla HTML/CSS/JS (no build step, no deps): it polls
 * the inspector's JSON endpoints (`/render`, `/dom`, `/state`) same-origin and
 * renders a live screen mirror, an interactive widget tree, a per-node detail
 * pane, and a state/profiler header. Clicking a tree node boxes it on the mirror.
 *
 * Phase 2 of the DevTools plan (see `docs/devtools-plan.md`). Polling keeps it
 * identical on Bun and Node; a WebSocket push channel is a later optimization.
 */
export function devToolsPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ztui DevTools</title>
<style>
  :root { --bg:#181825; --panel:#1e1e2e; --fg:#cdd6f4; --dim:#7f849c; --accent:#cba6f7; --line:#313244; }
  * { box-sizing: border-box; }
  body { margin:0; font:13px/1.4 ui-sans-serif,system-ui,sans-serif; background:var(--bg); color:var(--fg); height:100vh; display:flex; flex-direction:column; }
  header { padding:6px 10px; background:var(--panel); border-bottom:1px solid var(--line); display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  header b { color:var(--accent); }
  header .stat { color:var(--dim); }
  header .stat span { color:var(--fg); }
  main { flex:1; display:flex; min-height:0; }
  #mirror-wrap { flex:1; overflow:auto; padding:12px; position:relative; }
  #mirror { position:relative; width:fit-content; }
  #highlight { position:absolute; border:2px solid var(--accent); pointer-events:none; display:none; box-shadow:0 0 0 9999px rgba(0,0,0,0.18); }
  aside { width:42%; max-width:560px; border-left:1px solid var(--line); display:flex; flex-direction:column; min-height:0; }
  #tree { flex:1; overflow:auto; padding:8px; font-family:ui-monospace,monospace; }
  #tree ul { list-style:none; margin:0; padding-left:14px; }
  #tree li > .row { cursor:pointer; white-space:nowrap; padding:1px 4px; border-radius:3px; }
  #tree li > .row:hover { background:var(--line); }
  #tree li.sel > .row { background:var(--accent); color:#11111b; }
  #tree .tag { color:#89b4fa; } #tree .id { color:#a6e3a1; } #tree .cls { color:var(--dim); }
  #detail { height:40%; overflow:auto; border-top:1px solid var(--line); padding:8px; font-family:ui-monospace,monospace; font-size:12px; }
  #detail table { border-collapse:collapse; width:100%; }
  #detail td { padding:1px 6px; vertical-align:top; }
  #detail td.k { color:var(--dim); width:90px; }
</style>
</head>
<body>
<header>
  <b>🛠 ztui DevTools</b>
  <span class="stat">size <span id="s-size">–</span></span>
  <span class="stat">focus <span id="s-focus">–</span></span>
  <span class="stat">hover <span id="s-hover">–</span></span>
  <span class="stat">theme <span id="s-theme">–</span></span>
  <span class="stat" id="s-reasons"></span>
</header>
<main>
  <div id="mirror-wrap"><div id="mirror"></div><div id="highlight"></div></div>
  <aside>
    <div id="tree"></div>
    <div id="detail"><i style="color:var(--dim)">Select a node…</i></div>
  </aside>
</main>
<script>
const CELL_H = 14, PAD = 10; // mirror grid metrics (font-size 12 × line-height 1.2)
let selId = null, expanded = new Set();

function pathId(node, prefix) {
  node.__id = prefix;
  (node.children || []).filter(c => c.tagName !== "text").forEach((c, i) => pathId(c, prefix + "/" + i));
}
function findById(node, id) {
  if (node.__id === id) return node;
  for (const c of (node.children || [])) { if (c.tagName !== "text") { const f = findById(c, id); if (f) return f; } }
  return null;
}
function esc(s){ return String(s).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }

function renderTree(node) {
  const kids = (node.children || []).filter(c => c.tagName !== "text");
  const id = node.__id;
  const open = expanded.has(id) || id === "0";
  const labelTag = '<span class="tag">' + esc(node.tagName || "?") + '</span>';
  const labelId = node.id ? ' <span class="id">#' + esc(node.id) + '</span>' : '';
  const labelCls = (node.classes && node.classes.length) ? ' <span class="cls">.' + node.classes.map(esc).join('.') + '</span>' : '';
  const arrow = kids.length ? (open ? '▾ ' : '▸ ') : '  ';
  let html = '<li class="' + (id === selId ? 'sel' : '') + '" data-id="' + id + '">';
  html += '<div class="row">' + arrow + labelTag + labelId + labelCls + '</div>';
  if (kids.length && open) html += '<ul>' + kids.map(renderTree).join('') + '</ul>';
  return html + '</li>';
}

function showDetail(node) {
  if (!node) { document.getElementById('detail').innerHTML = '<i style="color:var(--dim)">Select a node…</i>'; return; }
  const rows = [['tag', node.tagName]];
  if (node.id) rows.push(['id', node.id]);
  if (node.classes && node.classes.length) rows.push(['classes', node.classes.join(' ')]);
  if (node.region) rows.push(['region', 'x' + node.region.x + ' y' + node.region.y + ' ' + node.region.width + '×' + node.region.height]);
  if (node.focusable) rows.push(['flags', 'focusable']);
  if (node.visible === false) rows.push(['flags', 'hidden']);
  if (node.style) for (const k of Object.keys(node.style)) rows.push([k, JSON.stringify(node.style[k])]);
  document.getElementById('detail').innerHTML = '<table>' +
    rows.map(([k,v]) => '<tr><td class="k">' + esc(k) + '</td><td>' + esc(v) + '</td></tr>').join('') + '</table>';
}

function drawHighlight(region) {
  const h = document.getElementById('highlight');
  if (!region || region.width < 1) { h.style.display = 'none'; return; }
  const mono = '12px ui-monospace, monospace';
  // Measure cell width once (advance of '0' in the mirror font).
  if (!drawHighlight.cw) {
    const c = document.createElement('canvas').getContext('2d'); c.font = mono;
    drawHighlight.cw = c.measureText('0').width || 7.2;
  }
  const cw = drawHighlight.cw;
  h.style.display = 'block';
  h.style.left = (PAD + region.x * cw) + 'px';
  h.style.top = (PAD + region.y * CELL_H) + 'px';
  h.style.width = (region.width * cw) + 'px';
  h.style.height = (region.height * CELL_H) + 'px';
}

document.getElementById('tree').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  const id = li.dataset.id;
  const arrowClick = e.target.classList.contains('row') && (e.offsetX < 14);
  if (arrowClick) { expanded.has(id) ? expanded.delete(id) : expanded.add(id); }
  selId = id;
  poll(); // re-render immediately
});

let domRoot = null;
async function poll() {
  try {
    const [renderHtml, dom, state] = await Promise.all([
      fetch('/render').then(r => r.text()),
      fetch('/dom').then(r => r.json()),
      fetch('/state').then(r => r.json()),
    ]);
    document.getElementById('mirror').innerHTML = renderHtml;
    domRoot = dom; pathId(dom, '0');
    document.getElementById('tree').innerHTML = '<ul>' + renderTree(dom) + '</ul>';
    const sel = selId ? findById(dom, selId) : null;
    showDetail(sel);
    drawHighlight(sel && sel.region);
    document.getElementById('s-size').textContent = state.terminalSize ? state.terminalSize.width + '×' + state.terminalSize.height : '–';
    document.getElementById('s-focus').textContent = state.focusedWidget || '–';
    document.getElementById('s-hover').textContent = state.hoveredWidget || '–';
    document.getElementById('s-theme').textContent = state.activeTheme || '–';
    const rs = state.renderReasons || {};
    const top = Object.entries(rs).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>k+'×'+v).join('  ');
    document.getElementById('s-reasons').textContent = top;
  } catch (err) { /* server gone; keep last frame */ }
}
poll();
setInterval(poll, 600);
</script>
</body>
</html>`;
}
