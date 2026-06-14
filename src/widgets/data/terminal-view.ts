import { App } from "../../core/app.ts";
import { runCols } from "../../core/selection.ts";
import { scrollTopForKey } from "../../dom/key-nav.ts";
import { Widget } from "../../dom/widget.ts";
import type { MouseEvent } from "../../driver/driver.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { AnsiTerminal, cellsToSegments } from "../../render/rich/ansi.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { handleReadonlySelectionMouse } from "../readonly-selection.ts";

/**
 * A nested, scrollable terminal view that renders streamed command output with
 * full ANSI fidelity — colors, bold/dim/underline, `\r` progress redraws — the
 * way an agent's bash/shell tool produces it. Feed it via the {@link content}
 * prop (the full accumulated output; appended text is parsed incrementally) or
 * imperatively with {@link write}.
 *
 * Crucially it is **sandboxed**: the ANSI is parsed by a contained
 * {@link AnsiTerminal} into an internal cell grid and drawn as styled segments
 * clipped to the widget — the raw escape bytes never reach the real terminal,
 * and viewport-escaping sequences (alt-screen, scroll regions, absolute cursor
 * homing, OSC) are dropped. Child output can garble its own little view but can
 * never corrupt the host app.
 *
 * Like {@link RichLogWidget} it virtualizes and tails: it pins to the bottom as
 * output arrives until you scroll up; `end` / scrolling back resumes tailing.
 */
export class TerminalViewWidget extends Widget {
  /** Word-wrap long lines to the view width; when false, long lines clip. */
  public wrap = true;
  /** Pin to the bottom as output arrives (until the user scrolls up). */
  public autoScroll = true;
  /** Lines retained in scrollback. */
  /** Maximum retained lines. */
  public set maxLines(n: number) {
    this.term.maxLines = n;
  }
  public get maxLines(): number {
    return this.term.maxLines;
  }

  private term = new AnsiTerminal();
  private consumed = "";
  private scrollTop = 0;
  private tailing = true;
  private lastVisibleRows = 0;
  private draggingScrollbar = false;

  constructor() {
    super("terminal-view");
    this.focusable = true;
    this.defaultStyle = { width: "100%", height: "100%" };
    this.term.cols = 80; // sensible default until the first render sizes it
  }

  /** Full accumulated output. Appended text is parsed incrementally. */
  /** The terminal text/output (ANSI is parsed). */
  public set content(value: string) {
    if (value === this.consumed) return;
    if (value.startsWith(this.consumed)) {
      this.term.write(value.slice(this.consumed.length));
    } else {
      // Not an extension of what we've seen — reparse from scratch.
      this.term.reset();
      this.term.write(value);
    }
    this.consumed = value;
    (this.app ?? App.instance)?.queueRender();
  }
  public get content(): string {
    return this.consumed;
  }

  /** Append a chunk of output imperatively (for a streaming writer). */
  public write(data: string): void {
    this.term.write(data);
    this.consumed += data;
    (this.app ?? App.instance)?.queueRender();
  }

  /** Clear the view and scrollback. */
  public clear(): void {
    this.term.reset();
    this.consumed = "";
    this.scrollTop = 0;
    this.tailing = true;
    (this.app ?? App.instance)?.queueRender();
  }

  private get rowCount(): number {
    return this.term.lines.length;
  }

  private maxScrollTop(visibleRows: number): number {
    return Math.max(0, this.rowCount - visibleRows);
  }

  public override handleScroll(ev: any): void {
    super.handleScroll(ev);
    if (ev.handled) return;
    if (ev.type === "scroll_up") {
      this.scrollTop = Math.max(0, this.scrollTop - 1);
      this.tailing = false;
      ev.handled = true;
    } else if (ev.type === "scroll_down") {
      const max = this.maxScrollTop(this.lastVisibleRows);
      this.scrollTop = Math.min(max, this.scrollTop + 1);
      this.tailing = this.scrollTop >= max;
      ev.handled = true;
    }
    if (ev.handled) (this.app ?? App.instance)?.queueRender();
  }

  public override handleKey(ev: any): void {
    super.handleKey(ev);
    if (ev.handled) return;
    const max = this.maxScrollTop(this.lastVisibleRows);
    const next = scrollTopForKey(ev.name || ev.key, this.scrollTop, max, this.lastVisibleRows);
    if (next !== null) {
      this.scrollTop = next;
      this.tailing = this.scrollTop >= max;
      ev.handled = true;
      (this.app ?? App.instance)?.queueRender();
    }
  }

