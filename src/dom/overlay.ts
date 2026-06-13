import { Offset } from "../geometry/offset.ts";
import { parseDimension } from "../geometry/parse-dimension.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import type { RGB } from "../render/color.ts";
import { themeBlendBase } from "../theme.ts";
import { Widget } from "./widget.ts";

/** Modal scrim: a translucent black wash over the backdrop behind a dim modal. */
const SCRIM_COLOR: RGB = { r: 0, g: 0, b: 0 };
const SCRIM_ALPHA = 0.5;

/** Drop shadow cast under a floating panel, as a translucent black tint. */
const SHADOW_COLOR: RGB = { r: 0, g: 0, b: 0 };
const SHADOW_INNER = 0.4; // band adjacent to the panel edge
const SHADOW_OUTER = 0.18; // softer falloff beyond it

/**
 * Cast a soft drop shadow under `region` by tinting the cells the layer below
 * already painted, offset down-right of the panel. The panel paints opaquely on
 * top afterwards, so only the protruding L-shaped edge shows. A darker inner
 * band plus a lighter outer band gives a graduated falloff rather than a hard
 * block. The right edge is three columns to the bottom's one row because
 * terminal cells are ~2× taller than wide, keeping the shadow visually even.
 */
function drawShadow(buffer: ScreenBuffer, region: Region): void {
  if (region.width <= 0 || region.height <= 0) return;
  const base = themeBlendBase();
  const blend = (x: number, y: number, w: number, h: number, a: number) =>
    buffer.blendRegion(new Region(new Offset(x, y), new Size(w, h)), SHADOW_COLOR, a, base);
  // Right edge: one dark column hugging the panel, two lighter columns beyond.
  blend(region.right, region.y + 1, 1, region.height, SHADOW_INNER);
  blend(region.right + 1, region.y + 1, 2, region.height, SHADOW_OUTER);
  // Bottom edge: a single dark row, inset to clear the rounded corner.
  blend(region.x + 2, region.bottom, region.width, 1, SHADOW_INNER);
  // Bottom-right corner ties the two edges together with the same falloff.
  blend(region.right, region.bottom, 1, 1, SHADOW_INNER);
  blend(region.right + 1, region.bottom, 2, 1, SHADOW_OUTER);
}

/** Where a sticky panel sits relative to its anchor. */
export type OverlayPlacement = "above" | "below" | "auto";

const toOffset = (val: number | { fr: number }): number => (typeof val === "number" ? val : 0);

/**
 * The full-screen root that every layer (dialog / sticky panel) is portalled
 * into. It is added to {@link Screen.overlays}, so the app lays it out to the
 * full screen and paints it after the normal widget tree.
 *
 * The root paints nothing of its own by default (it is transparent — the layer
 * below stays visible); only its children draw. A `dim` modal optionally blanks
 * the backdrop, and `passThrough` (sticky panels) lets clicks that miss the
 * panel fall through to the layer below.
 *
 * It also owns its single panel child's position (via the app's custom-layout
 * hook): a modal panel is centered, a sticky panel is placed next to its
 * {@link anchor} (flipping above/below to fit) or at the screen offsets given by
 * its style — and in every case the result is clamped to stay fully on-screen.
 */
