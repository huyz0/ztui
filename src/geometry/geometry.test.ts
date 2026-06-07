import { describe, expect, test } from "vitest";
import { Offset } from "./offset.ts";
import { Region } from "./region.ts";
import { Size } from "./size.ts";
import { Spacing } from "./spacing.ts";

describe("geometry", () => {
  test("Offset operations", () => {
    const o1 = new Offset(1, 2);
    const o2 = new Offset(3, 4);
    expect(o1.add(o2).equals(new Offset(4, 6))).toBe(true);
    expect(o2.subtract(o1).equals(new Offset(2, 2))).toBe(true);
  });

  test("Size", () => {
    const s1 = new Size(10, 5);
    expect(s1.width).toBe(10);
    expect(s1.height).toBe(5);
  });

  test("Region intersection, contains, equals, clone", () => {
    const r1 = new Region(new Offset(0, 0), new Size(10, 10));
    const r2 = new Region(new Offset(5, 5), new Size(10, 10));
    const inter = r1.intersection(r2);
    expect(inter).not.toBeNull();
    expect(inter!.offset.equals(new Offset(5, 5))).toBe(true);
    expect(inter!.size.equals(new Size(5, 5))).toBe(true);

    const r3 = new Region(new Offset(20, 20), new Size(5, 5));
    expect(r1.intersection(r3)).toBeNull();

    expect(r1.contains(new Offset(3, 3))).toBe(true);
    expect(r1.contains(new Offset(12, 12))).toBe(false);
    expect((r1 as any).contains("invalid")).toBe(false);

    const inner = new Region(new Offset(2, 2), new Size(3, 3));
    expect(r1.containsRegion(inner)).toBe(true);
    expect(r1.containsRegion(r2)).toBe(false);

    const r1Clone = r1.clone();
    expect(r1.equals(r1Clone)).toBe(true);
    expect(r1.equals(r2)).toBe(false);
  });

  test("Spacing width and height, equals, clone", () => {
    const sp = new Spacing(1, 2, 3, 4);
    expect(sp.width).toBe(6);
    expect(sp.height).toBe(4);

    const spClone = sp.clone();
    expect(sp.equals(spClone)).toBe(true);
    expect(sp.equals(Spacing.ZERO)).toBe(false);
  });
});
