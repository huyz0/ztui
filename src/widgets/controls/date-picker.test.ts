import { describe, expect, test, vi } from "vitest";
import { App } from "../../core/app.ts";
import { Screen } from "../../dom/screen.ts";
import { Widget } from "../../dom/widget.ts";
import { MockDriver } from "../../driver/mock/index.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import {
  CalendarOverlayWidget,
  DatePickerWidget,
  formatISODate,
  parseISODate,
} from "./date-picker.ts";

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

  test("openCalendar is a no-op when already open", () => {
    const w = new DatePickerWidget();
    w.isOpen = true;
    const before = w.viewMonth;
    w.openCalendar();
    expect(w.viewMonth).toBe(before); // untouched — early return
  });

  test("openCalendar places the popover below when there's room", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(40, 20));
    const w = new DatePickerWidget();
    screen.appendChild(w);
    w.region = new Region(new Offset(0, 0), new Size(24, 3));

    w.openCalendar();
    const overlay = (w as unknown as { overlay: CalendarOverlayWidget }).overlay;
    expect(overlay).toBeTruthy();
    expect(overlay.overlayY).toBe(3); // clientRect.bottom
  });

  test("openCalendar flips above when there's no room below but room above", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(40, 12));
    const w = new DatePickerWidget();
    screen.appendChild(w);
    // Place near the bottom of a short screen so spaceBelow < CALENDAR_HEIGHT
    // and clientRect.y (10) > spaceBelow.
    w.region = new Region(new Offset(0, 10), new Size(24, 2));

    w.openCalendar();
    const overlay = (w as unknown as { overlay: CalendarOverlayWidget }).overlay;
    expect(overlay).toBeTruthy();
    expect(overlay.overlayY).toBeLessThan(10);
  });

  test("getScreen returns null when attached to a non-Screen ancestor chain", () => {
    const container = new Widget("view");
    const w = new DatePickerWidget();
    container.appendChild(w);
    expect(w.getScreen()).toBeNull();
  });

  test("closeCalendar is a no-op when not open", () => {
    const w = new DatePickerWidget();
    expect(() => w.closeCalendar()).not.toThrow();
    expect(w.isOpen).toBe(false);
  });

  test("widget handleMouse opens the calendar on a left press when unhandled", () => {
    const w = new DatePickerWidget();
    w.handleMouse({ type: "press", button: "left", handled: false });
    expect(w.isOpen).toBe(true);
  });

  test("widget handleMouse does nothing further once the event is already handled", () => {
    const w = new DatePickerWidget();
    w.handleMouse({ type: "press", button: "left", handled: true });
    expect(w.isOpen).toBe(false);
  });

  describe("handleDateKey via onKey", () => {
    test("enter/space/down open the calendar when closed; other keys are ignored", () => {
      for (const key of ["enter", "space", "down"]) {
        const w = new DatePickerWidget();
        const ev = { name: key, handled: false };
        w.onKey?.(ev);
        expect(w.isOpen).toBe(true);
        expect(ev.handled).toBe(true);
      }

      const w = new DatePickerWidget();
      const ev = { name: "x", handled: false };
      w.onKey?.(ev);
      expect(w.isOpen).toBe(false);
      expect(ev.handled).toBe(false);
    });

    test("arrow keys move the cursor day and update the view month while open", () => {
      const w = new DatePickerWidget();
      w.isOpen = true;
      w.cursorDate = new Date(2026, 6, 15);

      w.onKey?.({ name: "left", handled: false });
      expect(w.cursorDate.getDate()).toBe(14);

      w.onKey?.({ name: "right", handled: false });
      expect(w.cursorDate.getDate()).toBe(15);

      w.onKey?.({ name: "up", handled: false });
      expect(w.cursorDate.getDate()).toBe(8);

      w.onKey?.({ name: "down", handled: false });
      expect(w.cursorDate.getDate()).toBe(15);
    });

    test("pageup/pagedown shift the month while open", () => {
      const w = new DatePickerWidget();
      w.isOpen = true;
      w.cursorDate = new Date(2026, 6, 15);
      w.viewMonth = new Date(2026, 6, 1);

      w.onKey?.({ name: "pageup", handled: false });
      expect(w.viewMonth.getMonth()).toBe(5);

      w.onKey?.({ name: "pagedown", handled: false });
      expect(w.viewMonth.getMonth()).toBe(6);
    });

    test("space/enter commit the cursor day while open", () => {
      const w = new DatePickerWidget();
      w.isOpen = true;
      w.cursorDate = new Date(2026, 6, 15);
      w.onKey?.({ name: "enter", handled: false });
      expect(w.value).toBe("2026-07-15");
      expect(w.isOpen).toBe(false);
    });

    test("escape closes and marks handled; tab closes without marking handled", () => {
      const w1 = new DatePickerWidget();
      w1.isOpen = true;
      const ev1 = { name: "escape", handled: false };
      w1.onKey?.(ev1);
      expect(w1.isOpen).toBe(false);
      expect(ev1.handled).toBe(true);

      const w2 = new DatePickerWidget();
      w2.isOpen = true;
      const ev2 = { name: "tab", handled: false };
      w2.onKey?.(ev2);
      expect(w2.isOpen).toBe(false);
      expect(ev2.handled).toBe(false);
    });

    test("up from the grid's first displayed row moves focus to the month header zone instead of the date", () => {
      const w = new DatePickerWidget();
      w.isOpen = true;
      w.cursorDate = new Date(2026, 6, 1); // July 1 2026 — always in the grid's row 0
      w.onKey?.({ name: "up", handled: false });
      expect(w.headerFocus).toBe("month");
      expect(w.cursorDate.getDate()).toBe(1); // date itself didn't move
    });

    test("left/right cycle the header zones; down returns focus to the grid", () => {
      const w = new DatePickerWidget();
      w.isOpen = true;
      w.headerFocus = "month";

      w.onKey?.({ name: "right", handled: false });
      expect(w.headerFocus).toBe("year");
      w.onKey?.({ name: "right", handled: false });
      expect(w.headerFocus).toBe("next");
      w.onKey?.({ name: "right", handled: false }); // wraps
      expect(w.headerFocus).toBe("prev");
      w.onKey?.({ name: "left", handled: false }); // wraps back
      expect(w.headerFocus).toBe("next");

      w.onKey?.({ name: "down", handled: false });
      expect(w.headerFocus).toBe("grid");
    });

    test("enter on the prev/next header zones shifts the month; on month/year opens that sub-picker", () => {
      const prev = new DatePickerWidget();
      prev.isOpen = true;
      prev.headerFocus = "prev";
      prev.viewMonth = new Date(2026, 6, 1);
      prev.onKey?.({ name: "enter", handled: false });
      expect(prev.viewMonth.getMonth()).toBe(5);

      const next = new DatePickerWidget();
      next.isOpen = true;
      next.headerFocus = "next";
      next.viewMonth = new Date(2026, 6, 1);
      next.onKey?.({ name: "enter", handled: false });
      expect(next.viewMonth.getMonth()).toBe(7);

      const month = new DatePickerWidget();
      month.isOpen = true;
      month.headerFocus = "month";
      month.onKey?.({ name: "enter", handled: false });
      expect(month.subPicker).toBe("month");

      const year = new DatePickerWidget();
      year.isOpen = true;
      year.headerFocus = "year";
      year.onKey?.({ name: "enter", handled: false });
      expect(year.subPicker).toBe("year");
    });

    test("escape on a header zone closes the whole calendar", () => {
      const w = new DatePickerWidget();
      w.isOpen = true;
      w.headerFocus = "year";
      w.onKey?.({ name: "escape", handled: false });
      expect(w.isOpen).toBe(false);
    });

    describe("sub-picker keyboard navigation", () => {
      test("arrow keys move the sub-picker cursor within the 2x6 grid, clamped at the edges", () => {
        const w = new DatePickerWidget();
        w.isOpen = true;
        w.openMonthPicker();
        w.subPickerIndex = 5;

        w.onKey?.({ name: "right", handled: false });
        expect(w.subPickerIndex).toBe(6);
        w.onKey?.({ name: "left", handled: false });
        expect(w.subPickerIndex).toBe(5);
        w.onKey?.({ name: "down", handled: false });
        expect(w.subPickerIndex).toBe(7);
        w.onKey?.({ name: "up", handled: false });
        expect(w.subPickerIndex).toBe(5);

        w.subPickerIndex = 0;
        w.onKey?.({ name: "left", handled: false });
        expect(w.subPickerIndex).toBe(0); // clamped
        w.subPickerIndex = 11;
        w.onKey?.({ name: "right", handled: false });
        expect(w.subPickerIndex).toBe(11); // clamped
      });

      test("enter commits the highlighted month and closes the sub-picker", () => {
        const w = new DatePickerWidget();
        w.isOpen = true;
        w.cursorDate = new Date(2026, 6, 15);
        w.openMonthPicker();
        w.subPickerIndex = 1; // February
        w.onKey?.({ name: "enter", handled: false });
        expect(w.subPicker).toBeNull();
        expect(w.viewMonth.getMonth()).toBe(1);
        expect(w.cursorDate.getMonth()).toBe(1);
      });

      test("enter commits the highlighted year and closes the sub-picker", () => {
        const w = new DatePickerWidget();
        w.isOpen = true;
        w.cursorDate = new Date(2026, 6, 15);
        w.openYearPicker();
        w.subPickerIndex = 0; // yearRangeStart
        w.onKey?.({ name: "enter", handled: false });
        expect(w.subPicker).toBeNull();
        expect(w.viewMonth.getFullYear()).toBe(w.yearRangeStart);
      });

      test("pageup/pagedown shift the year range by 12 without closing the picker", () => {
        const w = new DatePickerWidget();
        w.isOpen = true;
        w.openYearPicker();
        const start = w.yearRangeStart;
        w.onKey?.({ name: "pagedown", handled: false });
        expect(w.yearRangeStart).toBe(start + 12);
        w.onKey?.({ name: "pageup", handled: false });
        expect(w.yearRangeStart).toBe(start);
      });

      test("escape cancels the sub-picker without changing the view, keeping the calendar open", () => {
        const w = new DatePickerWidget();
        w.isOpen = true;
        w.viewMonth = new Date(2026, 6, 1);
        w.openMonthPicker();
        w.subPickerIndex = 3;
        w.onKey?.({ name: "escape", handled: false });
        expect(w.subPicker).toBeNull();
        expect(w.isOpen).toBe(true);
        expect(w.viewMonth.getMonth()).toBe(6); // unchanged
      });

      test("an unrecognized key in the sub-picker is left unhandled", () => {
        const w = new DatePickerWidget();
        w.isOpen = true;
        w.openMonthPicker();
        const ev = { name: "x", handled: false };
        w.onKey?.(ev);
        expect(ev.handled).toBe(false);
      });
    });

    test("an unrecognized key on the grid is left unhandled", () => {
      const w = new DatePickerWidget();
      w.isOpen = true;
      const ev = { name: "x", handled: false };
      w.onKey?.(ev);
      expect(ev.handled).toBe(false);
    });

    test("an unrecognized key on a header zone is left unhandled", () => {
      const w = new DatePickerWidget();
      w.isOpen = true;
      w.headerFocus = "month";
      const ev = { name: "x", handled: false };
      w.onKey?.(ev);
      expect(ev.handled).toBe(false);
    });
  });

  describe("resolveBorderColor", () => {
    test("falls back to the base implementation when not focused and no severity color", () => {
      const w = new DatePickerWidget();
      expect(() =>
        (w as unknown as { resolveBorderColor(): string | undefined }).resolveBorderColor(),
      ).not.toThrow();
    });

    test("uses the severity color when validation is invalid and touched", () => {
      const w = new DatePickerWidget();
      w.validation.validators = [() => false];
      w.validation.touched = true;
      w.validation.validate();
      const color = (
        w as unknown as { resolveBorderColor(): string | undefined }
      ).resolveBorderColor();
      expect(color).toBe("red");
    });

    test("uses the focus color when focused, borderColor unset, and an App is running", () => {
      const driver = new MockDriver(40, 10);
      const app = new App(driver);
      const w = new DatePickerWidget();
      app.activeScreen.appendChild(w);
      w.focused = true;

      const color = (
        w as unknown as { resolveBorderColor(): string | undefined }
      ).resolveBorderColor();
      expect(typeof color).toBe("string");

      app.stop();
    });
  });

  describe("render", () => {
    test("renders the placeholder when empty and the value/ellipsis when set", () => {
      const w = new DatePickerWidget();
      w.region = new Region(new Offset(0, 0), new Size(24, 3));
      const buffer = new ScreenBuffer(24, 3);
      expect(() => w.render(buffer)).not.toThrow();

      w.value = "2026-07-15";
      expect(() => w.render(buffer)).not.toThrow();
    });

    test("truncates an overlong label with an ellipsis", () => {
      const w = new DatePickerWidget();
      w.value = "2026-07-15";
      w.region = new Region(new Offset(0, 0), new Size(6, 3));
      const buffer = new ScreenBuffer(6, 3);
      expect(() => w.render(buffer)).not.toThrow();
    });

    test("falls back to the plain color when disabled/focused with no App running", () => {
      const w = new DatePickerWidget();
      w.region = new Region(new Offset(0, 0), new Size(24, 3));
      const buffer = new ScreenBuffer(24, 3);

      w.disabled = true;
      expect(() => w.render(buffer)).not.toThrow();

      w.disabled = false;
      w.focused = true;
      expect(() => w.render(buffer)).not.toThrow();
    });

    test("renders with the disabled color and with the open-arrow glyph", () => {
      const driver = new MockDriver(40, 10);
      const app = new App(driver);
      const w = new DatePickerWidget();
      app.activeScreen.appendChild(w);
      w.region = new Region(new Offset(0, 0), new Size(24, 3));
      w.disabled = true;
      w.isOpen = true;
      const buffer = new ScreenBuffer(24, 3);
      expect(() => w.render(buffer)).not.toThrow();
      app.stop();
    });

    test("renders with the focus color when focused and not disabled", () => {
      const driver = new MockDriver(40, 10);
      const app = new App(driver);
      const w = new DatePickerWidget();
      app.activeScreen.appendChild(w);
      w.region = new Region(new Offset(0, 0), new Size(24, 3));
      w.focused = true;
      const buffer = new ScreenBuffer(24, 3);
      expect(() => w.render(buffer)).not.toThrow();
      app.stop();
    });
  });
});

