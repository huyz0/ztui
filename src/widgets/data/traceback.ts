import { readFileSync } from "node:fs";
import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Syntax } from "../../render/rich/syntax.ts";
import { RichText } from "../../render/rich/text.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { maxRowScrollTop, trackYToScrollTop, wheelScrollTop } from "./row-scroll.ts";

/** One parsed stack frame. */
interface Frame {
  fn: string;
  file: string;
  line: number;
  col: number;
  /** node:/node_modules frame — rendered dimmed and never source-expanded. */
  library: boolean;
}

/** A built display row: segments to draw plus its plain text. */
interface DisplayRow {
  segments: Segment[];
  plain: string;
}

const FRAME_RE = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/;

/** Parse a V8-style `error.stack` into frames (the message line is skipped). */
function parseStack(stack: string): Frame[] {
  const frames: Frame[] = [];
  for (const raw of stack.split("\n")) {
    const m = FRAME_RE.exec(raw);
    if (!m) continue;
    const file = m[2].replace(/^file:\/\//, "");
    frames.push({
      fn: m[1] || "<anonymous>",
      file,
      line: Number(m[3]),
      col: Number(m[4]),
      // Test the stripped path, not the raw capture: an ESM stack frame's
      // "file://" scheme (a completely ordinary local path) would otherwise
      // match the generic "^\w+:\/\//" remote-scheme check below and
      // misclassify every application frame as a library frame.
      library: /node_modules|^node:|^\w+:\/\//.test(file),
    });
  }
  return frames;
}

const EXT_LANG: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  json: "json",
  py: "python",
  go: "go",
  rs: "rust",
};

/**
 * A rich exception / stack-trace renderer — the readable error panel an agent
 * shows when a tool or model call throws. The error `name: message` heads the
 * panel, followed by each stack frame (`function` + `file:line:col`), with
 * library frames (`node:`/`node_modules`) dimmed. The topmost in-app frame is
 * expanded with a few lines of syntax-highlighted source and a caret under the
 * failing column, the way Rich's traceback does.
 *
 * Pass an `Error` via the {@link TracebackWidget.error} accessor, or set
 * `name` / `message` / `stack` directly. The body scrolls when it overflows.
 */
export class TracebackWidget extends Widget {
  /** Error class/name (e.g. "TypeError"). */
  public name = "Error";
  /** Error message. */
  public message = "";
  /** Raw stack trace text. */
  public stack = "";
  /** Read and show source context for the topmost in-app frame. */
  public showSource = true;
  /** Lines of context shown on each side of the failing line. */
  public contextLines = 2;

  private scrollTop = 0;
  private lastVisibleRows = 0;
  private draggingScrollbar = false;

  private display: DisplayRow[] = [];
  private modelKey = "";

  constructor() {
    super("traceback");
    this.focusable = true;
    this.defaultStyle = { width: "100%" };
  }

  /** Convenience setter: pull name/message/stack out of an Error. */
  public set error(err: Error | undefined) {
    this.name = err?.name ?? "Error";
    this.message = err?.message ?? "";
    this.stack = err?.stack ?? "";
  }

  private resolver() {
    return (this.app ?? App.instance)?.cssResolver;
  }

  private styled(text: string, color: string, extra?: Partial<Style>): Segment {
    return new Segment(
      text,
      new Style({ color, background: this.findResolvedBackground(), ...extra }),
    );
  }

