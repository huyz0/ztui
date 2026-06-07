import { parseTCSS } from "../css/css-parser.ts";
import { CSSResolver } from "../css/css-resolver.ts";
import { DOMNode } from "../dom/dom.ts";
import { Screen } from "../dom/screen.ts";
import { Widget } from "../dom/widget.ts";
import { BunDriver } from "../driver/bun/index.ts";
import type { Driver } from "../driver/driver.ts";
import { BoxLayout } from "../layout/box-layout.ts";
import { DockLayout } from "../layout/dock-layout.ts";
import { GridLayout } from "../layout/grid-layout.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { type InspectorServer, startInspector } from "./inspector.ts";

export class App extends DOMNode {
  public static instance: App | null = null;
  public driver: Driver;
  public screenStack: Screen[] = [];
  public cssResolver: CSSResolver = new CSSResolver();

  private currentBuffer: ScreenBuffer = new ScreenBuffer();
  private prevBuffer: ScreenBuffer = new ScreenBuffer();
  private renderQueued = false;
  private hoveredWidget: Widget | null = null;
  private inspectorServer: InspectorServer | null = null;

  constructor(driver?: Driver) {
    super("app");
    App.instance = this;
    this.driver = driver || new BunDriver();

    const defaultScreen = new Screen();
    this.pushScreen(defaultScreen);
  }

  public get activeScreen(): Screen {
    return this.screenStack[this.screenStack.length - 1];
  }

  public pushScreen(screen: Screen): void {
    screen.parent = this;
    this.screenStack.push(screen);
    const size = this.driver.getSize();
    if (size.width > 0) {
      screen.resize(Math.max(80, size.width), Math.max(24, size.height));
      this.layoutAndRender();
    }
  }

  public popScreen(): void {
    if (this.screenStack.length > 1) {
      const popped = this.screenStack.pop();
      if (popped) popped.parent = null;
      this.layoutAndRender();
    }
  }

  public loadStyles(tcssContent: string): void {
    const rules = parseTCSS(tcssContent);
    this.cssResolver.addRules(rules);
    this.queueRender();
  }

