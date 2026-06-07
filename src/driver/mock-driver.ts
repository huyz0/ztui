import { Size } from "../geometry/size.ts";
import { Driver, KeyEvent, type MouseEvent } from "./driver.ts";

export class MockDriver extends Driver {
  public writtenData = "";
  private width: number;
  private height: number;
  private isRunning = false;

  constructor(width = 80, height = 24) {
    super();
    this.width = width;
    this.height = height;
  }

  public getSize(): Size {
    return new Size(this.width, this.height);
  }

  public start(): void {
    this.isRunning = true;
    this.writtenData = "";
  }

  public stop(): void {
    this.isRunning = false;
  }

  public write(data: string): void {
    this.writtenData += data;
  }

  public clearWrittenData(): void {
    this.writtenData = "";
  }

  public simulateKey(
    key: string,
    name: string = key,
    ctrl = false,
    shift = false,
    meta = false,
  ): void {
    this.emit("key", { key, name, ctrl, shift, meta });
  }

  public simulateMouse(
    x: number,
    y: number,
    type: MouseEvent["type"],
    button: MouseEvent["button"],
  ): void {
    this.emit("mouse", { x, y, type, button });
  }

  public simulateResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.emit("resize", new Size(width, height));
  }
}
