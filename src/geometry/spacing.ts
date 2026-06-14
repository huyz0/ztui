/** Immutable per-side spacing (cells), used for margin, padding, and borders. */
export class Spacing {
  constructor(
    /** Top inset. */
    public readonly top: number = 0,
    /** Right inset. */
    public readonly right: number = 0,
    /** Bottom inset. */
    public readonly bottom: number = 0,
    /** Left inset. */
    public readonly left: number = 0,
  ) {}

  /** Zero on every side. */
  public static readonly ZERO = new Spacing(0, 0, 0, 0);

  /** Total horizontal inset (`left + right`). */
  public get width(): number {
    return this.left + this.right;
  }

  /** Total vertical inset (`top + bottom`). */
  public get height(): number {
    return this.top + this.bottom;
  }

  /** True if all four sides match. */
  public equals(other: Spacing): boolean {
    return (
      this.top === other.top &&
      this.right === other.right &&
      this.bottom === other.bottom &&
      this.left === other.left
    );
  }

  /** A copy of this spacing. */
  public clone(): Spacing {
    return new Spacing(this.top, this.right, this.bottom, this.left);
  }

  /** `"[t:… r:… b:… l:…]"`. */
  public toString(): string {
    return `[t:${this.top} r:${this.right} b:${this.bottom} l:${this.left}]`;
  }
}
