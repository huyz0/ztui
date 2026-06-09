import { parseTCSS } from "../css/css-parser.ts";
import { CSSResolver } from "../css/css-resolver.ts";
import { DOMNode } from "../dom/dom.ts";
import { Screen } from "../dom/screen.ts";
import { Widget } from "../dom/widget.ts";
import { BunDriver } from "../driver/bun/index.ts";
import type { Driver } from "../driver/driver.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { BoxLayout } from "../layout/box-layout.ts";
import { DockLayout } from "../layout/dock-layout.ts";
import { GridLayout } from "../layout/grid-layout.ts";
import { parseDimension } from "../layout/layout.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { type InspectorServer, startInspector } from "./inspector.ts";
import { logger } from "./logger.ts";
import { ThemeManager } from "./theme.ts";

export class App extends DOMNode {
  public static instance: App | null = null;
  public driver: Driver;
  public screenStack: Screen[] = [];
  public cssResolver: CSSResolver = new CSSResolver();

  private currentBuffer: ScreenBuffer = new ScreenBuffer();
  private prevBuffer: ScreenBuffer = new ScreenBuffer();
  private renderQueued = false;
  private hoveredWidget: Widget | null = null;
  private activeDragWidget: Widget | null = null;
  private inspectorServer: InspectorServer | null = null;
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  private frameCount = 0;

  constructor(driver?: Driver) {
    super("app");
    App.instance = this;
    this.driver = driver || new BunDriver();

    const defaultScreen = new Screen();
    this.pushScreen(defaultScreen);

    ThemeManager.getInstance().subscribe(() => {
      this.queueRender();
    });
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
    logger.init("App started");
    const log = (msg: string) => logger.debug("app", msg);

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

    this.driver.on("resize", (newSize) => {
      log(`Resize event: ${newSize.width}x${newSize.height}`);
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        this.resizeTimeout = null;
        const latestSize = this.driver.getSize();
        const targetW = Math.max(80, latestSize.width);
        const targetH = Math.max(24, latestSize.height);
        this.activeScreen.resize(targetW, targetH);
        this.currentBuffer.resize(targetW, targetH);
        this.prevBuffer.resize(0, 0); // Force full redraw

        this.driver.clearScreen();
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
        log(`Focus moved to: ${this.activeScreen.focusedWidget?.describe() ?? "(none)"}`);
        this.queueRender();
        return;
      }

      // Bubble key event up from the focused widget
      let current: DOMNode | null = this.activeScreen.focusedWidget;
      let handledBy: Widget | null = null;
      while (current) {
        if (current instanceof Widget) {
          if (current.handleKey) {
            current.handleKey(ev);
            if (ev.handled) {
              handledBy = current;
              break;
            }
          }
        }
        current = current.parent;
      }
      if (handledBy) {
        log(`Key "${ev.key}" handled by ${handledBy.describe()}`);
        this.queueRender();
      } else {
        log(`Key "${ev.key}" ignored (no widget in the focused chain handled it)`);
      }
    });

