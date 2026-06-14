import { App } from "../../core/app.ts";
import { runCols } from "../../core/selection.ts";
import { scrollTopForKey } from "../../dom/key-nav.ts";
import { fadeScrollEdges } from "../../dom/scroll-fade.ts";
import { Widget } from "../../dom/widget.ts";
import type { MouseEvent } from "../../driver/driver.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { RichText } from "../../render/rich/text.ts";
import { Segment, splitGraphemes, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { handleReadonlySelectionMouse } from "../readonly-selection.ts";

/** One wrapped display row: the segments to draw and its plain text. */
interface DisplayLine {
  segments: Segment[];
  plain: string;
}

/** Take the longest prefix of `text` whose rendered width is `<= width`. */
function sliceToWidth(text: string, width: number): string {
  let out = "";
  let w = 0;
  for (const ch of splitGraphemes(text)) {
    const cw = stringWidth(ch);
    if (w + cw > width) break;
    out += ch;
    w += cw;
  }
  // Guarantee forward progress even for a single too-wide glyph.
  return out || splitGraphemes(text)[0] || "";
}

/** Greedy word-wrap of one already-newline-free styled line to `width`. */
function wrapOneLine(segs: Segment[], width: number): Segment[][] {
  const lines: Segment[][] = [];
  let cur: Segment[] = [];
  let curW = 0;

  // Push the current line, dropping the trailing space that caused the break
  // (standard word-wrap behavior — wrapped lines don't keep a dangling space).
  const flush = () => {
    while (cur.length && /^\s+$/.test(cur[cur.length - 1].text)) cur.pop();
    lines.push(cur);
    cur = [];
    curW = 0;
  };

  for (const seg of segs) {
    const tokens = seg.text.match(/(\s+|\S+)/g) || [];
    for (let tok of tokens) {
      const tw = stringWidth(tok);
      if (curW + tw <= width) {
        cur.push(new Segment(tok, seg.style));
        curW += tw;
        continue;
      }
      // A run of spaces that overflows just ends the line.
      if (/^\s+$/.test(tok)) {
        if (cur.length) flush();
        continue;
      }
      // A word that doesn't fit: flush the current line first.
      if (curW > 0) flush();
      // Hard-split words longer than the whole width.
      while (stringWidth(tok) > width) {
        const head = sliceToWidth(tok, width);
        lines.push([new Segment(head, seg.style)]);
        tok = tok.slice(head.length);
      }
      if (tok.length) {
        cur.push(new Segment(tok, seg.style));
        curW = stringWidth(tok);
      }
    }
  }
  // Always emit a (possibly empty) trailing line so blank entries take a row.
  flush();
  return lines;
}

/** Wrap a single markup entry into display lines, honoring `\n` and `wrap`. */
function wrapEntry(markup: string, baseStyle: Style, width: number, wrap: boolean): DisplayLine[] {
  let rich: RichText;
  try {
    rich = RichText.fromMarkup(markup);
  } catch {
    rich = new RichText(markup, []);
  }
  const segments = rich.toSegments(baseStyle);

  // Split on hard newlines first.
  const hardLines: Segment[][] = [[]];
  for (const seg of segments) {
    const parts = seg.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) hardLines.push([]);
      if (part.length) hardLines[hardLines.length - 1].push(new Segment(part, seg.style));
    });
  }

  const rows = wrap && width > 0 ? hardLines.flatMap((l) => wrapOneLine(l, width)) : hardLines;
  return rows.map((segs) => ({ segments: segs, plain: segs.map((s) => s.text).join("") }));
}

/**
 * A scrolling, append-only log panel for streaming text — agent output, tool
 * logs, reasoning traces. Each entry in {@link lines} is a markup string (the
 * same `[bold]…[/]` syntax as {@link RichTextWidget}) and may contain `\n`.
 *
 * Like {@link ListViewWidget} the body is virtualized: only the display rows in
 * the current viewport are drawn, so a long transcript stays cheap. Entries are
 * wrapped to the content width and cached per `(entry, width)`, so appending a
 * line during streaming only wraps the new entry, not the whole history.
 *
 * The view "tails" — it pins to the bottom as new lines arrive — until the user
 * scrolls up; scrolling back to the end (or pressing `end`) resumes tailing.
 */
export class RichLogWidget extends Widget {
  /** Max entries retained for layout; older entries scroll off and are dropped. */
  /** Maximum retained lines (older ones drop). */
  public maxLines = 10_000;
  /** Word-wrap entries to the content width. When false, long lines are clipped. */
  public wrap = true;
  /** Pin to the bottom as new lines arrive (until the user scrolls up). */
  public autoScroll = true;

  private entries: string[] = [];
  private scrollTop = 0;
  /** Whether the view is following the tail (auto-scrolled to the bottom). */
  private tailing = true;
  private lastVisibleRows = 0;
  private draggingScrollbar = false;

  // Wrapped-line cache: entry markup -> (wrap width -> display lines). A frame can flip
  // between the full width and the gutter-reserved width (when a scrollbar
  // appears) without re-wrapping; a couple of widths are kept per entry.
  private wrapCache = new Map<string, Map<number, DisplayLine[]>>();
  private displayWidth = -1;
  // Flattened display lines, built for the width recorded in `displayWidth`.
  private display: DisplayLine[] = [];
  private displayDirty = true;

  constructor() {
    super("richlog");
    this.focusable = true;
    this.defaultStyle = { width: "100%", height: "100%" };
  }

  /** Replace the log contents. Trims to {@link maxLines} from the end. */
  public set lines(value: string[]) {
    const next = value.length > this.maxLines ? value.slice(value.length - this.maxLines) : value;
    this.entries = next;
    this.displayDirty = true;
    App.instance?.queueRender();
  }
  /** Current log lines. */
  public get lines(): string[] {
    return this.entries;
  }

