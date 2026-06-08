import { App } from "../core/app.ts";
import { adjustLightness } from "../core/theme.ts";
import { Widget } from "../dom/widget.ts";
import { parseDimension } from "../layout/layout.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Segment, stringWidth } from "../render/segment.ts";
import { Style } from "../render/style.ts";

export interface TabMetric {
  index: number;
  label: string;
  startX: number;
  width: number;
}

export class TabContainerWidget extends Widget {
  public activeIndex = 0;
  public hoveredIndex = 0;
  public onChange?: (index: number) => void;
  private tabMetrics: TabMetric[] = [];

  constructor() {
    super("tabcontainer");
    this.focusable = true;
    this.defaultStyle = {};

    this.onKey = (ev) => {
      const keyName = ev.name || ev.key;
      const panels = this.children.filter((c): c is Widget => c instanceof Widget);
      if (panels.length === 0) return;

      if (keyName === "left" || keyName === "up") {
        this.hoveredIndex = Math.max(0, this.hoveredIndex - 1);
        ev.handled = true;
        App.instance?.queueRender();
      } else if (keyName === "right" || keyName === "down") {
        this.hoveredIndex = Math.min(panels.length - 1, this.hoveredIndex + 1);
        ev.handled = true;
        App.instance?.queueRender();
      } else if (keyName === "enter" || keyName === "space" || keyName === " ") {
        if (this.activeIndex !== this.hoveredIndex) {
          this.activeIndex = this.hoveredIndex;
          for (let i = 0; i < panels.length; i++) {
            panels[i].visible = i === this.activeIndex;
          }
          this.onChange?.(this.activeIndex);
          App.instance?.queueRender();
        }
        ev.handled = true;
      }
    };
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.type === "press" && ev.button === "left") {
      const contentRect = this.getContentRect();
      if (ev.y === contentRect.y) {
        const clickedTab = this.tabMetrics.find(
          (m) => ev.x >= m.startX && ev.x < m.startX + m.width,
        );
        if (clickedTab) {
          this.hoveredIndex = clickedTab.index;
          if (this.activeIndex !== clickedTab.index) {
            this.activeIndex = clickedTab.index;
            const panels = this.children.filter((c): c is Widget => c instanceof Widget);
            for (let i = 0; i < panels.length; i++) {
              panels[i].visible = i === this.activeIndex;
            }
            this.onChange?.(this.activeIndex);
          }
          if (this.focusable) {
            App.instance?.activeScreen.focusWidget(this);
          }
          App.instance?.queueRender();
          ev.handled = true;
        }
      }
    }
  }

  public override measure(maxW: number, maxH: number): void {
    const panels = this.children.filter((c): c is Widget => c instanceof Widget);

    // Clamp indices
    if (this.activeIndex < 0) this.activeIndex = 0;
    if (this.activeIndex >= panels.length) this.activeIndex = Math.max(0, panels.length - 1);
    if (this.hoveredIndex < 0) this.hoveredIndex = 0;
    if (this.hoveredIndex >= panels.length) this.hoveredIndex = Math.max(0, panels.length - 1);

    // Set visible state of children
    for (let i = 0; i < panels.length; i++) {
      panels[i].visible = i === this.activeIndex;
    }

    const b = this.borderSize;
    const p = this.padding;
    const tabBarHeight = 1;

    const contentMaxW = Math.max(0, maxW - b.width - p.width);
    const contentMaxH = Math.max(0, maxH - b.height - p.height - tabBarHeight);

    // Measure the visible active child
    const activeChild = panels[this.activeIndex];
    if (activeChild) {
      activeChild.measure(contentMaxW, contentMaxH);
    }

    // Calculate needed width: max of sum of tab headers and active child width
    let totalTabBarW = 0;
    for (let i = 0; i < panels.length; i++) {
      const label = panels[i].label || panels[i].id || `Tab ${i + 1}`;
      totalTabBarW += stringWidth(label) + 4;
      if (i > 0) {
        const isPrevSelected = i - 1 === this.activeIndex;
        const isCurrentSelected = i === this.activeIndex;
        if (!isPrevSelected && !isCurrentSelected) {
          totalTabBarW += 1; // separator "│"
        }
      }
    }

    const activeW = activeChild ? activeChild.measuredWidth : 0;
    const neededW = Math.max(totalTabBarW, activeW);

    if (this.computedStyle.width === undefined) {
      this.measuredWidth = neededW + b.width + p.width;
    } else {
      const wVal = parseDimension(this.computedStyle.width, maxW, -1);
      this.measuredWidth = typeof wVal === "number" ? wVal : neededW + b.width + p.width;
    }

    const activeH = activeChild ? activeChild.measuredHeight : 0;
    const neededH = activeH + tabBarHeight;

    if (this.computedStyle.height === undefined) {
      this.measuredHeight = neededH + b.height + p.height;
    } else {
      const hVal = parseDimension(this.computedStyle.height, maxH, -1);
      this.measuredHeight = typeof hVal === "number" ? hVal : neededH + b.height + p.height;
    }

    if (this.computedStyle.minWidth !== undefined) {
      this.measuredWidth = Math.max(this.measuredWidth, this.computedStyle.minWidth);
    }
    if (this.computedStyle.maxWidth !== undefined) {
      this.measuredWidth = Math.min(this.measuredWidth, this.computedStyle.maxWidth);
    }
    if (this.computedStyle.minHeight !== undefined) {
      this.measuredHeight = Math.max(this.measuredHeight, this.computedStyle.minHeight);
    }
    if (this.computedStyle.maxHeight !== undefined) {
      this.measuredHeight = Math.min(this.measuredHeight, this.computedStyle.maxHeight);
    }
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const contentRect = this.getContentRect();
    const panels = this.children.filter((c): c is Widget => c instanceof Widget);
    if (panels.length === 0) return;

    const fg = this.computedStyle.color || "default";
    const bg = this.findResolvedBackground();

    const primaryColor = App.instance?.cssResolver.resolveVariable(this, "$primary") || "cyan";
    const _selectBg = App.instance?.cssResolver.resolveVariable(this, "$selectionBg") || "blue";
    const _selectFg = App.instance?.cssResolver.resolveVariable(this, "$selectionFg") || "white";
    const surfaceBg = App.instance?.cssResolver.resolveVariable(this, "$surface");

    let resolvedInactiveBg = surfaceBg || adjustLightness(bg, -20);
    if (resolvedInactiveBg === bg) {
      resolvedInactiveBg = adjustLightness(bg, -20);
    }

    this.tabMetrics = [];
    let currentX = contentRect.x;
    const tabY = contentRect.y;

    // Fill entire tab header row with inactive background
    const barStyle = new Style({ color: fg, background: resolvedInactiveBg, dim: true });
    for (let tx = contentRect.x; tx < contentRect.right; tx++) {
      buffer.setCell(tx, tabY, " ", barStyle);
    }

    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      const label = panel.label || panel.id || `Tab ${i + 1}`;
      const isSelected = i === this.activeIndex;
      const isHovered = i === this.hoveredIndex;

      // Draw vertical separator between tabs (dimmer/darker than inactive background)
      if (i > 0) {
        const isPrevSelected = i - 1 === this.activeIndex;
        const isCurrentSelected = i === this.activeIndex;
        if (!isPrevSelected && !isCurrentSelected) {
          const sepColor = adjustLightness(resolvedInactiveBg, -30);
          const sepStyle = new Style({ color: sepColor, background: resolvedInactiveBg });
          buffer.setCell(currentX, tabY, "│", sepStyle);
          currentX += 1;
        }
      }

      const text = `  ${label}  `;
      const textLen = stringWidth(text);

      this.tabMetrics.push({
        index: i,
        label,
        startX: currentX,
        width: textLen,
      });

      let tabStyle: Style;
      if (isHovered && this.focused) {
        tabStyle = new Style({
          color: primaryColor,
          background: isSelected ? bg : resolvedInactiveBg,
          bold: true,
          underline: true,
        });
      } else if (isSelected) {
        tabStyle = new Style({
          color: primaryColor,
          background: bg,
          bold: true,
        });
      } else {
        tabStyle = new Style({
          color: fg,
          background: resolvedInactiveBg,
          dim: true,
        });
      }

      for (let tx = currentX; tx < currentX + textLen; tx++) {
        buffer.setCell(tx, tabY, " ", tabStyle);
      }

      const segment = new Segment(text, tabStyle);
      buffer.drawSegment(currentX, tabY, segment, contentRect);

      currentX += textLen;
    }
  }
}
