export class Offset {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}

  public static readonly ORIGIN = new Offset(0, 0);

  public add(other: Offset): Offset {
    return new Offset(this.x + other.x, this.y + other.y);
  }

  public subtract(other: Offset): Offset {
    return new Offset(this.x - other.x, this.y - other.y);
  }

  public equals(other: Offset): boolean {
    return this.x === other.x && this.y === other.y;
  }

  public clone(): Offset {
    return new Offset(this.x, this.y);
  }
}
