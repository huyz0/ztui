import { describe, expect, test, vi } from "vitest";
import { DatePickerWidget, formatISODate, parseISODate } from "./date-picker.ts";

describe("formatISODate / parseISODate", () => {
  test("round-trips a date through YYYY-MM-DD", () => {
    const date = new Date(2026, 0, 5); // Jan 5, 2026
    expect(formatISODate(date)).toBe("2026-01-05");
    const parsed = parseISODate("2026-01-05")!;
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(0);
    expect(parsed.getDate()).toBe(5);
  });

  test("rejects malformed or rolled-over dates", () => {
    expect(parseISODate("not-a-date")).toBeNull();
    expect(parseISODate("2024-02-30")).toBeNull(); // Feb has no 30th
    expect(parseISODate("2026-13-01")).toBeNull(); // month rolls over to next year
  });
});

describe("DatePickerWidget", () => {
  test("dayAt maps the week/col grid to real calendar dates", () => {
    const w = new DatePickerWidget();
    w.viewMonth = new Date(2026, 6, 1); // July 2026 — starts on a Wednesday
    const firstRow = [0, 1, 2, 3, 4, 5, 6].map((col) => w.dayAt(0, col));
    // Days before the 1st (Su, Mo, Tu) come from June; Wed 1 starts July.
    expect(firstRow[3].getMonth()).toBe(6);
    expect(firstRow[3].getDate()).toBe(1);
    expect(firstRow[0].getMonth()).toBe(5); // June
  });

  test("dayAt always resolves to a real date across the full displayed grid, never null", () => {
    // Regression: the doc comment used to promise `| null` "past the shown
    // range", but week/col are always caller-supplied within the fixed
    // WEEKS_SHOWN x 7 grid, so there was no reachable null case — dead code
    // that misled callers into guarding against something that couldn't
    // happen. dayAt's signature is now a plain Date; this exercises every
    // cell of the grid to confirm none of them are ever invalid.
    const w = new DatePickerWidget();
    w.viewMonth = new Date(2026, 1, 1); // Feb 2026
    for (let week = 0; week < 6; week++) {
      for (let col = 0; col < 7; col++) {
        const day = w.dayAt(week, col);
        expect(day).toBeInstanceOf(Date);
        expect(Number.isNaN(day.getTime())).toBe(false);
      }
    }
  });

  test("commitDay sets value, fires onChange, and closes", () => {
    const onChange = vi.fn();
    const w = new DatePickerWidget();
    w.onChange = onChange;
    w.isOpen = true;
    w.commitDay(new Date(2026, 6, 15));
    expect(w.value).toBe("2026-07-15");
    expect(onChange).toHaveBeenCalledWith("2026-07-15");
    expect(w.isOpen).toBe(false);
  });

  test("shiftMonth moves the view and clamps the cursor's day-of-month", () => {
    const w = new DatePickerWidget();
    w.cursorDate = new Date(2026, 0, 31); // Jan 31
    w.viewMonth = new Date(2026, 0, 1);
    w.shiftMonth(1); // -> February (28 days in 2026, not a leap year)
    expect(w.viewMonth.getMonth()).toBe(1);
    expect(w.cursorDate.getDate()).toBe(28);
  });

  test("selectedDate reflects a parsed value or null when empty", () => {
    const w = new DatePickerWidget();
    expect(w.selectedDate).toBeNull();
    w.value = "2026-07-13";
    expect(w.selectedDate?.getDate()).toBe(13);
  });

  test("openCalendar bails (no overlay) when there is no mounted screen", () => {
    const w = new DatePickerWidget();
    w.openCalendar();
    expect((w as unknown as { overlay: unknown }).overlay).toBeFalsy();
  });
});
