/** An immutable (x, y) point in cell coordinates. */
export class Offset {
  constructor(
    /** Column. */
    public readonly x: number,
    /** Row. */
    public readonly y: number,
  ) {}

  /** The origin `(0, 0)`. */
  public static readonly ORIGIN = new Offset(0, 0);

  /** Component-wise sum. */
  public add(other: Offset): Offset {
    return new Offset(this.x + other.x, this.y + other.y);
  }

  /** Component-wise difference (`this - other`). */
  public subtract(other: Offset): Offset {
    return new Offset(this.x - other.x, this.y - other.y);
  }

  /** True if both components match. */
  public equals(other: Offset): boolean {
    return this.x === other.x && this.y === other.y;
  }

  /** A copy of this offset. */
  public clone(): Offset {
    return new Offset(this.x, this.y);
  }

  /** `"(x, y)"`. */
  public toString(): string {
    return `(${this.x}, ${this.y})`;
  }
}