  private baseStyle(): Style {
    return new Style({
      color: this.computedStyle.color || "default",
      background: this.findResolvedBackground(),
      bold: this.computedStyle.bold,
      italic: this.computedStyle.italic,
      underline: this.computedStyle.underline,
      dim: this.computedStyle.dim,
    });
  }

  /** Build (or reuse) the flat display-line list for `width`. */
  private rebuild(width: number): void {
    const base = this.baseStyle();
    const seen = new Set<string>();
    const display: DisplayLine[] = [];
    for (const entry of this.entries) {
      seen.add(entry);
      let byWidth = this.wrapCache.get(entry);
      if (!byWidth) {
        byWidth = new Map();
        this.wrapCache.set(entry, byWidth);
      }
      let wrapped = byWidth.get(width);
      if (!wrapped) {
        wrapped = wrapEntry(entry, base, width, this.wrap);
        byWidth.set(width, wrapped);
        // Keep at most two widths per entry (full + gutter-reserved).
        if (byWidth.size > 2) {
          const oldest = byWidth.keys().next().value as number;
          if (oldest !== width) byWidth.delete(oldest);
        }
      }
      display.push(...wrapped);
    }
    // Drop cached entries no longer present so the map stays bounded.
    if (this.wrapCache.size > seen.size) {
      for (const k of this.wrapCache.keys()) if (!seen.has(k)) this.wrapCache.delete(k);
    }
    this.display = display;
    this.displayWidth = width;
    this.displayDirty = false;
  }

  /** Rebuild only if the cached display doesn't already match `width`. */
  private ensureDisplay(width: number): void {
    if (this.displayDirty || this.displayWidth !== width) this.rebuild(width);
  }

  private get rowCount(): number {
    return this.display.length;
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
    if (ev.handled) App.instance?.queueRender();
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
      App.instance?.queueRender();
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
    // Otherwise let read-only selection (drag to copy) take the event.
    handleReadonlySelectionMouse(this, ev);
  }

  private scrollToTrackY(y: number): void {
    const trackH = this.lastVisibleRows;
    const maxScroll = this.maxScrollTop(trackH);
    if (trackH <= 1 || maxScroll <= 0) return;
    const ratio = Math.max(0, Math.min(1, (y - this.getContentRect().y) / (trackH - 1)));
    this.scrollTop = Math.round(ratio * maxScroll);
    this.tailing = this.scrollTop >= maxScroll;
    App.instance?.queueRender();
  }

  /** Plain text of every display line, used by cross-widget copy. */
  public selectableLines(): string[] {
    if (this.displayDirty && this.displayWidth >= 0) this.rebuild(this.displayWidth);
    return this.display.map((l) => l.plain);
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer); // background + border

    const content = this.getContentRect();
    if (content.width <= 0 || content.height <= 0) return;

    const visibleRows = Math.max(0, Math.floor(content.height));
    this.lastVisibleRows = visibleRows;

    // Decide the body width deterministically: wrap at the full width first, and
    // only reserve a 1-col scrollbar gutter if that already overflows. Narrowing
    // can only add rows, so the overflow can't flip back off — no width thrash,
    // and text never ends up under the scrollbar.
    this.ensureDisplay(content.width);
    const needScrollbar = this.rowCount > visibleRows;
    const bodyW = needScrollbar ? Math.max(0, content.width - 1) : content.width;
    if (needScrollbar) this.ensureDisplay(bodyW);

    const max = this.maxScrollTop(visibleRows);
    if (this.tailing && this.autoScroll) this.scrollTop = max;
    this.scrollTop = Math.max(0, Math.min(this.scrollTop, max));

    const first = this.scrollTop;
    const last = Math.min(this.rowCount, first + visibleRows);
    const bg = this.findResolvedBackground();

    const bodyRect = new Region(new Offset(content.x, content.y), new Size(bodyW, content.height));
    buffer.pushClip(bodyRect);
    for (let i = first; i < last; i++) {
      const line = this.display[i];
      const y = content.y + (i - first);
      let x = content.x;
      for (const seg of line.segments) {
        buffer.drawSegment(x, y, seg, bodyRect);
        x += stringWidth(seg.text);
      }
      if (this.selectable && line.plain.length > 0) {
        const cols = runCols(line.plain).slice(0, bodyW);
        if (cols.length > 0) {
          App.instance?.selection.addRun({ widget: this, line: i, y, x: content.x, cols });
        }
      }
    }
    buffer.popClip();

    fadeScrollEdges(buffer, content, first > 0, last < this.rowCount, bg);

    this.renderScrollbar(buffer, content, visibleRows, bg);
  }

  private renderScrollbar(
    buffer: ScreenBuffer,
    content: Region,
    visibleRows: number,
    bg: string,
  ): void {
    if (this.rowCount <= visibleRows || content.height <= 0) return;
    const trackH = content.height;
    const thumbH = Math.max(1, Math.round((visibleRows / this.rowCount) * trackH));
    const maxScroll = this.maxScrollTop(visibleRows);
    const ratio = maxScroll > 0 ? this.scrollTop / maxScroll : 0;
    const thumbStart = content.y + Math.round(ratio * (trackH - thumbH));
    const x = content.right - 1;
    const style = new Style({
      color: this.computedStyle.borderColor || this.computedStyle.color || "default",
      background: bg,
    });
    for (let yy = content.y; yy < content.y + trackH; yy++) {
      const isThumb = yy >= thumbStart && yy < thumbStart + thumbH;
      buffer.setCell(x, yy, isThumb ? "█" : "░", style);
    }
  }
}
