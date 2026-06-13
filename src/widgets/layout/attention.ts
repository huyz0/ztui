import { requestAnimationTick } from "../../anim/animation.ts";
import { motion } from "../../anim/motion.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { BoxWidget } from "./box.ts";

/** Repaint cadence for the attention pulse (~17fps — a touch livelier than focus). */
const ATTENTION_TICK_MS = 60;

/**
 * A bordered panel that *asks for attention* — its border breathes with the
 * `$attention` accent to draw the eye to a decision the user needs to make (a
 * permission prompt, a Q&A, a confirm). This is deliberately louder than the
 * ambient focus breathing and is a property of the *panel*, not of focus, so it
 * pulses whether or not anything inside it is focused.
 *
 * With motion disabled it falls back to a static `$attention` border, so the
 * panel still reads as urgent without any movement.
 */
export class AttentionWidget extends BoxWidget {
  /** Whether to pulse for attention. Off renders as an ordinary bordered box. */
  public attentive = true;

  constructor() {
    super();
    this.tagName = "attention";
    this.defaultStyle = { border: "round" };
  }

  public override render(buffer: ScreenBuffer): void {
    if (this.attentive) {
      // Resolve the (breathing, or static when motion is off) attention accent
      // afresh each frame and apply it to the border. An explicit borderColor in
      // the caller's own style still wins; otherwise the pulse drives the border.
      const explicit = this.style.borderColor !== undefined;
      if (!explicit) {
        const resolved = this.app?.cssResolver.resolveVariable(this, "$attention");
        if (resolved) this.computedStyle = { ...this.computedStyle, borderColor: resolved };
      }
      super.render(buffer);
      // Keep the pulse advancing while motion is enabled.
      if (motion.enabled) requestAnimationTick(this, ATTENTION_TICK_MS);
    } else {
      super.render(buffer);
    }
  }
}
