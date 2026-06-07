export class Size {
  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {}

  public static readonly ZERO = new Size(0, 0);

  public equals(other: Size): boolean {
    return this.width === other.width && this.height === other.height;
  }

  public clone(): Size {
    return new Size(this.width, this.height);
  }
}
