import type { KeyEvent, MouseEvent } from "../driver/driver.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";
import { fadeScrollEdges } from "./scroll-fade.ts";
import { scrollbarTrackStyle } from "./scrollbar.ts";
import { Widget } from "./widget.ts";

/** @internal Mixin base constructor type. */
export type Constructor<T = object> = new (...args: any[]) => T;

/** The members {@link Scrollable} adds to a Widget subclass. */
export interface ScrollableMembers {
  /** Whether horizontal overflow scrolls (overflowX is `scroll`/`auto`). */
  readonly scrollableX: boolean;
  /** Whether vertical overflow scrolls (overflowY is `scroll`/`auto`). */
  readonly scrollableY: boolean;
  /** The size of the laid-out content, used to clamp the scroll offset. */
  getContentSize(): Size;
  /** The full inner box ignoring the scrollbar gutter (where the bar is drawn). */
  getViewportRect(): Region;
}

/** Mixin adding scroll behavior to a Widget subclass. */
export function Scrollable<TBase extends Constructor<Widget>>(
  Base: TBase,
): TBase & Constructor<ScrollableMembers> {
  return class ScrollableMixin extends Base {
    public get scrollableX(): boolean {
      const overflow = this.computedStyle.overflowX || "auto";
      return overflow === "scroll" || overflow === "auto";
    }

    public get scrollableY(): boolean {
      const overflow = this.computedStyle.overflowY || "auto";
      return overflow === "scroll" || overflow === "auto";
    }

    private isDraggingY = false;
    private isDraggingX = false;
    private dragStartOffset = 0;

    /**
     * Opt-in tail-following: pin to the bottom as content grows, until the user
     * scrolls up — and resume once they scroll back to the bottom. Off by
     * default, so ordinary scrollables are unaffected. Used by an agent
     * transcript / streaming log to stay on the latest output.
     */
    public followTail = false;
    // Whether tail-following is currently pinned (vs. the user has scrolled up).
    private tailPinned = true;

    constructor(...args: any[]) {
      super(...args);
      this.focusable = true;
    }

    /** Largest vertical scroll offset (content height beyond the viewport). */
    private maxScrollOffsetY(): number {
      return Math.max(0, this.getContentSize().height - this.getContentRect().height);
    }

    /** Whether the view is scrolled to (or past) the bottom. */
    public isAtBottom(): boolean {
      return this.scrollOffset.y >= this.maxScrollOffsetY();
    }

    /** Jump to the bottom and (re)engage tail-following. */
    public scrollToBottom(): void {
      this.scrollOffset = new Offset(this.scrollOffset.x, this.maxScrollOffsetY());
      this.tailPinned = true;
    }

    public getContentSize(): Size {
      let maxR = 0;
      let maxB = 0;
      for (const child of this.children) {
        if (child instanceof Widget && child.visible) {
          const right = child.region.right + this.scrollOffset.x;
          const bottom = child.region.bottom + this.scrollOffset.y;
          if (right > maxR) maxR = right;
          if (bottom > maxB) maxB = bottom;
        }
      }
      // Use the full viewport (not the scrollbar-reserved content rect) for the
      // origin, both to avoid recursion with getContentRect and because content
      // extent is measured from the same origin regardless of the gutter.
      const viewport = this.getViewportRect();
      const w = Math.max(0, maxR - viewport.x);
      const h = Math.max(0, maxB - viewport.y);
      return new Size(w, h);
    }

    /**
     * The full inner box ignoring any scrollbar gutter — where the scrollbar
     * itself is painted and hit-tested. {@link getContentRect} subtracts the
     * gutter from this so content never renders under a visible scrollbar.
     */
    public getViewportRect(): Region {
      return super.getContentRect();
    }

    /**
     * Whether a scrollbar is currently shown on each axis, computed from the
     * full viewport (so the result doesn't depend on the gutter it controls).
     */
    private scrollbarVisibility(): { showY: boolean; showX: boolean } {
      const viewport = this.getViewportRect();
      const size = this.getContentSize();
      const overflowY = this.computedStyle.overflowY || "auto";
      const overflowX = this.computedStyle.overflowX || "auto";
      return {
        showY: overflowY === "scroll" || (overflowY === "auto" && size.height > viewport.height),
        showX: overflowX === "scroll" || (overflowX === "auto" && size.width > viewport.width),
      };
    }

    // Reserve a one-column / one-row gutter for a visible scrollbar so content
    // (and absolute children like a copy button) never renders beneath the bar.
    // Bordered scrollables draw the bar on the border, outside content, so they
    // need no gutter.
    override getContentRect(): Region {
      const full = super.getContentRect();
      const hasBorder = !!this.computedStyle.border && this.computedStyle.border !== "none";
      if (hasBorder) return full;
      const { showY, showX } = this.scrollbarVisibility();
      let w = full.width;
      let h = full.height;
      if (showY && w > 0) w -= 1;
      if (showX && h > 0) h -= 1;
      if (w === full.width && h === full.height) return full;
      return new Region(full.offset, new Size(w, h));
    }

    override measure(maxW: number, maxH: number): void {
      const childMaxW = this.scrollableX ? 10000 : maxW;
      const childMaxH = this.scrollableY ? 10000 : maxH;

      // Measure children with expanded bounds
      for (const child of this.children) {
        if (child instanceof Widget && child.visible) {
          child.measure(childMaxW, childMaxH);
        }
      }

      // Temporarily override child.measure to prevent super.measure from re-measuring children and down-clamping
      const originalMeasures = new Map<Widget, typeof Widget.prototype.measure>();
      for (const child of this.children) {
        if (child instanceof Widget) {
          originalMeasures.set(child, child.measure);
          child.measure = () => {};
        }
      }

      try {
        super.measure(maxW, maxH);
      } finally {
        for (const [child, original] of originalMeasures) {
          child.measure = original;
        }
      }
    }

    override render(buffer: ScreenBuffer): void {
      // Tail-following: re-pin to the bottom until the user scrolls away.
      // Children were positioned for the *old* offset this frame, so moving it
      // needs another layout pass — request one; it converges in a frame or two
      // (settle flushes them) and then holds steady.
      if (this.followTail && this.scrollableY && this.tailPinned) {
        const max = this.maxScrollOffsetY();
        if (this.scrollOffset.y !== max) {
          this.scrollOffset = new Offset(this.scrollOffset.x, max);
          this.app?.queueRender("scrollable:tail");
        }
      }
      super.render(buffer);
      // Fade the content's edge rows *before* the scrollbar so the bar stays
      // crisp on top of the gradient.
      this.drawScrollFades(buffer);
      this.drawScrollbars(buffer);
    }

    /**
     * Fade the top and/or bottom content row toward the background when there's
     * scrolled-away content in that direction — a soft gradient cue (alongside
     * the scrollbar) that more rows exist above/below the viewport. Pure visual
     * affordance: only the already-painted edge cells are tinted.
     */
    private drawScrollFades(buffer: ScreenBuffer): void {
      if (!this.scrollableY) return;
      const content = this.getContentRect();
      const maxScrollY = Math.max(0, this.getContentSize().height - content.height);
      if (maxScrollY <= 0) return; // content fits — nothing hidden
      fadeScrollEdges(
        buffer,
        content,
        this.scrollOffset.y > 0,
        this.scrollOffset.y < maxScrollY,
        this.findResolvedBackground(),
      );
    }

    override renderChildren(buffer: ScreenBuffer): void {
      const clip = this.getContentRect();
      buffer.pushClip(clip);
      super.renderChildren(buffer);
      buffer.popClip();
    }

    override handleScroll(ev: MouseEvent): void {
      super.handleScroll(ev);
      // If the scroll has already been handled by a child, we don't handle it.
      if (ev.handled) return;

      const contentSize = this.getContentSize();
      const parentRect = this.getContentRect();
      const maxScrollY = Math.max(0, contentSize.height - parentRect.height);

      let scrolled = false;
      if (ev.type === "scroll_up" && this.scrollableY && this.scrollOffset.y > 0) {
        this.scrollOffset = new Offset(this.scrollOffset.x, Math.max(0, this.scrollOffset.y - 1));
        scrolled = true;
      } else if (
        ev.type === "scroll_down" &&
        this.scrollableY &&
        this.scrollOffset.y < maxScrollY
      ) {
        this.scrollOffset = new Offset(
          this.scrollOffset.x,
          Math.min(maxScrollY, this.scrollOffset.y + 1),
        );
        scrolled = true;
      }

      if (scrolled) {
        // A user scroll detaches the tail; scrolling back to the bottom re-pins.
        if (this.followTail) this.tailPinned = this.scrollOffset.y >= maxScrollY;
        ev.handled = true;
      }
    }

    override handleKey(ev: KeyEvent): void {
      super.handleKey(ev);
      if (ev.handled) return;

      const contentSize = this.getContentSize();
      const parentRect = this.getContentRect();
      const maxScrollX = Math.max(0, contentSize.width - parentRect.width);
      const maxScrollY = Math.max(0, contentSize.height - parentRect.height);

      let scrolled = false;
      if (this.scrollableY) {
        if (ev.name === "up" || ev.key === "up") {
          if (this.scrollOffset.y > 0) {
            this.scrollOffset = new Offset(
              this.scrollOffset.x,
              Math.max(0, this.scrollOffset.y - 1),
            );
            scrolled = true;
          }
        } else if (ev.name === "down" || ev.key === "down") {
          if (this.scrollOffset.y < maxScrollY) {
            this.scrollOffset = new Offset(
              this.scrollOffset.x,
              Math.min(maxScrollY, this.scrollOffset.y + 1),
            );
            scrolled = true;
          }
        } else if (ev.name === "pageup") {
          if (this.scrollOffset.y > 0) {
            this.scrollOffset = new Offset(
              this.scrollOffset.x,
              Math.max(0, this.scrollOffset.y - parentRect.height + 1),
            );
            scrolled = true;
          }
        } else if (ev.name === "pagedown") {
          if (this.scrollOffset.y < maxScrollY) {
            this.scrollOffset = new Offset(
              this.scrollOffset.x,
              Math.min(maxScrollY, this.scrollOffset.y + parentRect.height - 1),
            );
            scrolled = true;
          }
        }
      }

      if (this.scrollableX) {
        if (ev.name === "left" || ev.key === "left") {
          if (this.scrollOffset.x > 0) {
            this.scrollOffset = new Offset(
              Math.max(0, this.scrollOffset.x - 1),
              this.scrollOffset.y,
            );
            scrolled = true;
          }
        } else if (ev.name === "right" || ev.key === "right") {
          if (this.scrollOffset.x < maxScrollX) {
            this.scrollOffset = new Offset(
              Math.min(maxScrollX, this.scrollOffset.x + 1),
              this.scrollOffset.y,
            );
            scrolled = true;
          }
        }
      }

      if (scrolled) {
        if (this.followTail) this.tailPinned = this.scrollOffset.y >= maxScrollY;
        ev.handled = true;
      }
    }

    override handleMouse(ev: MouseEvent): void {
      super.handleMouse(ev);
      if (ev.handled) return;

      const client = this.getClientRect();
      const content = this.getContentRect();
      const viewport = this.getViewportRect();
      const contentSize = this.getContentSize();
      const hasBorder = this.computedStyle.border && this.computedStyle.border !== "none";

      const { showY, showX } = this.scrollbarVisibility();

      const vScrollbarX = hasBorder ? client.right - 1 : viewport.right - 1;
      const startY = hasBorder ? client.y + 1 : content.y;
      const endY = hasBorder ? client.bottom - 2 : content.bottom - 1;
      const trackHeight = endY - startY + 1;

      const hScrollbarY = hasBorder ? client.bottom - 1 : viewport.bottom - 1;
      const startX = hasBorder ? client.x + 1 : content.x;
      const endX = hasBorder ? client.right - 2 : content.right - 1;
      const trackWidth = endX - startX + 1;

      if (ev.type === "press" && ev.button === "left") {
        if (showY && ev.x === vScrollbarX && ev.y >= startY && ev.y <= endY && trackHeight > 0) {
          const thumbHeight = Math.max(
            1,
            Math.round((content.height / Math.max(1, contentSize.height)) * trackHeight),
          );
          const maxScrollY = contentSize.height - content.height;
          const scrollRatio = maxScrollY > 0 ? this.scrollOffset.y / maxScrollY : 0;
          const thumbStart = startY + Math.round(scrollRatio * (trackHeight - thumbHeight));

          if (ev.y >= thumbStart && ev.y < thumbStart + thumbHeight) {
            this.isDraggingY = true;
            this.dragStartOffset = ev.y - thumbStart;
          } else {
            const clickPos = ev.y - startY - Math.floor(thumbHeight / 2);
            const ratio = trackHeight > thumbHeight ? clickPos / (trackHeight - thumbHeight) : 0;
            const targetScrollY = Math.max(0, Math.min(maxScrollY, Math.round(ratio * maxScrollY)));
            this.scrollOffset = new Offset(this.scrollOffset.x, targetScrollY);
            this.isDraggingY = true;
            this.dragStartOffset = Math.floor(thumbHeight / 2);
          }
          ev.handled = true;
        } else if (
          showX &&
          ev.y === hScrollbarY &&
          ev.x >= startX &&
          ev.x <= endX &&
          trackWidth > 0
        ) {
          const thumbWidth = Math.max(
            1,
            Math.round((content.width / Math.max(1, contentSize.width)) * trackWidth),
          );
          const maxScrollX = contentSize.width - content.width;
          const scrollRatio = maxScrollX > 0 ? this.scrollOffset.x / maxScrollX : 0;
          const thumbStart = startX + Math.round(scrollRatio * (trackWidth - thumbWidth));

          if (ev.x >= thumbStart && ev.x < thumbStart + thumbWidth) {
            this.isDraggingX = true;
            this.dragStartOffset = ev.x - thumbStart;
          } else {
            const clickPos = ev.x - startX - Math.floor(thumbWidth / 2);
            const ratio = trackWidth > thumbWidth ? clickPos / (trackWidth - thumbWidth) : 0;
            const targetScrollX = Math.max(0, Math.min(maxScrollX, Math.round(ratio * maxScrollX)));
            this.scrollOffset = new Offset(targetScrollX, this.scrollOffset.y);
            this.isDraggingX = true;
            this.dragStartOffset = Math.floor(thumbWidth / 2);
          }
          ev.handled = true;
        }
      } else if (ev.type === "drag" && ev.button === "left") {
        if (this.isDraggingY && trackHeight > 0) {
          const thumbHeight = Math.max(
            1,
            Math.round((content.height / Math.max(1, contentSize.height)) * trackHeight),
          );
          const maxScrollY = contentSize.height - content.height;
          const thumbStart = ev.y - this.dragStartOffset - startY;
          const ratio = trackHeight > thumbHeight ? thumbStart / (trackHeight - thumbHeight) : 0;
          const targetScrollY = Math.max(0, Math.min(maxScrollY, Math.round(ratio * maxScrollY)));
          this.scrollOffset = new Offset(this.scrollOffset.x, targetScrollY);
          ev.handled = true;
        } else if (this.isDraggingX && trackWidth > 0) {
          const thumbWidth = Math.max(
            1,
            Math.round((content.width / Math.max(1, contentSize.width)) * trackWidth),
          );
          const maxScrollX = contentSize.width - content.width;
          const thumbStart = ev.x - this.dragStartOffset - startX;
          const ratio = trackWidth > thumbWidth ? thumbStart / (trackWidth - thumbWidth) : 0;
          const targetScrollX = Math.max(0, Math.min(maxScrollX, Math.round(ratio * maxScrollX)));
          this.scrollOffset = new Offset(targetScrollX, this.scrollOffset.y);
          ev.handled = true;
        }
      } else if (ev.type === "release") {
        if (this.isDraggingY || this.isDraggingX) {
          this.isDraggingY = false;
          this.isDraggingX = false;
          ev.handled = true;
        }
      }
    }

    private drawScrollbars(buffer: ScreenBuffer): void {
      const client = this.getClientRect();
      const content = this.getContentRect();
      const viewport = this.getViewportRect();
      const contentSize = this.getContentSize();
      const hasBorder = this.computedStyle.border && this.computedStyle.border !== "none";

      const fg = this.computedStyle.borderColor || this.computedStyle.color || "default";
      const bg = this.computedStyle.background || "default";
      const style = new Style({ color: fg, background: bg });
      // Borderless scrollbars fill the track with a solid dimmed background (a
      // space glyph) instead of a `░` shade character, which renders poorly in
      // many fonts. Bordered bars keep the crisp line glyphs on the frame.
      const track = scrollbarTrackStyle(this);

      const { showY, showX } = this.scrollbarVisibility();

      // Vertical Scrollbar
      if (showY && content.height > 0) {
        const startY = hasBorder ? client.y + 1 : content.y;
        const endY = hasBorder ? client.bottom - 2 : content.bottom - 1;
        const trackHeight = endY - startY + 1;

        if (trackHeight > 0) {
          const thumbHeight = Math.max(
            1,
            Math.round((content.height / Math.max(1, contentSize.height)) * trackHeight),
          );
          const maxScrollY = contentSize.height - content.height;
          const scrollRatio = maxScrollY > 0 ? this.scrollOffset.y / maxScrollY : 0;
          const thumbStart = startY + Math.round(scrollRatio * (trackHeight - thumbHeight));

          const x = hasBorder ? client.right - 1 : viewport.right - 1;

          for (let y = startY; y <= endY; y++) {
            const isThumb = y >= thumbStart && y < thumbStart + thumbHeight;
            if (isThumb) buffer.setCell(x, y, "█", style);
            else if (hasBorder) buffer.setCell(x, y, "│", style);
            else buffer.setCell(x, y, " ", track);
          }
        }
      }

      // Horizontal Scrollbar
      if (showX && content.width > 0) {
        const startX = hasBorder ? client.x + 1 : content.x;
        const endX = hasBorder ? client.right - 2 : content.right - 1;
        const trackWidth = endX - startX + 1;

        if (trackWidth > 0) {
          const thumbWidth = Math.max(
            1,
            Math.round((content.width / Math.max(1, contentSize.width)) * trackWidth),
          );
          const maxScrollX = contentSize.width - content.width;
          const scrollRatio = maxScrollX > 0 ? this.scrollOffset.x / maxScrollX : 0;
          const thumbStart = startX + Math.round(scrollRatio * (trackWidth - thumbWidth));

          const y = hasBorder ? client.bottom - 1 : viewport.bottom - 1;

          for (let x = startX; x <= endX; x++) {
            const isThumb = x >= thumbStart && x < thumbStart + thumbWidth;
            if (isThumb) buffer.setCell(x, y, "▀", style);
            else if (hasBorder) buffer.setCell(x, y, "─", style);
            else buffer.setCell(x, y, " ", track);
          }
        }
      }
    }
  };
}
