import { parseTCSS } from "../css/css-parser.ts";
import { CSSResolver } from "../css/css-resolver.ts";
import { DOMNode } from "../dom/dom.ts";
import { Screen } from "../dom/screen.ts";
import { Widget } from "../dom/widget.ts";
import { BunDriver } from "../driver/bun/index.ts";
import type { Driver, KeyEvent } from "../driver/driver.ts";
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

/**
 * Optional clipboard/selection surface implemented by editable text widgets
 * (`Input`, `TextArea`). The App routes copy/cut/paste/select-all to the focused
 * widget through this duck-typed shape without importing widget classes.
 */
interface ClipboardWidget {
  copySelection?: () => string | null;
  cutSelection?: () => string | null;
  clearSelection?: () => void;
  selectAll?: () => void;
  insertText?: (text: string) => void;
}

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

  /**
   * The most recently rendered frame buffer (read-only view).
   * Exposed for inspection/testing — callers must not mutate it.
   */
  public get buffer(): ScreenBuffer {
    return this.currentBuffer;
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
        // Selection-aware quit: if the focused text widget has an active
        // selection, copy it (and clear it, so a second Ctrl+C quits) instead of
        // exiting. This is the only copy path that works on terminals WITHOUT the
        // Kitty keyboard protocol, where Ctrl+Shift+C is byte-identical to a bare
        // Ctrl+C. Marking the event handled stops the driver's fallback exit.
        const focused = this.activeScreen.focusedWidget as ClipboardWidget | null;
        const copied = focused?.copySelection?.();
        if (copied != null) {
          this.safeInvoke("clearSelection (after Ctrl+C copy)", () => focused?.clearSelection?.());
          ev.handled = true;
          this.queueRender();
          return;
        }
        ev.handled = true;
        this.stop();
        process.exit(0);
      }

      // Clipboard commands routed to the focused text widget. Copy/cut also bind
      // Ctrl+Shift+C/X (key "ctrl+C"/"ctrl+X" — distinguishable from a bare Ctrl+C
      // only under the Kitty keyboard protocol); paste/select-all use Ctrl+V /
      // Ctrl+A, which reach the app on every terminal. Each is guarded by a
      // capability check so non-text widgets are unaffected.
      if (this.routeClipboardKey(ev)) {
        this.queueRender();
        return;
      }

      const screen = this.activeScreen;

      // Layer key interception: sticky panels see keys first (top-down) so they
      // can claim navigation keys while leaving text for the focused control
      // below. A modal blocks interception from reaching layers beneath it.
      for (let i = screen.layers.length - 1; i >= 0; i--) {
        const layer = screen.layers[i];
        const interceptor = layer.keyInterceptor;
        if (interceptor) {
          this.safeInvoke(`keyInterceptor on layer ${i}`, () => interceptor(ev));
          if (ev.handled) {
            log(`Key "${ev.key}" intercepted by layer ${i}`);
            this.queueRender();
            return;
          }
        }
        if (layer.modal) break;
      }

      // Escape closes the topmost layer that opted in (modal dialog or sticky
      // panel), before its content sees the key — a focused control would
      // otherwise mark every key handled. Disable per-layer with
      // `closeOnEscape={false}` when the content needs Escape for itself.
      if (ev.key === "escape" || ev.name === "escape") {
        const top = screen.layers[screen.layers.length - 1];
        if (top?.closeOnEscape) {
          log("Escape closing top layer");
          this.safeInvoke("layer onClose (escape)", () => top.onClose?.());
          this.queueRender();
          return;
        }
      }

      if (ev.key === "tab") {
        screen.focusNext(ev.shift);
        log(`Focus moved to: ${screen.focusedWidget?.describe() ?? "(none)"}`);
        this.queueRender();
        return;
      }

      // Bubble key event up from the focused widget
      let current: DOMNode | null = screen.focusedWidget;
      let handledBy: Widget | null = null;
      while (current) {
        if (current instanceof Widget) {
          const w = current;
          if (w.handleKey) {
            this.safeInvoke(`handleKey on ${w.describe()}`, () => w.handleKey(ev));
            if (ev.handled) {
              handledBy = w;
              break;
            }
          }
        }
        current = current.parent;
      }
      if (handledBy) {
        log(`Key "${ev.key}" handled by ${handledBy.describe()}`);
        this.queueRender();
        return;
      }

      log(`Key "${ev.key}" ignored (no widget in the focused chain handled it)`);
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
          this.safeInvoke(`onMouseLeave on ${oldHovered.describe()}`, () =>
            oldHovered.onMouseLeave?.(ev),
          );
        }
        if (hit?.onMouseEnter) {
          log(`onMouseEnter -> ${hit.describe()}`);
          this.safeInvoke(`onMouseEnter on ${hit.describe()}`, () => hit.onMouseEnter?.(ev));
        }
        this.queueRender();
      }

      // Modal outside-click: a press that resolves to the bare backdrop (i.e.
      // missed the panel) dismisses the layer if it opted in. The full-screen
      // modal backdrop is hit-tested first, so the layer below never sees it.
      if (ev.type === "press" && ev.button === "left") {
        const modal = this.activeScreen.topModalLayer;
        if (modal && hit === modal.root) {
          if (modal.closeOnOutsideClick) {
            log("Outside click closing top modal layer");
            this.safeInvoke("modal onClose (outside click)", () => modal.onClose?.());
          }
          this.queueRender();
          return;
        }
      }

      if (hit) {
        const hitWidget = hit;
        if (hitWidget.handleMouse) {
          this.safeInvoke(`handleMouse on ${hitWidget.describe()}`, () =>
            hitWidget.handleMouse(ev),
          );
        }

        if (!ev.handled) {
          if (ev.type === "press" && ev.button === "left") {
            if (hitWidget.focusable) {
              this.activeScreen.focusWidget(hitWidget);
              log(`Focused via click -> ${hitWidget.describe()}`);
              this.queueRender();
            }
            if (hitWidget.onClick) {
              log(`onClick -> ${hitWidget.describe()}`);
              this.safeInvoke(`onClick on ${hitWidget.describe()}`, () => hitWidget.onClick?.(ev));
              this.queueRender();
            }
          } else if (ev.type === "scroll_up" || ev.type === "scroll_down") {
            let current: DOMNode | null = hitWidget;
            while (current) {
              if (current instanceof Widget) {
                const w = current;
                if (w.handleScroll) {
                  log(`Scroll forwarded to ${w.describe()}`);
                  this.safeInvoke(`handleScroll on ${w.describe()}`, () => w.handleScroll(ev));
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

    // Native terminal paste (bracketed paste) arrives as one event; route the
    // whole payload to the focused text widget as a single insert.
    this.driver.on("paste", (text) => {
      const focused = this.activeScreen.focusedWidget as ClipboardWidget | null;
      if (focused && typeof focused.insertText === "function") {
        this.safeInvoke("paste (bracketed)", () => focused.insertText?.(text));
        this.queueRender();
      }
    });
  }

  /**
   * Route a clipboard shortcut to the focused widget if it is text-capable.
   * Returns true when the key was consumed. Paste reads the framework clipboard
   * (OSC 52) asynchronously, so it resolves on a later tick.
   */
  private routeClipboardKey(ev: KeyEvent): boolean {
    const focused = this.activeScreen.focusedWidget as ClipboardWidget | null;
    if (!focused) return false;

    if (ev.ctrl && ev.shift && ev.name === "c" && typeof focused.copySelection === "function") {
      this.safeInvoke("copySelection", () => focused.copySelection?.());
      return true;
    }
    if (ev.ctrl && ev.shift && ev.name === "x" && typeof focused.cutSelection === "function") {
      this.safeInvoke("cutSelection", () => focused.cutSelection?.());
      return true;
    }
    if (ev.ctrl && !ev.shift && ev.name === "a" && typeof focused.selectAll === "function") {
      this.safeInvoke("selectAll", () => focused.selectAll?.());
      return true;
    }
    if (ev.ctrl && !ev.shift && ev.name === "v" && typeof focused.insertText === "function") {
      this.safeInvoke("paste", () => {
        Promise.resolve(this.driver.clipboard.get()).then((text) => {
          if (text) {
            this.safeInvoke("insertText (paste)", () => focused.insertText?.(text));
            this.queueRender();
          }
        });
      });
      return true;
    }
    return false;
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

  /** Invoke user/widget event code without letting a throw kill the event loop. */
  private safeInvoke(what: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      logger.error("event", `handler threw during ${what}`, err);
    }
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

    // Resolve styles and absolute layouts for screen overlays. Overlays fill the
    // screen and must be measured (so layer content can size/center itself)
    // before their subtree is laid out.
    for (const overlay of screen.overlays) {
      this.resolveAllStyles(overlay);
      overlay.measure(screen.region.width, screen.region.height);
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
          prefix = this.driver.getGraphicClearSequence();
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
      try {
        node.computedStyle = this.cssResolver.resolveStyles(node, isHovered);
      } catch (err) {
        // A bad style value for one widget must not abort styling the whole tree;
        // fall back to its inline style and log.
        logger.error("style", `style resolution failed: ${node.describe()}`, err);
        node.computedStyle = node.style;
      }
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

    // Widgets that lay out their own children (e.g. a virtualized table that
    // positions cell widgets into row/column slots) opt in via `layoutChildren`.
    // Returning true means the default layout dispatch below is skipped; the
    // recursion at the end still lays out each child's own subtree.
    const customLayout = (parent as unknown as { layoutChildren?: () => boolean }).layoutChildren;
    if (typeof customLayout === "function" && customLayout.call(parent)) {
      // handled by the widget
    } else if (parent.tagName === "tabcontainer") {
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
          // A sticky pass-through layer only captures clicks that land on its
          // panel content; clicks that resolve to the bare backdrop fall through
          // to the layer below (keeping e.g. a chatbox clickable).
          if (match === overlay && (overlay as any).passThrough) {
            continue;
          }
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