  /** Source lines for a frame, syntax-highlighted, or null if unreadable. */
  private sourceRows(frame: Frame): DisplayRow[] | null {
    let text: string;
    try {
      text = readFileSync(frame.file, "utf8");
    } catch {
      return null;
    }
    const lines = text.split(/\r?\n/);
    if (frame.line < 1 || frame.line > lines.length) return null;

    const ext = frame.file.split(".").pop()?.toLowerCase() ?? "";
    const lang = EXT_LANG[ext] ?? "text";
    const from = Math.max(1, frame.line - this.contextLines);
    const to = Math.min(lines.length, frame.line + this.contextLines);
    const gutterW = String(to).length;
    const base = new Style({ background: this.findResolvedBackground() });

    const rows: DisplayRow[] = [];
    for (let ln = from; ln <= to; ln++) {
      const isErr = ln === frame.line;
      const marker = isErr ? "❯ " : "  ";
      const gutter = `    ${marker}${String(ln).padStart(gutterW)} `;
      const segs: Segment[] = [
        this.styled(gutter, isErr ? "$diff-removed" : "$gutter", { dim: !isErr }),
      ];
      let highlighted: RichText;
      try {
        highlighted = Syntax.highlight(lines[ln - 1], lang, this.theme || "theme");
      } catch {
        highlighted = new RichText(lines[ln - 1], []);
      }
      segs.push(...highlighted.toSegments(base));
      rows.push({ segments: segs, plain: gutter + lines[ln - 1] });

      if (isErr) {
        const caret = `${" ".repeat(stringWidth(gutter) + Math.max(0, frame.col - 1))}^`;
        rows.push({ segments: [this.styled(caret, "$diff-removed")], plain: caret });
      }
    }
    return rows;
  }

  private rebuild(): void {
    const key = `${this.name}\u0000${this.message}\u0000${this.stack}\u0000${this.showSource}\u0000${this.contextLines}`;
    if (key === this.modelKey) return;
    this.modelKey = key;

    const frames = parseStack(this.stack);
    const rows: DisplayRow[] = [];

    // Header: "Name: message".
    const head = this.message ? `${this.name}: ${this.message}` : this.name;
    rows.push({ segments: [this.styled(head, "$error", { bold: true })], plain: head });
    rows.push({ segments: [], plain: "" });

    const topAppIdx = frames.findIndex((f) => !f.library);
    frames.forEach((frame, i) => {
      const loc = `${frame.file}:${frame.line}:${frame.col}`;
      const fnColor = frame.library ? "$gutter" : "$accent";
      const segs: Segment[] = [
        this.styled("  at ", "$gutter", { dim: true }),
        this.styled(frame.fn, fnColor, { dim: frame.library }),
        this.styled("  ", "$gutter"),
        this.styled(loc, "$gutter", { dim: true }),
      ];
      rows.push({ segments: segs, plain: `  at ${frame.fn}  ${loc}` });

      if (this.showSource && i === topAppIdx) {
        const src = this.sourceRows(frame);
        if (src) {
          rows.push({ segments: [], plain: "" });
          rows.push(...src);
          rows.push({ segments: [], plain: "" });
        }
      }
    });

    this.display = rows;
  }

  public selectableLines(): string[] {
    this.rebuild();
    return this.display.map((r) => r.plain);
  }

  public override measure(maxW: number, maxH: number): void {
    this.rebuild();
    const wVal = parseDimension(this.computedStyle.width, maxW, -1);
    if (wVal === -1 || (typeof wVal === "object" && "fr" in wVal)) {
      let w = 0;
      for (const r of this.display) {
        const rw = r.segments.reduce((s, x) => s + stringWidth(x.text), 0);
        if (rw > w) w = rw;
      }
      this.measuredWidth = w + this.borderSize.width + this.padding.width;
    } else {
      this.measuredWidth = wVal as number;
    }

    const hVal = parseDimension(this.computedStyle.height, maxH, -1);
    if (hVal === -1 || (typeof hVal === "object" && "fr" in hVal)) {
      this.measuredHeight = this.display.length + this.borderSize.height + this.padding.height;
    } else {
      this.measuredHeight = hVal as number;
    }
  }

  private maxScrollTop(visibleRows: number): number {
    return maxRowScrollTop(this.display.length, visibleRows);
  }

