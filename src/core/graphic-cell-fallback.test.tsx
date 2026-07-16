import { describe, expect, test, vi } from "vitest";
import { Widget } from "../dom/widget.ts";
import { type ComponentProps, hostComponent } from "../react.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { mountApp } from "../test/harness.tsx";

/**
 * `GraphicMetadata.pixelWidth`/`pixelHeight` are optional (a vector/`svg`
 * graphic can omit the rasterized-pixel fields entirely — see
 * `render/cell.ts`), but a widget can still attach a `pixelBuffer` without
 * them. `App`'s diff phase must not crash or forward `undefined` to the
 * driver in that case; it falls back to `0`.
 */
class RawGraphicWidget extends Widget {
  constructor() {
    super("raw-graphic");
  }
  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const client = this.getClientRect();
    buffer.cells[client.y][client.x] = {
      char: " ",
      style: buffer.cells[client.y][client.x].style,
      wideContinuation: false,
      graphic: {
        type: "image",
        pixelBuffer: new Uint8Array([255, 0, 0, 255]),
        // pixelWidth/pixelHeight intentionally omitted.
        cellWidth: 1,
        cellHeight: 1,
      },
    };
    buffer.noteGraphic(client.x, client.y);
  }
}

const RawGraphic = hostComponent<ComponentProps>("ztui-raw-graphic", () => new RawGraphicWidget());

describe("App diff phase: graphic cell missing pixelWidth/pixelHeight", () => {
  test("falls back to 0 instead of forwarding undefined to the driver", async () => {
    const t = await mountApp(<RawGraphic style={{ width: 3, height: 1 }} />, {
      cols: 10,
      rows: 3,
    });
    // mountApp already settles once internally, and by now the graphic cell
    // matches prevBuffer — an unchanged diff never re-emits it. Spy, then
    // force a full re-diff (refresh() invalidates the retained frame) so the
    // graphic cell is actually re-encoded and passed through getImageSequence.
    const spy = vi.spyOn(t.app.driver, "getImageSequence");
    t.app.refresh("test:force-reencode");
    await t.settle();

    expect(spy).toHaveBeenCalled();
    const [, pixelWidthArg, pixelHeightArg] = spy.mock.calls[0];
    expect(pixelWidthArg).toBe(0);
    expect(pixelHeightArg).toBe(0);
    spy.mockRestore();
  });
});
