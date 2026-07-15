import {
  HTML_CELL_HEIGHT,
  HTML_FONT_FAMILY,
  HTML_FONT_SIZE,
  HTML_LINE_HEIGHT,
  HTML_PADDING,
} from "../../render/html-renderer.ts";
import type { KeyEvent, MouseEvent as ZtuiMouseEvent } from "../driver.ts";
import type { WebDriver } from "./index.ts";

/**
 * Browser DOM binding for {@link WebDriver}: paints each presented frame as
 * HTML into a host element and forwards its keyboard/mouse events back through
 * the driver. The translators below are pure so they can be unit-tested
 * outside a browser; only {@link attachToDOM} touches the DOM.
 */

const DOM_KEY_NAMES: Record<string, string> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "enter",
  Escape: "escape",
  Backspace: "backspace",
  Delete: "delete",
  Insert: "insert",
  Tab: "tab",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
};

/**
 * Map a DOM `KeyboardEvent`-shaped object to a ztui {@link KeyEvent}, matching
 * the terminal parser's naming (e.g. "pagedown", "enter"; a plain space stays
 * the literal character so text input keeps working). Returns null for keys
 * with no terminal equivalent (F-keys, bare modifier presses, etc.).
 */
export function translateKeyboardEvent(ev: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): KeyEvent | null {
  const ctrl = !!ev.ctrlKey;
  const meta = !!ev.metaKey || !!ev.altKey;
  const shift = !!ev.shiftKey;
  const named = DOM_KEY_NAMES[ev.key];
  if (named) return { key: named, name: named, ctrl, meta, shift };
  // Single-char and space keys get a full modifier prefix (ctrl+/meta+/shift+,
  // in that order) so Cmd+Z (meta+z), Ctrl+Shift+Z, etc. are distinguishable —
  // previously only `ctrl` was ever embedded here, so e.g. Cmd+Z produced the
  // same `key` as a bare "z" and Alt+Space produced the same `key` as a bare
  // space. Only built when ctrl/meta is held: a bare Shift+letter must stay
  // the browser's own shifted char (e.g. "A"), not "shift+a", or typing
  // capitals would break.
  const prefix =
    ctrl || meta ? `${ctrl ? "ctrl+" : ""}${meta ? "meta+" : ""}${shift ? "shift+" : ""}` : "";
  if (ev.key === " ") {
    const name = ctrl || meta ? "space" : " ";
    return { key: prefix ? `${prefix}space` : " ", name, ctrl, meta, shift };
  }
  // Printable character (single code point; surrogate pairs are length 2).
  if ([...ev.key].length === 1) {
    const char = ev.key;
    const key = prefix ? `${prefix}${char.toLowerCase()}` : char;
    return { key, name: prefix ? char.toLowerCase() : char, ctrl, meta, shift };
  }
  return null;
}

/** Pixel size of a cell (plus host padding), used to map mouse pixels to cells. */
export interface CellMetrics {
  /** Cell width in px. */
  cellWidth: number;
  /** Cell height in px. */
  cellHeight: number;
  /** Host left padding in px, subtracted before the cell division. */
  offsetX?: number;
  /** Host top padding in px, subtracted before the cell division. */
  offsetY?: number;
}

/**
 * Map a DOM mouse event (pixel coordinates relative to the host element) to a
 * ztui {@link MouseEvent} in cell units. `bounds`, when given (the driver's
 * current column/row count), clamps the result to a valid cell — a host
 * element with padding/border wider than an exact multiple of the cell size
 * would otherwise report coordinates past the last visible column/row that
 * widgets don't expect.
 */
export function translateMouseEvent(
  ev: { offsetX: number; offsetY: number; button?: number; buttons?: number },
  type: ZtuiMouseEvent["type"],
  metrics: CellMetrics,
  bounds?: { cols: number; rows: number },
): ZtuiMouseEvent {
  let x = Math.floor((ev.offsetX - (metrics.offsetX ?? 0)) / metrics.cellWidth);
  let y = Math.floor((ev.offsetY - (metrics.offsetY ?? 0)) / metrics.cellHeight);
  x = Math.max(0, x);
  y = Math.max(0, y);
  if (bounds) {
    x = Math.min(x, Math.max(0, bounds.cols - 1));
    y = Math.min(y, Math.max(0, bounds.rows - 1));
  }
  let button: ZtuiMouseEvent["button"];
  if (type === "move" || type === "scroll_up" || type === "scroll_down") {
    button = "none";
  } else if (type === "drag" && ev.buttons) {
    // `mousemove`'s `event.button` is always 0 regardless of which button is
    // actually held — only the `buttons` bitmask reflects it during a drag.
    button = ev.buttons & 2 ? "right" : ev.buttons & 4 ? "middle" : "left";
  } else {
    button = ev.button === 2 ? "right" : ev.button === 1 ? "middle" : "left";
  }
  return { x, y, type, button };
}

