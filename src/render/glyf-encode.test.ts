import { describe, expect, it } from "vitest";
import { encodeSimpleGlyf, type GlyfContour } from "./glyf-encode.ts";

/**
 * Minimal, independent `glyf` simple-glyph decoder — deliberately not sharing
 * code with the encoder, so a round-trip proves the bytes are spec-shaped
 * rather than just symmetric with our own bug.
 */
function decodeSimpleGlyf(buf: Buffer): { contours: GlyfContour[]; bbox: number[] } {
  let o = 0;
  const i16 = () => {
    const v = buf.readInt16BE(o);
    o += 2;
    return v;
  };
  const u16 = () => {
    const v = buf.readUInt16BE(o);
    o += 2;
    return v;
  };
  const u8 = () => buf.readUInt8(o++);

  const numContours = i16();
  const bbox = [i16(), i16(), i16(), i16()];
  const endPts: number[] = [];
  for (let i = 0; i < numContours; i++) endPts.push(u16());
  const numPoints = endPts[endPts.length - 1] + 1;
  const instrLen = u16();
  o += instrLen;

  const flags: number[] = [];
  while (flags.length < numPoints) {
    const f = u8();
    flags.push(f);
    if (f & 0x08) {
      const rep = u8();
      for (let r = 0; r < rep; r++) flags.push(f);
    }
  }

  const readCoords = (shortBit: number, sameBit: number): number[] => {
    const out: number[] = [];
    let v = 0;
    for (const f of flags) {
      if (f & shortBit) {
        const d = u8();
        v += f & sameBit ? d : -d;
      } else if (!(f & sameBit)) {
        v += i16();
      }
      out.push(v);
    }
    return out;
  };
  const xs = readCoords(0x02, 0x10);
  const ys = readCoords(0x04, 0x20);

  const contours: GlyfContour[] = [];
  let start = 0;
  for (const end of endPts) {
    const c: GlyfContour = [];
    for (let i = start; i <= end; i++) {
      c.push({ x: xs[i], y: ys[i], onCurve: !!(flags[i] & 0x01) });
    }
    contours.push(c);
    start = end + 1;
  }
  return { contours, bbox };
}

describe("encodeSimpleGlyf", () => {
  it("returns null for empty input", () => {
    expect(encodeSimpleGlyf([])).toBeNull();
    expect(encodeSimpleGlyf([[]])).toBeNull();
  });

  it("round-trips a single triangle contour", () => {
    const tri: GlyfContour = [
      { x: 0, y: 0, onCurve: true },
      { x: 500, y: 1000, onCurve: true },
      { x: 1000, y: 0, onCurve: true },
    ];
    const buf = encodeSimpleGlyf([tri])!;
    expect(buf).not.toBeNull();
    const { contours, bbox } = decodeSimpleGlyf(buf);
    expect(bbox).toEqual([0, 0, 1000, 1000]);
    expect(contours).toEqual([tri]);
  });

  it("round-trips multiple contours with on/off-curve points and large deltas", () => {
    const outer: GlyfContour = [
      { x: -300, y: -300, onCurve: true },
      { x: 700, y: -300, onCurve: false },
      { x: 700, y: 700, onCurve: true },
      { x: -300, y: 700, onCurve: false },
    ];
    const inner: GlyfContour = [
      { x: 100, y: 100, onCurve: true },
      { x: 200, y: 100, onCurve: true },
      { x: 150, y: 250, onCurve: false },
    ];
    const buf = encodeSimpleGlyf([outer, inner])!;
    const { contours, bbox } = decodeSimpleGlyf(buf);
    expect(bbox).toEqual([-300, -300, 700, 700]);
    expect(contours).toEqual([outer, inner]);
  });

  it("compresses repeated flags (all on-curve, same-delta) and still round-trips", () => {
    const square: GlyfContour = [
      { x: 0, y: 0, onCurve: true },
      { x: 0, y: 100, onCurve: true },
      { x: 0, y: 200, onCurve: true },
      { x: 0, y: 300, onCurve: true },
    ];
    const buf = encodeSimpleGlyf([square])!;
    const { contours } = decodeSimpleGlyf(buf);
    expect(contours).toEqual([square]);
  });
});