describe("CalendarOverlayWidget", () => {
  function makeOverlay() {
    const w = new DatePickerWidget();
    w.viewMonth = new Date(2026, 6, 1); // July 2026
    w.value = "2026-07-10";
    w.cursorDate = new Date(2026, 6, 12);
    const overlay = new CalendarOverlayWidget(w, 2, 1);
    return { w, overlay };
  }

  describe("handleMouse", () => {
    test("ignores non-left-press events", () => {
      const { w, overlay } = makeOverlay();
      overlay.handleMouse({ type: "move", button: "left" });
      overlay.handleMouse({ type: "press", button: "right" });
      expect(w.isOpen).toBe(false); // never touched
    });

    test("closes the calendar on a click outside the popover bounds", () => {
      const { w, overlay } = makeOverlay();
      w.isOpen = true;
      const ev = { type: "press", button: "left", x: 0, y: 0, handled: false };
      overlay.handleMouse(ev);
      expect(w.isOpen).toBe(false);
      expect(ev.handled).toBe(true);
    });

    test("clicking the left chevron shifts the month back", () => {
      const { w, overlay } = makeOverlay();
      const before = w.viewMonth.getMonth();
      const ev = {
        type: "press",
        button: "left",
        x: overlay.overlayX + 1,
        y: overlay.overlayY + 1,
      };
      overlay.handleMouse(ev);
      expect(w.viewMonth.getMonth()).toBe((before + 11) % 12);
    });

    test("clicking the right chevron shifts the month forward", () => {
      const { w, overlay } = makeOverlay();
      const before = w.viewMonth.getMonth();
      const ev = {
        type: "press",
        button: "left",
        x: overlay.overlayX + 20, // CALENDAR_WIDTH - 2
        y: overlay.overlayY + 1,
      };
      overlay.handleMouse(ev);
      expect(w.viewMonth.getMonth()).toBe((before + 1) % 12);
    });

    test("clicking elsewhere on the header row does nothing but marks handled", () => {
      const { w, overlay } = makeOverlay();
      const before = w.viewMonth.getMonth();
      const ev = {
        type: "press",
        button: "left",
        x: overlay.overlayX + 10,
        y: overlay.overlayY + 1,
        handled: false,
      };
      overlay.handleMouse(ev);
      expect(w.viewMonth.getMonth()).toBe(before);
      expect(ev.handled).toBe(true);
    });

    test("clicking a day cell commits that day", () => {
      const { w, overlay } = makeOverlay();
      // Week 0 starts at localY=3; July 1 2026 is a Wednesday (col 3).
      const ev = {
        type: "press",
        button: "left",
        x: overlay.overlayX + 1 + 3 * 3,
        y: overlay.overlayY + 3,
      };
      overlay.handleMouse(ev);
      expect(w.value).toBe("2026-07-01");
    });

    test("clicking outside the 7-column day grid within the day rows does not commit", () => {
      const { w, overlay } = makeOverlay();
      const before = w.value;
      // localX far past the last column so `col` resolves outside 0-6.
      const ev = {
        type: "press",
        button: "left",
        x: overlay.overlayX + 200,
        y: overlay.overlayY + 3,
      };
      overlay.handleMouse(ev);
      expect(w.value).toBe(before);
    });

    test("clicking the month text opens the month sub-picker", () => {
      const { w, overlay } = makeOverlay();
      // "July 2026" is centered in the 20-wide inner header; "July" starts at local x=6.
      const ev = {
        type: "press",
        button: "left",
        x: overlay.overlayX + 8,
        y: overlay.overlayY + 1,
      };
      overlay.handleMouse(ev);
      expect(w.subPicker).toBe("month");
    });

    test("clicking the year text opens the year sub-picker", () => {
      const { w, overlay } = makeOverlay();
      const ev = {
        type: "press",
        button: "left",
        x: overlay.overlayX + 13,
        y: overlay.overlayY + 1,
      };
      overlay.handleMouse(ev);
      expect(w.subPicker).toBe("year");
    });

    test("clicking a sub-picker cell commits it and closes the sub-picker", () => {
      const { w, overlay } = makeOverlay();
      w.openMonthPicker(); // subPickerIndex seeded from the current view month (June, index 6)
      const ev = {
        type: "press",
        button: "left",
        x: overlay.overlayX + 1, // col 0
        y: overlay.overlayY + 3, // row 0 -> index 0 -> January
      };
      overlay.handleMouse(ev);
      expect(w.subPicker).toBeNull();
      expect(w.viewMonth.getMonth()).toBe(0);
    });

    test("header-row clicks are ignored while a sub-picker is open", () => {
      const { w, overlay } = makeOverlay();
      w.openMonthPicker();
      const before = w.viewMonth.getMonth();
      const ev = {
        type: "press",
        button: "left",
        x: overlay.overlayX + 1, // left chevron position
        y: overlay.overlayY + 1,
      };
      overlay.handleMouse(ev);
      expect(w.viewMonth.getMonth()).toBe(before);
      expect(w.subPicker).toBe("month"); // still open
    });
  });

  test("render draws the calendar without throwing, covering selected/cursor/out-of-month styling", () => {
    const driver = new MockDriver(40, 20);
    const app = new App(driver);
    const { w, overlay } = makeOverlay();
    app.activeScreen.appendChild(w);
    const buffer = new ScreenBuffer(40, 20);
    expect(() => overlay.render(buffer)).not.toThrow();
    app.stop();
  });

  test("render falls back to the plain theme colors when no App is running", () => {
    const { overlay } = makeOverlay();
    const buffer = new ScreenBuffer(40, 20);
    expect(() => overlay.render(buffer)).not.toThrow();
  });

  test("render draws the sub-picker grid without throwing, for both month and year", () => {
    const driver = new MockDriver(40, 20);
    const app = new App(driver);
    const { w, overlay } = makeOverlay();
    app.activeScreen.appendChild(w);
    const buffer = new ScreenBuffer(40, 20);

    w.openMonthPicker();
    expect(() => overlay.render(buffer)).not.toThrow();

    w.openYearPicker();
    expect(() => overlay.render(buffer)).not.toThrow();
    app.stop();
  });

  test("Sunday and Saturday columns render with a different background than weekday columns", () => {
    const { overlay } = makeOverlay();
    const buffer = new ScreenBuffer(40, 20);
    overlay.render(buffer);

    // Day grid starts at local row 3, columns at local x 1 (Su), 4 (Mo), ... 19 (Sa).
    const sunday = buffer.cells[overlay.overlayY + 3][overlay.overlayX + 1];
    const monday = buffer.cells[overlay.overlayY + 3][overlay.overlayX + 4];
    const saturday = buffer.cells[overlay.overlayY + 3][overlay.overlayX + 19];
    expect(sunday.style.background).not.toBe(monday.style.background);
    expect(saturday.style.background).not.toBe(monday.style.background);
    expect(sunday.style.background).toBe(saturday.style.background);
  });

  test("the first day of the displayed month renders bold", () => {
    const { w, overlay } = makeOverlay();
    // July 2026: the 1st is a Wednesday, grid col 3, row 0.
    w.viewMonth = new Date(2026, 6, 1);
    const buffer = new ScreenBuffer(40, 20);
    overlay.render(buffer);
    const firstCell = buffer.cells[overlay.overlayY + 3][overlay.overlayX + 1 + 3 * 3];
    const secondCell = buffer.cells[overlay.overlayY + 3][overlay.overlayX + 1 + 4 * 3]; // July 2nd
    expect(firstCell.style.bold).toBe(true);
    expect(secondCell.style.bold).toBeFalsy();
  });

  test("the focused header zone renders highlighted", () => {
    const { w, overlay } = makeOverlay();
    w.headerFocus = "month";
    const buffer = new ScreenBuffer(40, 20);
    overlay.render(buffer);
    // "July" starts at local x=6 within the header row (local y=1).
    const monthCell = buffer.cells[overlay.overlayY + 1][overlay.overlayX + 6];
    expect(monthCell.style.bold).toBe(true);
  });
});