  public override handleMouse(ev: MouseEvent): void {
    super.handleMouse(ev);
    if (ev.handled) return;
    if (ev.type === "release" && this.draggingScrollbar) {
      this.draggingScrollbar = false;
      ev.handled = true;
      return;
    }
    if (ev.type === "drag" && this.draggingScrollbar) {
      this.scrollToTrackY(ev.y);
      ev.handled = true;
      return;
    }
    if (ev.type === "press" && ev.button === "left") {
      const content = this.getContentRect();
      if (
        this.rowCount > this.lastVisibleRows &&
        ev.x === content.right - 1 &&
        ev.y >= content.y &&
        ev.y < content.bottom
      ) {
        this.draggingScrollbar = true;
        this.scrollToTrackY(ev.y);
        ev.handled = true;
        return;
      }
    }
    handleReadonlySelectionMouse(this, ev);
  }

  private scrollToTrackY(y: number): void {
    const trackH = this.lastVisibleRows;
    const maxScroll = this.maxScrollTop(trackH);
    if (trackH <= 1 || maxScroll <= 0) return;
    const ratio = Math.max(0, Math.min(1, (y - this.getContentRect().y) / (trackH - 1)));
    this.scrollTop = Math.round(ratio * maxScroll);
    this.tailing = this.scrollTop >= maxScroll;
    (this.app ?? App.instance)?.queueRender();
  }

  /** Plain text of every line, for cross-widget copy. */
  public selectableLines(): string[] {
    return this.term.lines.map((cells) => cells.map((c) => c.ch).join(""));
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer); // background + border

    const content = this.getContentRect();
    if (content.width <= 0 || content.height <= 0) return;

    const visibleRows = Math.max(0, Math.floor(content.height));
    this.lastVisibleRows = visibleRows;
    const needScrollbar = this.rowCount > visibleRows;
    const bodyW = needScrollbar ? Math.max(0, content.width - 1) : content.width;
    // Width drives auto-wrap of subsequent output (existing lines aren't reflowed).
    this.term.cols = this.wrap ? bodyW : 0;

    const max = this.maxScrollTop(visibleRows);
    if (this.tailing && this.autoScroll) this.scrollTop = max;
    this.scrollTop = Math.max(0, Math.min(this.scrollTop, max));

    const first = this.scrollTop;
    const last = Math.min(this.rowCount, first + visibleRows);
    const bg = this.findResolvedBackground();
    const bodyRect = new Region(new Offset(content.x, content.y), new Size(bodyW, content.height));

    buffer.pushClip(bodyRect);
    for (let i = first; i < last; i++) {
      const cells = this.term.lines[i];
      const y = content.y + (i - first);
      let x = content.x;
      for (const seg of cellsToSegments(cells)) {
        if (x >= content.x + bodyW) break;
        // Cells with no explicit background inherit the view background.
        const drawn = seg.style.background
          ? seg
          : new Segment(seg.text, seg.style.merge({ background: bg }));
        buffer.drawSegment(x, y, drawn, bodyRect);
        x += stringWidth(seg.text);
      }
      if (this.selectable) {
        const plain = cells.map((c) => c.ch).join("");
        const cols = runCols(plain).slice(0, bodyW);
        if (cols.length > 0) {
          (this.app ?? App.instance)?.selection.addRun({
            widget: this,
            line: i,
            y,
            x: content.x,
            cols,
          });
        }
      }
    }
    buffer.popClip();

    if (needScrollbar) {
      const trackH = content.height;
      const thumbH = Math.max(1, Math.round((visibleRows / this.rowCount) * trackH));
      const ratio = max > 0 ? this.scrollTop / max : 0;
      const thumbStart = content.y + Math.round(ratio * (trackH - thumbH));
      const sx = content.right - 1;
      const style = new Style({
        color: this.computedStyle.borderColor || this.computedStyle.color || "default",
        background: bg,
      });
      for (let yy = content.y; yy < content.y + trackH; yy++) {
        const isThumb = yy >= thumbStart && yy < thumbStart + thumbH;
        buffer.setCell(sx, yy, isThumb ? "█" : "░", style);
      }
    }
  }
}