    this.driver.on("mouse", (ev) => {
      let hit = this.hitTest(this.activeScreen, ev.x, ev.y);

      if (this.activeDragWidget && (ev.type === "drag" || ev.type === "release")) {
        hit = this.activeDragWidget;
      }
      if (ev.type === "press") {
        this.activeDragWidget = hit;
      }

      log(
        `Mouse ${ev.type} @ (${ev.x},${ev.y}) btn=${ev.button} -> hit: ${hit?.describe() ?? "none"}`,
      );

      if (ev.type === "release") {
        this.activeDragWidget = null;
      }

      if (hit !== this.hoveredWidget) {
        const oldHovered = this.hoveredWidget;
        this.hoveredWidget = hit;

        if (oldHovered?.onMouseLeave) {
          log(`onMouseLeave -> ${oldHovered.describe()}`);
          oldHovered.onMouseLeave(ev);
        }
        if (hit?.onMouseEnter) {
          log(`onMouseEnter -> ${hit.describe()}`);
          hit.onMouseEnter(ev);
        }
        this.queueRender();
      }

      if (hit) {
        if (hit.handleMouse) {
          hit.handleMouse(ev);
        }

        if (!ev.handled) {
          if (ev.type === "press" && ev.button === "left") {
            if (hit.focusable) {
              this.activeScreen.focusWidget(hit);
              log(`Focused via click -> ${hit.describe()}`);
              this.queueRender();
            }
            if (hit.onClick) {
              log(`onClick -> ${hit.describe()}`);
              hit.onClick(ev);
              this.queueRender();
            }
          } else if (ev.type === "scroll_up" || ev.type === "scroll_down") {
            let current: DOMNode | null = hit;
            while (current) {
              if (current instanceof Widget) {
                if (current.handleScroll) {
                  log(`Scroll forwarded to ${current.describe()}`);
                  current.handleScroll(ev);
                  if (ev.handled) {
                    this.queueRender();
                    break;
                  }
                }
              }
              current = current.parent;
            }
          }
        } else {
          this.queueRender();
        }
      }
    });
  }

  public stop(): void {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
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
    try {
      this.layoutAndRenderUnsafe();
    } catch (err) {
      // Last-resort guard: a render exception must never crash the app or leave
      // the terminal wedged. Log it and keep the previous frame on screen.
      logger.error("render", "layoutAndRender failed; keeping previous frame", err);
    }
  }

  private layoutAndRenderUnsafe(): void {
    const screen = this.activeScreen;

    this.resolveAllStyles(screen);
    const size = this.driver.getSize();
    screen.measure(screen.region.width, size.height);
    this.resolveAllLayouts(screen);

    // Resolve styles and absolute layouts for screen overlays
    for (const overlay of screen.overlays) {
      this.resolveAllStyles(overlay);
      overlay.region = screen.region.clone();
      this.resolveAllLayouts(overlay);
    }

    this.currentBuffer.clear();
    screen.render(this.currentBuffer);

    const ansiDiff = this.currentBuffer.renderDiff(
      this.prevBuffer,
      (cell, oldCell) => {
        let prefix = "";
        if (oldCell?.graphic && !cell.graphic) {
          if (this.driver.capabilities.graphicsProtocol === "kitty") {
            prefix = "\x1b_Ga=d,d=c\x1b\\";
          }
        }

        if (cell.graphic) {
          return (
            prefix +
            this.driver.getImageSequence(
              cell.graphic.pixelBuffer,
              cell.graphic.pixelWidth,
              cell.graphic.pixelHeight,
              cell.graphic.cellWidth,
              cell.graphic.cellHeight,
              cell.graphic.pngBase64,
              cell.style.background,
              cell.graphic.zIndex,
            )
          );
        }
        if (cell.icon) {
          return (
            prefix + this.driver.getIconSequence(cell.icon, cell.style.color, cell.style.background)
          );
        }
        return prefix + cell.char;
      },
      size.width,
      size.height,
    );
    if (ansiDiff) {
      this.driver.writeFrame(ansiDiff);
      this.currentBuffer.copyTo(this.prevBuffer);
      this.frameCount++;
      logger.debug(
        "render",
        `frame #${this.frameCount} painted (${ansiDiff.length} bytes, ${size.width}x${size.height})`,
      );
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

    if (parent.tagName === "tabcontainer") {
      const inner = parent.getContentRect();
      const tabBarHeight = 1;
      for (const child of parent.children) {
        if (child instanceof Widget && child.visible) {
          child.region = new Region(
            new Offset(inner.x, inner.y + tabBarHeight),
            new Size(inner.width, Math.max(0, inner.height - tabBarHeight)),
          );
        }
      }
    } else if (layoutType === "vertical" || layoutType === "horizontal") {
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

    this.resolveAbsoluteChildren(parent);

    if (parent.scrollOffset.x !== 0 || parent.scrollOffset.y !== 0) {
      for (const child of parent.children) {
        if (child instanceof Widget) {
          child.region = new Region(
            new Offset(
              child.region.x - parent.scrollOffset.x,
              child.region.y - parent.scrollOffset.y,
            ),
            child.region.size,
          );
        }
      }
    }

    for (const child of parent.children) {
      if (child instanceof Widget) {
        this.resolveAllLayouts(child);
      }
    }
  }

  private resolveAbsoluteChildren(parent: Widget): void {
    const parentRect = parent.getContentRect();
    for (const child of parent.children) {
      if (child instanceof Widget && child.visible && child.computedStyle.position === "absolute") {
        const wVal = parseDimension(
          child.computedStyle.width,
          parentRect.width,
          child.measuredWidth,
        );
        const childWidth = typeof wVal === "number" ? wVal : child.measuredWidth;

        const hVal = parseDimension(
          child.computedStyle.height,
          parentRect.height,
          child.measuredHeight,
        );
        const childHeight = typeof hVal === "number" ? hVal : child.measuredHeight;

        let x = parentRect.x;
        if (child.computedStyle.left !== undefined) {
          const val = parseDimension(child.computedStyle.left, parentRect.width, 0);
          x = parentRect.x + (typeof val === "number" ? val : 0);
        } else if (child.computedStyle.right !== undefined) {
          const val = parseDimension(child.computedStyle.right, parentRect.width, 0);
          x = parentRect.right - childWidth - (typeof val === "number" ? val : 0);
        }

        let y = parentRect.y;
        if (child.computedStyle.top !== undefined) {
          const val = parseDimension(child.computedStyle.top, parentRect.height, 0);
          y = parentRect.y + (typeof val === "number" ? val : 0);
        } else if (child.computedStyle.bottom !== undefined) {
          const val = parseDimension(child.computedStyle.bottom, parentRect.height, 0);
          y = parentRect.bottom - childHeight - (typeof val === "number" ? val : 0);
        }

        child.region = new Region(new Offset(x, y), new Size(childWidth, childHeight));
      }
    }
  }

  private hitTest(node: DOMNode, x: number, y: number): Widget | null {
    if (!(node instanceof Widget) || !node.visible) {
      return null;
    }

    // Hit-test overlays first if this node is a Screen
    if (node instanceof Screen) {
      const sortedOverlays = [...node.overlays].sort((a, b) => {
        const az = (a as any).computedStyle?.zIndex ?? 0;
        const bz = (b as any).computedStyle?.zIndex ?? 0;
        return bz - az;
      });
      for (const overlay of sortedOverlays) {
        const match = this.hitTest(overlay, x, y);
        if (match) {
          return match;
        }
      }
    }

    if (!node.region.contains(x, y)) {
      return null;
    }

    if (this.isPointOnScrollbar(node, x, y)) {
      return node;
    }

    const sorted = [...node.children].sort((a, b) => {
      const az = (a as any).computedStyle?.zIndex ?? 0;
      const bz = (b as any).computedStyle?.zIndex ?? 0;
      return bz - az;
    });

    for (const child of sorted) {
      const match = this.hitTest(child, x, y);
      if (match) {
        return match;
      }
    }

    return node;
  }

  private isPointOnScrollbar(widget: Widget, x: number, y: number): boolean {
    const parent = widget as any;
    const isScrollable = parent.scrollableX !== undefined || parent.scrollableY !== undefined;
    if (!isScrollable) return false;

    const client = parent.getClientRect();
    const content = parent.getContentRect();
    const contentSize = parent.getContentSize();
    const hasBorder = parent.computedStyle.border && parent.computedStyle.border !== "none";

    const overflowY = parent.computedStyle.overflowY || "auto";
    const showY =
      overflowY === "scroll" || (overflowY === "auto" && contentSize.height > content.height);
    const overflowX = parent.computedStyle.overflowX || "auto";
    const showX =
      overflowX === "scroll" || (overflowX === "auto" && contentSize.width > content.width);

    if (showY) {
      const vScrollbarX = hasBorder ? client.right - 1 : content.right - 1;
      const startY = hasBorder ? client.y + 1 : content.y;
      const endY = hasBorder ? client.bottom - 2 : content.bottom - 1;
      if (x === vScrollbarX && y >= startY && y <= endY) {
        return true;
      }
    }

    if (showX) {
      const hScrollbarY = hasBorder ? client.bottom - 1 : content.bottom - 1;
      const startX = hasBorder ? client.x + 1 : content.x;
      const endX = hasBorder ? client.right - 2 : content.right - 1;
      if (y === hScrollbarY && x >= startX && x <= endX) {
        return true;
      }
    }

    return false;
  }
}
