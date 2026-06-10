import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";
import { Widget } from "./widget.ts";

/**
 * The full-screen root that every layer (dialog / sticky panel) is portalled
 * into. It is added to {@link Screen.overlays}, so the app lays it out to the
 * full screen and paints it after the normal widget tree.
 *
 * The root paints nothing of its own by default (it is transparent — the layer
 * below stays visible); only its children draw. A `dim` modal optionally blanks
 * the backdrop, and `passThrough` (sticky panels) lets clicks that miss the
 * panel fall through to the layer below.
 */
export class OverlayRootWidget extends Widget {
  /** Blocks key/mouse fallthrough and traps focus to this layer. */
  public modal = false;
  /** Center the (single) panel child within the screen. */
  public centered = false;
  /** Blank the backdrop behind a modal panel so the layer below reads as inert. */
  public dim = false;
  /**
   * Sticky panels: clicks that miss the panel are not captured here, so the
   * app's hit-test continues to the layer below (keeping the chatbox clickable).
   */
  public passThrough = false;

  constructor() {
    super("overlay-root");
    this.style = {
      position: "absolute",
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
      zIndex: 1000,
    };
  }

  /**
   * Custom-layout hook (invoked by the app). When centered, position the single
   * panel child in the middle of the screen using its measured size. Otherwise
   * return false so the panel is positioned by ordinary absolute layout (a
   * sticky panel anchors itself via `position: absolute` + `left`/`top`/…).
   */
  public layoutChildren(): boolean {
    if (!this.centered) return false;
    const rect = this.getContentRect();
    for (const child of this.children) {
      if (child instanceof Widget && child.visible) {
        const w = Math.min(child.measuredWidth, rect.width);
        const h = Math.min(child.measuredHeight, rect.height);
        const x = rect.x + Math.max(0, Math.floor((rect.width - w) / 2));
        const y = rect.y + Math.max(0, Math.floor((rect.height - h) / 2));
        child.region = new Region(new Offset(x, y), new Size(w, h));
      }
    }
    return true;
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    if (this.dim) {
      const style = new Style({ color: "default", background: "default", dim: true });
      const r = this.region;
      for (let y = r.y; y < r.bottom; y++) {
        for (let x = r.x; x < r.right; x++) {
          buffer.setCell(x, y, " ", style);
        }
      }
    }
    // Transparent everywhere else: only the children paint, so the layer below
    // stays visible around the panel.
    this.renderChildren(buffer);
  }
}