  public override handleScroll(ev: any): void {
    super.handleScroll(ev);
    if (ev.handled) return;
    const next = wheelScrollTop(ev.type, this.scrollTop, this.maxScrollTop(this.lastVisibleRows));
    if (next !== null) {
      this.scrollTop = next;
      ev.handled = true;
      (this.app ?? App.instance)?.queueRender();
    }
  }

  public override handleKey(ev: any): void {
    super.handleKey(ev);
    if (ev.handled) return;
    const name = ev.name || ev.key;
    const page = Math.max(1, this.lastVisibleRows - 1);
    const max = this.maxScrollTop(this.lastVisibleRows);
    let handled = true;
    switch (name) {
      case "up":
        this.scrollTop = Math.max(0, this.scrollTop - 1);
        break;
      case "down":
        this.scrollTop = Math.min(max, this.scrollTop + 1);
        break;
      case "pageup":
        this.scrollTop = Math.max(0, this.scrollTop - page);
        break;
      case "pagedown":
        this.scrollTop = Math.min(max, this.scrollTop + page);
        break;
      case "home":
        this.scrollTop = 0;
        break;
      case "end":
        this.scrollTop = max;
        break;
      default:
        handled = false;
    }
    if (handled) {
      ev.handled = true;
      (this.app ?? App.instance)?.queueRender();
    }
  }

  public override handleMouse(ev: any): void {
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
        this.display.length > this.lastVisibleRows &&
        ev.x === content.right - 1 &&
        ev.y >= content.y &&
        ev.y < content.bottom
      ) {
        this.draggingScrollbar = true;
        this.scrollToTrackY(ev.y);
        ev.handled = true;
      }
    }
  }

  private scrollToTrackY(y: number): void {
    const v = this.lastVisibleRows;
    const next = trackYToScrollTop(y, this.getContentRect().y, v, this.maxScrollTop(v));
    if (next === null) return;
    this.scrollTop = next;
    (this.app ?? App.instance)?.queueRender();
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer);
    this.rebuild();
    const content = this.getContentRect();
    if (content.width <= 0 || content.height <= 0) return;

    const visibleRows = Math.max(0, Math.floor(content.height));
    this.lastVisibleRows = visibleRows;
    const needScrollbar = this.display.length > visibleRows;
    const bodyW = needScrollbar ? Math.max(0, content.width - 1) : content.width;
    const max = this.maxScrollTop(visibleRows);
    this.scrollTop = Math.max(0, Math.min(this.scrollTop, max));

    const resolver = this.resolver();
    const resolve = (c?: string) =>
      c?.startsWith("$") && resolver ? resolver.resolveVariable(this, c) || c : c;

    const first = this.scrollTop;
    const lastRow = Math.min(this.display.length, first + visibleRows);
    for (let i = first; i < lastRow; i++) {
      const row = this.display[i];
      const y = content.y + (i - first);
      let x = content.x;
      for (const seg of row.segments) {
        if (x >= content.x + bodyW) break;
        const drawn = new Segment(
          seg.text,
          seg.style.merge({
            color: resolve(seg.style.color),
            background: resolve(seg.style.background),
          }),
        );
        buffer.drawSegment(x, y, drawn, content);
        x += stringWidth(seg.text);
      }
    }

    if (needScrollbar) {
      const trackH = visibleRows;
      const thumbH = Math.max(1, Math.round((visibleRows / this.display.length) * trackH));
      const ratio = max > 0 ? this.scrollTop / max : 0;
      const thumbStart = content.y + Math.round(ratio * (trackH - thumbH));
      const sx = content.right - 1;
      const style = new Style({
        color: this.computedStyle.borderColor || this.computedStyle.color || "default",
        background: this.findResolvedBackground(),
      });
      for (let yy = content.y; yy < content.y + trackH; yy++) {
        const isThumb = yy >= thumbStart && yy < thumbStart + thumbH;
        buffer.setCell(sx, yy, isThumb ? "█" : "░", style);
      }
    }
  }
}