  public run(options?: { inspectorPort?: number }): void {
    const fs = require("node:fs");
    fs.writeFileSync("ztui.log", "App started\n");
    const log = (msg: string) => {
      fs.appendFileSync("ztui.log", `[${new Date().toISOString()}] ${msg}\n`);
    };

    if (options?.inspectorPort) {
      this.inspectorServer = startInspector(this, options.inspectorPort);
      log(`Inspector server started on port ${options.inspectorPort}`);
    }

    this.driver.start();

    const size = this.driver.getSize();
    const targetW = Math.max(80, size.width);
    const targetH = Math.max(24, size.height);
    this.activeScreen.resize(targetW, targetH);
    this.currentBuffer.resize(targetW, targetH);
    this.prevBuffer.resize(targetW, targetH);

    log(`Initial screen bounds resolved: ${size.width}x${size.height}`);
    this.layoutAndRender();

    let resizeTimeout: any = null;
    this.driver.on("resize", (newSize) => {
      log(`Resize event: ${newSize.width}x${newSize.height}`);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        resizeTimeout = null;
        const latestSize = this.driver.getSize();
        const targetW = Math.max(80, latestSize.width);
        const targetH = Math.max(24, latestSize.height);
        this.activeScreen.resize(targetW, targetH);
        this.currentBuffer.resize(targetW, targetH);
        this.prevBuffer.resize(0, 0); // Force full redraw

        // Clear terminal screen, home cursor, clear scrollback buffer, and purge Kitty image layers
        this.driver.write("\x1b[H\x1b[2J\x1b[3J");
        if (this.driver.capabilities.graphicsProtocol === "kitty") {
          this.driver.write("\x1b_Ga=d\x1b\\\x1b_Ga=d,d=A\x1b\\");
        }
        this.queueRender();
      }, 30);
    });

    this.driver.on("capabilities_resolved", () => {
      log(
        `Capabilities resolved event received from driver. Cell size: ${JSON.stringify(this.driver.capabilities.cellSize)}, Graphics: ${this.driver.capabilities.graphicsProtocol}`,
      );
      this.queueRender();
    });

    this.driver.on("key", (ev) => {
      log(`Key event received: key=${ev.key}, name=${ev.name}`);
      if (ev.key === "ctrl+c") {
        this.stop();
        process.exit(0);
      }
      if (ev.key === "tab") {
        this.activeScreen.focusNext(ev.shift);
        log(
          `Focus moved to: ${this.activeScreen.focusedWidget?.tagName}#${this.activeScreen.focusedWidget?.id || ""}`,
        );
        this.queueRender();
        return;
      }

      const focused = this.activeScreen.focusedWidget;
      if (focused?.onKey) {
        log(`Key forwarded to widget: ${focused.tagName}#${focused.id || ""}`);
        focused.onKey(ev);
        this.queueRender();
      } else {
        log("Key ignored (no focused widget with key handler)");
      }
    });

    this.driver.on("mouse", (ev) => {
      const hit = this.hitTest(this.activeScreen, ev.x, ev.y);
      log(
        `Mouse event: x=${ev.x}, y=${ev.y}, type=${ev.type}, btn=${ev.button} -> hit: ${hit?.tagName || "none"}#${hit?.id || ""}`,
      );

      if (hit !== this.hoveredWidget) {
        const oldHovered = this.hoveredWidget;
        this.hoveredWidget = hit;

        if (oldHovered?.onMouseLeave) {
          log(`Triggered onMouseLeave on widget: ${oldHovered.tagName}#${oldHovered.id || ""}`);
          oldHovered.onMouseLeave(ev);
        }
        if (hit?.onMouseEnter) {
          log(`Triggered onMouseEnter on widget: ${hit.tagName}#${hit.id || ""}`);
          hit.onMouseEnter(ev);
        }
        this.queueRender();
      }

      if (hit) {
        if (ev.type === "press" && ev.button === "left") {
          if (hit.focusable) {
            this.activeScreen.focusWidget(hit);
            log(`Widget focused via click: ${hit.tagName}#${hit.id || ""}`);
            this.queueRender();
          }
          if (hit.onClick) {
            log(`Triggered onClick on widget: ${hit.tagName}#${hit.id || ""}`);
            hit.onClick(ev);
            this.queueRender();
          }
        }
      }
    });
  }

  public stop(): void {
    if (this.inspectorServer) {
      this.inspectorServer.stop();
      this.inspectorServer = null;
    }
    this.driver.stop();
  }

  public queueRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      this.layoutAndRender();
    });
  }

  private layoutAndRender(): void {
    if (!this.driver.capabilitiesResolved) {
      return;
    }
    const screen = this.activeScreen;

    this.resolveAllStyles(screen);
    const size = this.driver.getSize();
    screen.measure(screen.region.width, screen.region.height);
    this.resolveAllLayouts(screen);

    this.currentBuffer.clear();
    screen.render(this.currentBuffer);

    const ansiDiff = this.currentBuffer.renderDiff(
      this.prevBuffer,
      (cell) => {
        if (cell.graphic) {
          return this.driver.getImageSequence(
            cell.graphic.pixelBuffer,
            cell.graphic.pixelWidth,
            cell.graphic.pixelHeight,
            cell.graphic.cellWidth,
            cell.graphic.cellHeight,
            cell.graphic.pngBase64,
            cell.style.background,
          );
        }
        if (cell.icon) {
          return this.driver.getIconSequence(cell.icon, cell.style.color, cell.style.background);
        }
        return cell.char;
      },
      size.width,
      size.height,
    );
    if (ansiDiff) {
      if (this.driver.capabilities.synchronizedUpdates) {
        this.driver.write(`\x1b[?2026h${ansiDiff}\x1b[?2026l`);
      } else {
        this.driver.write(ansiDiff);
      }
      this.currentBuffer.copyTo(this.prevBuffer);
    }
  }

  private resolveAllStyles(node: DOMNode): void {
    if (node instanceof Widget) {
      const isHovered = this.hoveredWidget === node;
      node.computedStyle = this.cssResolver.resolveStyles(node, isHovered);
    }
    for (const child of node.children) {
      this.resolveAllStyles(child);
    }
  }

  private resolveAllLayouts(parent: Widget): void {
    let layoutType = parent.computedStyle.layout;
    const display = parent.computedStyle.display;
    const flexDirection = parent.computedStyle.flexDirection;

    if (display === "grid") {
      layoutType = "grid";
    } else if (display === "dock") {
      layoutType = "dock";
    } else if (display === "flex" || flexDirection !== undefined) {
      layoutType = flexDirection === "row" ? "horizontal" : "vertical";
    }

    if (layoutType === "vertical" || layoutType === "horizontal") {
      new BoxLayout(layoutType).resolve(parent);
    } else if (layoutType === "dock") {
      new DockLayout().resolve(parent);
    } else if (layoutType === "grid") {
      new GridLayout(2).resolve(parent);
    } else {
      const inner = parent.getContentRect();
      for (const child of parent.children) {
        if (child instanceof Widget && child.visible) {
          child.region = inner.clone();
        }
      }
    }

    for (const child of parent.children) {
      if (child instanceof Widget) {
        this.resolveAllLayouts(child);
      }
    }
  }

  private hitTest(node: DOMNode, x: number, y: number): Widget | null {
    let bestMatch: Widget | null = null;

    node.walk((child) => {
      if (child instanceof Widget && child.visible && child.region.contains(x, y)) {
        bestMatch = child;
      }
    });

    return bestMatch;
  }
}
