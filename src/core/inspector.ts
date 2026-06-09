import { readFileSync } from "node:fs";
import { renderBufferToHTML } from "../render/html-renderer.ts";
import type { App } from "./app.ts";
import { logger } from "./logger.ts";
import { ThemeManager } from "./theme.ts";

declare const Bun: any;

export interface InspectorServer {
  stop(): void;
}

export function startInspector(app: App, port = 8000): InspectorServer {
  if (typeof Bun !== "undefined") {
    const server = Bun.serve({
      port,
      fetch(req: Request) {
        return handleRequest(app, req);
      },
    });
    logger.info("inspector", `listening on http://localhost:${port} (bun)`);
    return {
      stop() {
        server.stop();
        logger.info("inspector", "stopped");
      },
    };
  }

  // Node.js fallback using native http module (for Vitest/Node environments)
  const http = require("node:http");
  const server = http.createServer(async (nodeReq: any, nodeRes: any) => {
    const protocol = nodeReq.headers["x-forwarded-proto"] || "http";
    const host = nodeReq.headers.host || `localhost:${port}`;
    const url = new URL(nodeReq.url || "", `${protocol}://${host}`);

    let bodyText = "";
    if (nodeReq.method === "POST") {
      const buffers = [];
      for await (const chunk of nodeReq) {
        buffers.push(chunk);
      }
      bodyText = Buffer.concat(buffers).toString();
    }

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(nodeReq.headers)) {
      if (typeof v === "string") headers[k] = v;
    }

    const req = new Request(url.toString(), {
      method: nodeReq.method,
      headers,
      body: nodeReq.method === "POST" ? bodyText : undefined,
    });

    try {
      const response = await handleRequest(app, req);
      const resHeaders: Record<string, string> = {
        "Content-Type": response.headers.get("Content-Type") || "text/plain",
      };
      for (const [k, v] of response.headers.entries()) {
        resHeaders[k] = v;
      }
      nodeRes.writeHead(response.status, resHeaders);
      nodeRes.end(await response.text());
    } catch (err: any) {
      logger.error("inspector", `request handler failed for ${nodeReq.url}`, err);
      nodeRes.writeHead(500, { "Content-Type": "application/json" });
      nodeRes.end(JSON.stringify({ status: "error", msg: err.message }));
    }
  });

  server.listen(port);
  logger.info("inspector", `listening on http://localhost:${port} (node)`);
  return {
    stop() {
      server.close();
      logger.info("inspector", "stopped");
    },
  };
}

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

async function handleRequest(app: App, req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/dom" && req.method === "GET") {
    const dump = dumpDOMTree(app.activeScreen);
    return new Response(JSON.stringify(dump, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (url.pathname === "/state" && req.method === "GET") {
    return new Response(JSON.stringify(dumpAppState(app), null, 2), { headers: JSON_HEADERS });
  }

  if (url.pathname === "/tree" && req.method === "GET") {
    return new Response(dumpTreeText(app.activeScreen), {
      headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" },
    });
  }

  if (url.pathname === "/log" && req.method === "GET") {
    const requested = Number.parseInt(url.searchParams.get("lines") || "200", 10);
    const maxLines = Number.isFinite(requested) && requested > 0 ? requested : 200;
    let body: string;
    try {
      const all = readFileSync(logger.getFilePath(), "utf-8").split("\n");
      body = all.slice(-maxLines).join("\n");
    } catch (err: any) {
      body = `(no log available at ${logger.getFilePath()}: ${err?.message ?? err})`;
    }
    return new Response(body, {
      headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" },
    });
  }

  if (url.pathname === "/render" && req.method === "GET") {
    const html = renderBufferToHTML((app as any).currentBuffer);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (url.pathname === "/input" && req.method === "POST") {
    try {
      const body: any = await req.json();
      if (body.type === "key") {
        app.driver.emit("key", {
          key: body.key,
          name: body.name || body.key,
          ctrl: !!body.ctrl,
          shift: !!body.shift,
          meta: !!body.meta,
        });
        app.queueRender();
        return new Response(JSON.stringify({ status: "ok", msg: `Key ${body.key} simulated` }), {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
      if (body.type === "mouse") {
        app.driver.emit("mouse", {
          x: body.x,
          y: body.y,
          type: body.action || "press",
          button: body.button || "left",
        });
        app.queueRender();
        return new Response(
          JSON.stringify({ status: "ok", msg: `Mouse click at (${body.x}, ${body.y}) simulated` }),
          {
            headers: { "Access-Control-Allow-Origin": "*" },
          },
        );
      }
      return new Response(JSON.stringify({ status: "error", msg: "Invalid event type" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ status: "error", msg: err.message }), {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  }

  return new Response(
    "ZTUI Inspector Running. Endpoints: GET /dom, GET /tree, GET /state, GET /log?lines=N, GET /render, POST /input",
    {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    },
  );
}

/** High-level snapshot of the running app, for quick human/LLM diagnosis. */
function dumpAppState(app: App): any {
  const screen = app.activeScreen;
  const focused = (screen as any).focusedWidget;
  const driver = app.driver;
  let size: any;
  try {
    const s = driver.getSize();
    size = { width: s.width, height: s.height };
  } catch {
    size = null;
  }
  const hovered = (app as any).hoveredWidget;
  return {
    terminalSize: size,
    screenStackDepth: app.screenStack.length,
    focusedWidget: focused ? focused.describe() : null,
    hoveredWidget: hovered ? hovered.describe() : null,
    activeTheme: ThemeManager.getInstance().getActiveTheme().name,
    capabilities: driver.capabilities,
    log: { file: logger.getFilePath(), level: logger.getLevel() },
  };
}

/** Scannable indented ASCII view of the widget tree, one node per line. */
function dumpTreeText(node: any, depth = 0): string {
  let out = `${"  ".repeat(depth)}${node.describe()}\n`;
  for (const child of node.children || []) {
    out += dumpTreeText(child, depth + 1);
  }
  return out;
}

function dumpDOMTree(node: any): any {
  // Text nodes carry their string content but none of the widget machinery.
  if (typeof node.text === "string" && !node.region) {
    return { tagName: node.tagName, text: node.text };
  }

  const result: any = {
    tagName: node.tagName,
    id: node.id || undefined,
    classes: Array.from(node.classes || []),
  };

  if (node.visible === false) {
    result.visible = false;
  }
  if (node.focusable) {
    result.focusable = true;
  }

  if (node.region) {
    result.region = {
      x: node.region.x,
      y: node.region.y,
      width: node.region.width,
      height: node.region.height,
    };
  }

  if (node.style) {
    result.style = node.style;
  }

  if (node.computedStyle) {
    result.computedStyle = node.computedStyle;
  }

  if ("value" in node) {
    result.value = node.value;
  }

  if (node.focused !== undefined) {
    result.focused = node.focused;
  }

  if (node.children && node.children.length > 0) {
    result.children = node.children.map((c: any) => dumpDOMTree(c));
  }

  return result;
}
