import { Offset } from "./offset.ts";
import { Size } from "./size.ts";

/** An immutable rectangle (offset + size) in cell coordinates — a widget's `region`. */
export class Region {
  constructor(
    /** Top-left corner. */
    public readonly offset: Offset,
    /** Width × height. */
    public readonly size: Size,
  ) {}

  /** An empty region at the origin. */
  public static readonly EMPTY = new Region(Offset.ORIGIN, Size.ZERO);

  /** Left edge (column). */
  public get x(): number {
    return this.offset.x;
  }
  /** Top edge (row). */
  public get y(): number {
    return this.offset.y;
  }
  /** Width in cells. */
  public get width(): number {
    return this.size.width;
  }
  /** Height in cells. */
  public get height(): number {
    return this.size.height;
  }

  /** One past the right edge (`x + width`). */
  public get right(): number {
    return this.x + this.width;
  }
  /** One past the bottom edge (`y + height`). */
  public get bottom(): number {
    return this.y + this.height;
  }

  /** True if the point lies inside this region (right/bottom edges exclusive). */
  public contains(x: number, y: number): boolean;
  public contains(offset: Offset): boolean;
  public contains(arg1: number | Offset, arg2?: number): boolean {
    if (arg1 instanceof Offset) {
      return arg1.x >= this.x && arg1.x < this.right && arg1.y >= this.y && arg1.y < this.bottom;
    }
    if (typeof arg1 === "number" && typeof arg2 === "number") {
      return arg1 >= this.x && arg1 < this.right && arg2 >= this.y && arg2 < this.bottom;
    }
    return false;
  }

  /** True if `other` lies entirely within this region. */
  public containsRegion(other: Region): boolean {
    return (
      other.x >= this.x &&
      other.right <= this.right &&
      other.y >= this.y &&
      other.bottom <= this.bottom
    );
  }

  /**
   * True when the two regions overlap. A non-allocating predicate for hot paths
   * (e.g. per-child clip culling each frame) that only need a yes/no, not the
   * intersection rectangle itself.
   */
  public overlaps(other: Region): boolean {
    return (
      Math.max(this.x, other.x) < Math.min(this.right, other.right) &&
      Math.max(this.y, other.y) < Math.min(this.bottom, other.bottom)
    );
  }

  /** The overlapping region, or `null` if they don't overlap. */
  public intersection(other: Region): Region | null {
    const x1 = Math.max(this.x, other.x);
    const y1 = Math.max(this.y, other.y);
    const x2 = Math.min(this.right, other.right);
    const y2 = Math.min(this.bottom, other.bottom);

    if (x1 < x2 && y1 < y2) {
      return new Region(new Offset(x1, y1), new Size(x2 - x1, y2 - y1));
    }
    return null;
  }

  /** True if offset and size both match. */
  public equals(other: Region): boolean {
    return this.offset.equals(other.offset) && this.size.equals(other.size);
  }

  /** A copy of this region. */
  public clone(): Region {
    return new Region(this.offset.clone(), this.size.clone());
  }

  /** `"(x,y WxH)"`. */
  public toString(): string {
    return `(${this.x},${this.y} ${this.width}x${this.height})`;
  }
}
