import type { KeyEvent, MouseEvent } from "../driver/driver.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";
import { fadeScrollEdges } from "./scroll-fade.ts";
import {
  horizontalScrollbarTrack,
  scrollbarThumb,
  scrollbarTrackStyle,
  verticalScrollbarTrack,
} from "./scrollbar.ts";
import { Widget } from "./widget.ts";

/** @internal Mixin base constructor type. */
export type Constructor<T = object> = new (...args: any[]) => T;

/**
 * Cells moved per wheel notch (see the identical constant/rationale in
 * `widgets/data/row-scroll.ts`'s `wheelScrollTop` — this mixin scrolls by
 * pixel/cell offset rather than row index, so the arithmetic can't share that
 * helper directly, but the step size should match).
 */
const WHEEL_SCROLL_CELLS = 3;

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
  /**
   * Opt-in tail-following: pin to the bottom as content grows, until the user
   * scrolls up — and resume once they scroll back to the bottom.
   */
  followTail: boolean;
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
        if (child instanceof Widget && child.visible && !child.positionFixed) {
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
        this.scrollOffset = new Offset(
          this.scrollOffset.x,
          Math.max(0, this.scrollOffset.y - WHEEL_SCROLL_CELLS),
        );
        scrolled = true;
      } else if (
        ev.type === "scroll_down" &&
        this.scrollableY &&
        this.scrollOffset.y < maxScrollY
      ) {
        this.scrollOffset = new Offset(
          this.scrollOffset.x,
          Math.min(maxScrollY, this.scrollOffset.y + WHEEL_SCROLL_CELLS),
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
      const hasBorder = !!this.computedStyle.border && this.computedStyle.border !== "none";

      const { showY, showX } = this.scrollbarVisibility();

      const vTrack = verticalScrollbarTrack(client, content, viewport, hasBorder);
      const hTrack = horizontalScrollbarTrack(client, content, viewport, hasBorder);

      if (ev.type === "press" && ev.button === "left") {
        if (
          showY &&
          ev.x === vTrack.line &&
          ev.y >= vTrack.start &&
          ev.y <= vTrack.end &&
          vTrack.length > 0
        ) {
          const thumb = scrollbarThumb(
            vTrack,
            content.height,
            contentSize.height,
            this.scrollOffset.y,
          );

          if (ev.y >= thumb.start && ev.y < thumb.start + thumb.size) {
            this.isDraggingY = true;
            this.dragStartOffset = ev.y - thumb.start;
          } else {
            const clickPos = ev.y - vTrack.start - Math.floor(thumb.size / 2);
            const ratio = vTrack.length > thumb.size ? clickPos / (vTrack.length - thumb.size) : 0;
            const targetScrollY = Math.max(
              0,
              Math.min(thumb.maxScroll, Math.round(ratio * thumb.maxScroll)),
            );
            this.scrollOffset = new Offset(this.scrollOffset.x, targetScrollY);
            this.isDraggingY = true;
            this.dragStartOffset = Math.floor(thumb.size / 2);
            if (this.followTail) this.tailPinned = targetScrollY >= thumb.maxScroll;
          }
          ev.handled = true;
        } else if (
          showX &&
          ev.y === hTrack.line &&
          ev.x >= hTrack.start &&
          ev.x <= hTrack.end &&
          hTrack.length > 0
        ) {
          const thumb = scrollbarThumb(
            hTrack,
            content.width,
            contentSize.width,
            this.scrollOffset.x,
          );

          if (ev.x >= thumb.start && ev.x < thumb.start + thumb.size) {
            this.isDraggingX = true;
            this.dragStartOffset = ev.x - thumb.start;
          } else {
            const clickPos = ev.x - hTrack.start - Math.floor(thumb.size / 2);
            const ratio = hTrack.length > thumb.size ? clickPos / (hTrack.length - thumb.size) : 0;
            const targetScrollX = Math.max(
              0,
              Math.min(thumb.maxScroll, Math.round(ratio * thumb.maxScroll)),
            );
            this.scrollOffset = new Offset(targetScrollX, this.scrollOffset.y);
            this.isDraggingX = true;
            this.dragStartOffset = Math.floor(thumb.size / 2);
          }
          ev.handled = true;
        }
      } else if (ev.type === "drag" && ev.button === "left") {
        if (this.isDraggingY && vTrack.length > 0) {
          const thumb = scrollbarThumb(
            vTrack,
            content.height,
            contentSize.height,
            this.scrollOffset.y,
          );
          const thumbStart = ev.y - this.dragStartOffset - vTrack.start;
          const ratio = vTrack.length > thumb.size ? thumbStart / (vTrack.length - thumb.size) : 0;
          const targetScrollY = Math.max(
            0,
            Math.min(thumb.maxScroll, Math.round(ratio * thumb.maxScroll)),
          );
          this.scrollOffset = new Offset(this.scrollOffset.x, targetScrollY);
          if (this.followTail) this.tailPinned = targetScrollY >= thumb.maxScroll;
          ev.handled = true;
        } else if (this.isDraggingX && hTrack.length > 0) {
          const thumb = scrollbarThumb(
            hTrack,
            content.width,
            contentSize.width,
            this.scrollOffset.x,
          );
          const thumbStart = ev.x - this.dragStartOffset - hTrack.start;
          const ratio = hTrack.length > thumb.size ? thumbStart / (hTrack.length - thumb.size) : 0;
          const targetScrollX = Math.max(
            0,
            Math.min(thumb.maxScroll, Math.round(ratio * thumb.maxScroll)),
          );
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
      const hasBorder = !!this.computedStyle.border && this.computedStyle.border !== "none";

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
        const vTrack = verticalScrollbarTrack(client, content, viewport, hasBorder);

        if (vTrack.length > 0) {
          const thumb = scrollbarThumb(
            vTrack,
            content.height,
            contentSize.height,
            this.scrollOffset.y,
          );

          for (let y = vTrack.start; y <= vTrack.end; y++) {
            const isThumb = y >= thumb.start && y < thumb.start + thumb.size;
            if (isThumb) buffer.setCell(vTrack.line, y, "█", style);
            else if (hasBorder) buffer.setCell(vTrack.line, y, "│", style);
            else buffer.setCell(vTrack.line, y, " ", track);
          }
        }
      }

      // Horizontal Scrollbar
      if (showX && content.width > 0) {
        const hTrack = horizontalScrollbarTrack(client, content, viewport, hasBorder);

        if (hTrack.length > 0) {
          const thumb = scrollbarThumb(
            hTrack,
            content.width,
            contentSize.width,
            this.scrollOffset.x,
          );

          for (let x = hTrack.start; x <= hTrack.end; x++) {
            const isThumb = x >= thumb.start && x < thumb.start + thumb.size;
            if (isThumb) buffer.setCell(x, hTrack.line, "▀", style);
            else if (hasBorder) buffer.setCell(x, hTrack.line, "─", style);
            else buffer.setCell(x, hTrack.line, " ", track);
          }
        }
      }
    }
  };
}
