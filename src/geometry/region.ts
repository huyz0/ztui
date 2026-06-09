import { Offset } from "./offset.ts";
import { Size } from "./size.ts";

export class Region {
  constructor(
    public readonly offset: Offset,
    public readonly size: Size,
  ) {}

  public static readonly EMPTY = new Region(Offset.ORIGIN, Size.ZERO);

  public get x(): number {
    return this.offset.x;
  }
  public get y(): number {
    return this.offset.y;
  }
  public get width(): number {
    return this.size.width;
  }
  public get height(): number {
    return this.size.height;
  }

  public get right(): number {
    return this.x + this.width;
  }
  public get bottom(): number {
    return this.y + this.height;
  }

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

  public containsRegion(other: Region): boolean {
    return (
      other.x >= this.x &&
      other.right <= this.right &&
      other.y >= this.y &&
      other.bottom <= this.bottom
    );
  }

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

  public equals(other: Region): boolean {
    return this.offset.equals(other.offset) && this.size.equals(other.size);
  }

  public clone(): Region {
    return new Region(this.offset.clone(), this.size.clone());
  }

  public toString(): string {
    return `(${this.x},${this.y} ${this.width}x${this.height})`;
  }
}
