/**
 * Encodes glyph contours into an OpenType `glyf` *simple-glyph* record — the
 * wire payload format of the terminal Glyph Protocol (`fmt=glyf`).
 *
 * Spec: rapha.land Glyph Protocol §8 (a strict subset of the OpenType `glyf`
 * table — simple glyphs only, `instructionLength = 0`, no composites, no
 * hinting). Coordinates are font units in a Y-up space with the baseline at
 * `y = 0`, exactly as TrueType authors them — which is what opentype.js hands
 * back via `glyph.points`, so Seti icons round-trip without any conversion.
 *
 * Layout produced (big-endian, per OpenType):
 *   int16   numberOfContours        (> 0; composites are not emitted here)
 *   int16   xMin, yMin, xMax, yMax
 *   uint16  endPtsOfContours[numberOfContours]
 *   uint16  instructionLength       (always 0)
 *   uint8   flags[]                  (with REPEAT compression)
 *   uint8|int16 xCoordinates[]       (delta-encoded)
 *   uint8|int16 yCoordinates[]       (delta-encoded)
 */

export interface GlyfPoint {
  x: number;
  y: number;
  onCurve: boolean;
}

/** One closed contour: an ordered list of on/off-curve points in font units. */
export type GlyfContour = GlyfPoint[];

// Simple-glyph flag bits (OpenType `glyf`).
const ON_CURVE = 0x01;
const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const REPEAT = 0x08;
const X_SAME_OR_POS = 0x10; // when X_SHORT: positive sign; else: x delta is 0
const Y_SAME_OR_POS = 0x20; // when Y_SHORT: positive sign; else: y delta is 0

class ByteWriter {
  private bytes: number[] = [];
  u8(v: number): void {
    this.bytes.push(v & 0xff);
  }
  i16(v: number): void {
    this.bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  u16(v: number): void {
    this.i16(v);
  }
  raw(b: number[]): void {
    for (const v of b) this.bytes.push(v & 0xff);
  }
  toBuffer(): Buffer {
    return Buffer.from(this.bytes);
  }
}

/**
 * Encode contours into a `glyf` simple-glyph record. Coordinates are rounded to
 * integers (TrueType is integer-only). Returns the raw bytes; base64 it for the
 * Glyph Protocol payload. Returns `null` when there are no contours/points.
 */
export function encodeSimpleGlyf(contours: GlyfContour[]): Buffer | null {
  const nonEmpty = contours.filter((c) => c.length > 0);
  if (nonEmpty.length === 0) return null;

  // Flatten points and contour end indices.
  const pts: GlyfPoint[] = [];
  const endPts: number[] = [];
  for (const c of nonEmpty) {
    for (const p of c) pts.push({ x: Math.round(p.x), y: Math.round(p.y), onCurve: p.onCurve });
    endPts.push(pts.length - 1);
  }

  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const p of pts) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }

  // Delta-encode coordinates and derive each point's flag.
  const rawFlags: number[] = [];
  const xData: number[] = [];
  const yData: number[] = [];
  let prevX = 0;
  let prevY = 0;
  for (const p of pts) {
    let flag = p.onCurve ? ON_CURVE : 0;

    const dx = p.x - prevX;
    if (dx === 0) {
      flag |= X_SAME_OR_POS; // x unchanged: no bytes emitted
    } else if (dx >= -255 && dx <= 255) {
      flag |= X_SHORT;
      if (dx > 0) flag |= X_SAME_OR_POS;
      xData.push(Math.abs(dx));
    } else {
      xData.push((dx >> 8) & 0xff, dx & 0xff);
    }
    prevX = p.x;

    const dy = p.y - prevY;
    if (dy === 0) {
      flag |= Y_SAME_OR_POS;
    } else if (dy >= -255 && dy <= 255) {
      flag |= Y_SHORT;
      if (dy > 0) flag |= Y_SAME_OR_POS;
      yData.push(Math.abs(dy));
    } else {
      yData.push((dy >> 8) & 0xff, dy & 0xff);
    }
    prevY = p.y;

    rawFlags.push(flag);
  }

  // Run-length compress repeated flags via the REPEAT bit.
  const flagBytes: number[] = [];
  for (let i = 0; i < rawFlags.length; ) {
    const f = rawFlags[i];
    let run = 1;
    while (i + run < rawFlags.length && rawFlags[i + run] === f && run < 256) run++;
    if (run >= 2) {
      flagBytes.push(f | REPEAT, run - 1);
    } else {
      flagBytes.push(f);
    }
    i += run;
  }

  const w = new ByteWriter();
  w.i16(nonEmpty.length);
  w.i16(xMin);
  w.i16(yMin);
  w.i16(xMax);
  w.i16(yMax);
  for (const e of endPts) w.u16(e);
  w.u16(0); // instructionLength
  w.raw(flagBytes);
  w.raw(xData);
  w.raw(yData);
  return w.toBuffer();
}
