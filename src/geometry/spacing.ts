import { Size } from "./size.ts";

export class Spacing {
  constructor(
    public readonly top: number = 0,
    public readonly right: number = 0,
    public readonly bottom: number = 0,
    public readonly left: number = 0,
  ) {}

  public static readonly ZERO = new Spacing(0, 0, 0, 0);

  public get width(): number {
    return this.left + this.right;
  }

  public get height(): number {
    return this.top + this.bottom;
  }

  public equals(other: Spacing): boolean {
    return (
      this.top === other.top &&
      this.right === other.right &&
      this.bottom === other.bottom &&
      this.left === other.left
    );
  }

  public clone(): Spacing {
    return new Spacing(this.top, this.right, this.bottom, this.left);
  }
}