export class OverlayRootWidget extends Widget {
  /** Blocks key/mouse fallthrough and traps focus to this layer. */
  public modal = false;
  /** Center the (single) panel child within the screen. */
  public centered = false;
  /** Blank the backdrop behind a modal panel so the layer below reads as inert. */
  public dim = false;
  /**
   * Scrim opacity multiplier in [0,1], applied on top of the base scrim alpha.
   * Lets a `dim` modal fade its backdrop in (1 = full scrim). Default 1 so a
   * dim overlay with no animation looks exactly as before.
   */
  public dimAlpha = 1;
  /**
   * Sticky panels: clicks that miss the panel are not captured here, so the
   * app's hit-test continues to the layer below (keeping the chatbox clickable).
   */
  public passThrough = false;
  /**
   * Sticky panels: the widget the panel attaches to (e.g. the chat input). The
   * panel is laid edge-to-edge with this widget — directly above or below it —
   * instead of at fixed screen offsets. Its live `region` is read each layout,
   * so the panel tracks the anchor as the layout changes.
   */
  public anchor: Widget | null = null;
  /** Preferred side of the {@link anchor} (default `auto`: pick whichever fits). */
  public placement: OverlayPlacement = "auto";

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
   * Custom-layout hook (invoked by the app) that positions the single panel
   * child. Returns true to take over layout for this node (its subtree is still
   * laid out afterwards).
   */
  public layoutChildren(): boolean {
    const child = this.children.find((c): c is Widget => c instanceof Widget && c.visible);
    if (!child) return true;

    const screen = this.getContentRect();
    const w = Math.min(child.measuredWidth, screen.width);
    const h = Math.min(child.measuredHeight, screen.height);

    let x: number;
    let y: number;

    if (this.centered) {
      x = screen.x + Math.floor((screen.width - w) / 2);
      y = screen.y + Math.floor((screen.height - h) / 2);
    } else if (this.anchor && this.anchor.region.width > 0) {
      // Sticky panel anchored to a widget: sit flush above or below it. Use the
      // anchor's client rect (margin excluded) so the panel aligns with the
      // widget's visible box, not its margin edge — otherwise the anchor's
      // margin shows up as a gap above/below and a horizontal offset.
      const a = this.anchor.getClientRect();
      x = a.x;
      const spaceAbove = a.y - screen.y;
      const spaceBelow = screen.bottom - a.bottom;
      const placeAbove =
        this.placement === "above"
          ? true
          : this.placement === "below"
            ? false
            : // auto: prefer below, flip above only when below can't fit but above can
              spaceBelow < h && spaceAbove > spaceBelow;
      y = placeAbove ? a.y - h : a.bottom;
    } else {
      // Sticky panel at fixed screen offsets from its style (left/top/right/bottom).
      const s = child.computedStyle;
      if (s.right !== undefined) {
        x = screen.right - w - toOffset(parseDimension(s.right, screen.width, 0));
      } else {
        const left = s.left !== undefined ? toOffset(parseDimension(s.left, screen.width, 0)) : 0;
        x = screen.x + left;
      }
      if (s.bottom !== undefined) {
        y = screen.bottom - h - toOffset(parseDimension(s.bottom, screen.height, 0));
      } else {
        const top = s.top !== undefined ? toOffset(parseDimension(s.top, screen.height, 0)) : 0;
        y = screen.y + top;
      }
    }

    // Clamp so the panel is never clipped by a screen edge.
    x = Math.max(screen.x, Math.min(x, screen.right - w));
    y = Math.max(screen.y, Math.min(y, screen.bottom - h));

    child.region = new Region(new Offset(x, y), new Size(w, h));
    return true;
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    if (this.dim && this.dimAlpha > 0) {
      // Shade the backdrop in place: the layer below is already painted, so we
      // alpha-composite a translucent black scrim over each existing cell,
      // darkening glyph and background toward concrete colours (a proper dim,
      // not the terminal-dependent SGR-dim attribute). The panel itself paints
      // afterwards in renderChildren and is left undimmed. `dimAlpha` scales the
      // wash so a modal can fade its backdrop in.
      const a = SCRIM_ALPHA * Math.min(1, this.dimAlpha);
      buffer.blendRegion(this.region, SCRIM_COLOR, a, themeBlendBase());
    }
    // A soft drop shadow under each floating panel lifts it off the layer below.
    // Drawn before the panels paint, so they cover all but the protruding edge.
    for (const child of this.children) {
      if (child instanceof Widget && child.visible) drawShadow(buffer, child.region);
    }
    // Transparent everywhere else: only the children paint, so the layer below
    // stays visible around the panel.
    this.renderChildren(buffer);
  }
}
