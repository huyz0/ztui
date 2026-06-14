/** An immutable width × height in cells. */
export class Size {
  constructor(
    /** Width in cells. */
    public readonly width: number,
    /** Height in cells. */
    public readonly height: number,
  ) {}

  /** A zero size `0x0`. */
  public static readonly ZERO = new Size(0, 0);

  /** True if both dimensions match. */
  public equals(other: Size): boolean {
    return this.width === other.width && this.height === other.height;
  }

  /** A copy of this size. */
  public clone(): Size {
    return new Size(this.width, this.height);
  }

  /** `"WxH"`. */
  public toString(): string {
    return `${this.width}x${this.height}`;
  }
}