/**
 * Measure one cell's pixel size by laying out a probe glyph with the exact font
 * styling {@link renderBufferToHTML} emits, so pixel→cell mapping and grid
 * sizing stay in lock-step with the rendered output. Browser-only.
 */
export function measureCell(): CellMetrics {
  const probe = document.createElement("span");
  probe.style.cssText = `font-family: ${HTML_FONT_FAMILY}; font-size: ${HTML_FONT_SIZE}px; line-height: ${HTML_LINE_HEIGHT}; position: absolute; visibility: hidden; white-space: pre;`;
  probe.textContent = "M".repeat(10); // average out sub-pixel advance over many glyphs
  document.body.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return {
    cellWidth: rect.width / 10 || 8,
    cellHeight: rect.height || HTML_CELL_HEIGHT,
    offsetX: HTML_PADDING,
    offsetY: HTML_PADDING,
  };
}

/** Options for {@link attachToDOM}. */
export interface AttachOptions {
  /** Fixed cell pixel size; measured from a probe glyph when omitted. */
  metrics?: CellMetrics;
}

const ATTACHED_HOSTS = new WeakSet<HTMLElement>();

/**
 * Wire a {@link WebDriver} to a DOM element: frames render as HTML inside it,
 * and its keyboard/mouse/paste events drive the app. Returns a detach
 * function. Browser-only — requires `document`.
 *
 * Throws if called twice on the same host without detaching first — a second
 * attach would register a duplicate listener set (split-brain input dispatch)
 * and silently clobber the first driver's `onFrame`.
 */
export function attachToDOM(
  driver: WebDriver,
  host: HTMLElement,
  opts: AttachOptions = {},
): () => void {
  if (ATTACHED_HOSTS.has(host)) {
    throw new Error("attachToDOM: this host element is already attached to a driver");
  }
  ATTACHED_HOSTS.add(host);
  host.tabIndex = host.tabIndex >= 0 ? host.tabIndex : 0; // make focusable for key events

  let metrics = opts.metrics ?? null;
  const measure = (): CellMetrics => {
    if (metrics) return metrics;
    metrics = measureCell();
    return metrics;
  };

  driver.onFrame = () => {
    host.innerHTML = driver.toHTML();
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    const key = translateKeyboardEvent(ev);
    if (!key) return;
    ev.preventDefault();
    driver.dispatchKey(key);
  };
  const bounds = () => {
    const size = driver.getSize();
    return { cols: size.width, rows: size.height };
  };
  const mouse = (type: ZtuiMouseEvent["type"]) => (ev: MouseEvent) => {
    driver.dispatchMouse(translateMouseEvent(ev, type, measure(), bounds()));
  };
  const onMouseDown = mouse("press");
  const onMouseUp = mouse("release");
  const onMouseMove = (ev: MouseEvent) => {
    mouse(ev.buttons ? "drag" : "move")(ev);
  };
  const onWheel = (ev: WheelEvent) => {
    // A trackpad horizontal swipe (or shift+wheel) reports deltaX with
    // deltaY at/near zero. ZtuiMouseEvent has no horizontal-scroll type, so
    // treating that as vertical (the old `deltaY < 0 ? up : down` fallback
    // always picked "scroll_down" here) turned a pure horizontal gesture
    // into a bogus downward scroll — drop it instead, mirroring the bun
    // driver's SGR-mouse horizontal-tilt handling.
    if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
      ev.preventDefault();
      return;
    }
    driver.dispatchMouse(
      translateMouseEvent(ev, ev.deltaY < 0 ? "scroll_up" : "scroll_down", measure(), bounds()),
    );
    ev.preventDefault();
  };
  const onPaste = (ev: ClipboardEvent) => {
    const text = ev.clipboardData?.getData("text");
    if (text) {
      driver.dispatchPaste(text);
      ev.preventDefault();
    }
  };

  host.addEventListener("keydown", onKeyDown);
  host.addEventListener("mousedown", onMouseDown);
  host.addEventListener("mouseup", onMouseUp);
  host.addEventListener("mousemove", onMouseMove);
  host.addEventListener("wheel", onWheel, { passive: false });
  host.addEventListener("paste", onPaste);

  return () => {
    ATTACHED_HOSTS.delete(host);
    driver.onFrame = undefined;
    host.removeEventListener("keydown", onKeyDown);
    host.removeEventListener("mousedown", onMouseDown);
    host.removeEventListener("mouseup", onMouseUp);
    host.removeEventListener("mousemove", onMouseMove);
    host.removeEventListener("wheel", onWheel);
    host.removeEventListener("paste", onPaste);
  };
}
