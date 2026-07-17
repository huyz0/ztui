import { App } from "../../core/app.ts";
import { blendColors } from "../../css/css-resolver.ts";
import { Screen } from "../../dom/screen.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { FALLBACK_DARK_BG } from "../../theme.ts";
import { attachFieldValidation, type FieldValidation } from "./validation.ts";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const WEEKDAY_HEADER = WEEKDAY_LABELS.join(" ");
const CALENDAR_WIDTH = WEEKDAY_HEADER.length + 2; // +2 for the border
const WEEKS_SHOWN = 6; // fixed so the popover height never jitters month to month
const CALENDAR_HEIGHT =
  1 /* month header */ + 1 /* weekday header */ + WEEKS_SHOWN + 2; /* border */

// The month/year sub-picker reuses the day grid's footprint (WEEKS_SHOWN
// rows) laid out as 2 columns x 6 rows — exactly 12 slots, one per month or
// per year-in-range, so the popover never resizes when a sub-picker opens.
const SUB_COLS = 2;
const SUB_ROWS = WEEKS_SHOWN;
const SUB_COL_WIDTH = Math.floor((CALENDAR_WIDTH - 2) / SUB_COLS);

type HeaderZone = "prev" | "month" | "year" | "next" | "grid";
type SubPicker = "month" | "year" | null;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Format a `Date` as `YYYY-MM-DD` in local time. */
export function formatISODate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Parse a `YYYY-MM-DD` string into a local `Date` at midnight, or `null` if malformed. */
export function parseISODate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  // Reject values `Date` silently rolled over (e.g. "2024-02-30").
  if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null;
  return date;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Layout of the header row's independently clickable/focusable month and year text. */
function headerLayout(
  view: Date,
  x0: number,
): { monthText: string; yearText: string; monthX: number; yearX: number } {
  const monthText = MONTH_NAMES[view.getMonth()];
  const yearText = String(view.getFullYear());
  const title = `${monthText} ${yearText}`;
  const innerWidth = CALENDAR_WIDTH - 2;
  const titlePad = Math.max(0, Math.floor((innerWidth - stringWidth(title)) / 2));
  const monthX = x0 + 1 + titlePad;
  const yearX = monthX + stringWidth(monthText) + 1;
  return { monthText, yearText, monthX, yearX };
}

/** Cell rect for the 2x6 month/year sub-picker grid, sharing the day grid's footprint. */
function subPickerCell(index: number, x0: number, y0: number): { x: number; y: number } {
  const col = index % SUB_COLS;
  const row = Math.floor(index / SUB_COLS);
  return { x: x0 + 1 + col * SUB_COL_WIDTH, y: y0 + 3 + row };
}

export class CalendarOverlayWidget extends Widget {
  protected override defaultCursor() {
    return "pointer" as const;
  }

  constructor(
    public datePicker: DatePickerWidget,
    public overlayX: number,
    public overlayY: number,
  ) {
    super("calendar-overlay");
    this.focusable = false;
    this.style = {
      position: "absolute",
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
      zIndex: 1000,
    };
  }

  public override handleMouse(ev: any): void {
    if (ev.type !== "press" || ev.button !== "left") return;

    const inX = ev.x >= this.overlayX && ev.x < this.overlayX + CALENDAR_WIDTH;
    const inY = ev.y >= this.overlayY && ev.y < this.overlayY + CALENDAR_HEIGHT;
    if (!inX || !inY) {
      this.datePicker.closeCalendar();
      ev.handled = true;
      return;
    }

    const localX = ev.x - this.overlayX;
    const localY = ev.y - this.overlayY;
    const x0 = this.overlayX;

    if (localY === 1) {
      // Month header row: chevrons sit just inside the border; the month and
      // year text are independently clickable, opening their own picker.
      if (this.datePicker.subPicker) {
        ev.handled = true;
        return;
      }
      const { monthX, yearX, monthText, yearText } = headerLayout(this.datePicker.viewMonth, x0);
      if (localX === 1) {
        this.datePicker.headerFocus = "prev";
        this.datePicker.shiftMonth(-1);
      } else if (localX === CALENDAR_WIDTH - 2) {
        this.datePicker.headerFocus = "next";
        this.datePicker.shiftMonth(1);
      } else if (ev.x >= monthX && ev.x < monthX + stringWidth(monthText)) {
        this.datePicker.openMonthPicker();
      } else if (ev.x >= yearX && ev.x < yearX + stringWidth(yearText)) {
        this.datePicker.openYearPicker();
      }
      ev.handled = true;
      return;
    }

    if (this.datePicker.subPicker) {
      if (localY >= 3 && localY < 3 + SUB_ROWS) {
        const row = localY - 3;
        const col = Math.floor((localX - 1) / SUB_COL_WIDTH);
        if (col >= 0 && col < SUB_COLS) {
          const index = row * SUB_COLS + col;
          if (index < 12) this.datePicker.commitSubPickerIndex(index);
        }
      }
      ev.handled = true;
      return;
    }

    if (localY >= 3 && localY < 3 + WEEKS_SHOWN) {
      const week = localY - 3;
      const col = Math.floor((localX - 1) / 3);
      if (col >= 0 && col < 7) {
        const day = this.datePicker.dayAt(week, col);
        if (day) {
          this.datePicker.headerFocus = "grid";
          this.datePicker.commitDay(day);
        }
      }
    }
    ev.handled = true;
  }

  public override render(buffer: ScreenBuffer): void {
    const bg =
      App.instance?.cssResolver.resolveVariable(this.datePicker, "$surface") || FALLBACK_DARK_BG;
    const fg =
      App.instance?.cssResolver.resolveVariable(this.datePicker, "$foreground") || "#ffffff";
    const primary =
      App.instance?.cssResolver.resolveVariable(this.datePicker, "$primary") || "#4daafc";
    const dim =
      App.instance?.cssResolver.resolveVariable(this.datePicker, "$disabled") || "#666666";

    const borderStyle = new Style({ color: fg, background: bg });
    const x0 = this.overlayX;
    const y0 = this.overlayY;

    for (let x = x0; x < x0 + CALENDAR_WIDTH; x++) {
      buffer.setCell(x, y0, "─", borderStyle);
      buffer.setCell(x, y0 + CALENDAR_HEIGHT - 1, "─", borderStyle);
    }
    for (let y = y0; y < y0 + CALENDAR_HEIGHT; y++) {
      buffer.setCell(x0, y, "│", borderStyle);
      buffer.setCell(x0 + CALENDAR_WIDTH - 1, y, "│", borderStyle);
    }
    buffer.setCell(x0, y0, "╭", borderStyle);
    buffer.setCell(x0 + CALENDAR_WIDTH - 1, y0, "╮", borderStyle);
    buffer.setCell(x0, y0 + CALENDAR_HEIGHT - 1, "╰", borderStyle);
    buffer.setCell(x0 + CALENDAR_WIDTH - 1, y0 + CALENDAR_HEIGHT - 1, "╯", borderStyle);

    // Month/year header: prev/next chevrons at the inner edges, month and
    // year as independently focusable/clickable zones (highlighted when
    // headerFocus points at them and no sub-picker is covering the grid).
    const view = this.datePicker.viewMonth;
    const { monthText, yearText, monthX, yearX } = headerLayout(view, x0);
    const focus = this.datePicker.subPicker ? null : this.datePicker.headerFocus;

    const zoneStyle = (zone: HeaderZone, color: string) =>
      focus === zone
        ? new Style({ color: bg, background: primary, bold: true })
        : new Style({ color, background: bg });

    buffer.setCell(x0 + 1, y0 + 1, "‹", zoneStyle("prev", primary));
    buffer.drawSegment(monthX, y0 + 1, new Segment(monthText, zoneStyle("month", fg)));
    buffer.setCell(monthX + stringWidth(monthText), y0 + 1, " ", new Style({ background: bg }));
    buffer.drawSegment(yearX, y0 + 1, new Segment(yearText, zoneStyle("year", fg)));
    buffer.setCell(x0 + CALENDAR_WIDTH - 2, y0 + 1, "›", zoneStyle("next", primary));

    const weekendBg = blendColors(fg, bg, 0.12);

    if (this.datePicker.subPicker) {
      this.renderSubPicker(buffer, x0, y0, bg, primary, dim);
      return;
    }

    // Weekday header, with Sun/Sat columns tinted to match the day grid below.
    for (let col = 0; col < 7; col++) {
      const isWeekend = col === 0 || col === 6;
      buffer.drawSegment(
        x0 + 1 + col * 3,
        y0 + 2,
        new Segment(
          WEEKDAY_LABELS[col],
          new Style({ color: dim, background: isWeekend ? weekendBg : bg }),
        ),
      );
    }

    // Day grid.
    const selected = this.datePicker.selectedDate;
    const cursor = this.datePicker.cursorDate;
    for (let week = 0; week < WEEKS_SHOWN; week++) {
      for (let col = 0; col < 7; col++) {
        const day = this.datePicker.dayAt(week, col);
        const cellX = x0 + 1 + col * 3;
        const cellY = y0 + 3 + week;
        if (!day) continue;

        const inMonth = day.getMonth() === view.getMonth();
        const isSelected = selected !== null && sameDay(day, selected);
        const isCursor = sameDay(day, cursor);
        const isWeekend = col === 0 || col === 6;
        const cellBg = isWeekend ? weekendBg : bg;
        const isFirstOfMonth = day.getDate() === 1;

        let style: Style;
        if (isCursor) {
          style = new Style({ color: bg, background: primary, bold: true });
        } else if (isSelected) {
          style = new Style({ color: primary, background: cellBg, bold: true });
        } else if (!inMonth) {
          style = new Style({ color: dim, background: cellBg, bold: isFirstOfMonth });
        } else {
          style = new Style({ color: fg, background: cellBg, bold: isFirstOfMonth });
        }

        const label = day.getDate().toString().padStart(2, " ");
        buffer.drawSegment(cellX, cellY, new Segment(label, style));
      }
    }
  }

  /** The 2x6 month-name or year-range grid shown in place of the day grid. */
  private renderSubPicker(
    buffer: ScreenBuffer,
    x0: number,
    y0: number,
    bg: string,
    primary: string,
    dim: string,
  ): void {
    const kind = this.datePicker.subPicker;
    const label = kind === "month" ? "Select a month" : "Select a year";
    const innerWidth = CALENDAR_WIDTH - 2;
    buffer.drawSegment(
      x0 + 1,
      y0 + 2,
      new Segment(
        label.slice(0, innerWidth).padEnd(innerWidth),
        new Style({ color: dim, background: bg }),
      ),
    );

    const activeIndex =
      kind === "month" ? this.datePicker.viewMonth.getMonth() : this.datePicker.subPickerIndex;
    for (let i = 0; i < 12; i++) {
      const { x, y } = subPickerCell(i, x0, y0);
      const text = kind === "month" ? MONTH_NAMES[i] : String(this.datePicker.yearRangeStart + i);
      const isCursor = i === this.datePicker.subPickerIndex;
      const isActive = i === activeIndex;
      const style = isCursor
        ? new Style({ color: bg, background: primary, bold: true })
        : isActive
          ? new Style({ color: primary, background: bg, bold: true })
          : new Style({ color: dim, background: bg });
      buffer.drawSegment(
        x,
        y,
        new Segment(text.padEnd(SUB_COL_WIDTH).slice(0, SUB_COL_WIDTH), style),
      );
    }
  }
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function addMonths(date: Date, delta: number): Date {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  // Clamp to the target month's last day (e.g. Jan 31 + 1 month -> Feb 28/29).
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/**
 * A single-date picker: a field showing the selected date (`YYYY-MM-DD`,
 * empty for none) that opens a calendar popover on activate, mirroring the
 * `Select` widget's dropdown-overlay pattern.
 */
export class DatePickerWidget extends Widget {
  protected override defaultCursor() {
    return "pointer" as const;
  }

  /** Selected date as `YYYY-MM-DD`, or `""` for no selection. */
  public value = "";
  /** Fired with the new `YYYY-MM-DD` value when a day is committed. */
  public declare onChange?: (value: string) => void;
  /** Text shown when nothing is selected. */
  public placeholder = "Select date...";

  /** Whether the calendar popover is open. */
  public isOpen = false;
  /** The month currently displayed in the popover (first-of-month). */
  public viewMonth: Date = startOfMonth(new Date());
  /** The keyboard-navigable day highlighted in the popover (not yet committed). */
  public cursorDate: Date = new Date();

  /** Which header zone (chevrons, month text, year text) or the day grid currently has keyboard focus. */
  public headerFocus: HeaderZone = "grid";
  /** The month or year sub-picker currently covering the day grid, or `null`. */
  public subPicker: SubPicker = null;
  /** Cursor index (0-11) within the open sub-picker's 2x6 grid. */
  public subPickerIndex = 0;
  /** First year shown in the year sub-picker's 12-year range. */
  public yearRangeStart = 0;

  /** Validation; the validated value is the `YYYY-MM-DD` string. */
  public readonly validation: FieldValidation = attachFieldValidation(this, () => this.value);

  private overlay: CalendarOverlayWidget | null = null;
  private overlayScreen: Screen | null = null;

  constructor() {
    super("date-picker");
    this.focusable = true;
    this.defaultStyle = { height: 3, border: "rounded" };

    this.onKey = (ev) => this.handleDateKey(ev);
  }

  /** The selected date as a `Date`, or `null` when {@link value} is empty/invalid. */
  public get selectedDate(): Date | null {
    return this.value ? parseISODate(this.value) : null;
  }

  /**
   * The date at `(week, col)` in the currently displayed month grid. `week`
   * and `col` are always caller-supplied within the fixed {@link WEEKS_SHOWN}
   * x 7 grid, so this always resolves to a real date (the grid overflows into
   * the adjacent months at the start/end of the displayed month, same as any
   * calendar UI) — it never has an out-of-range case to signal.
   */
  public dayAt(week: number, col: number): Date {
    const first = this.viewMonth;
    const firstWeekday = first.getDay();
    const offset = week * 7 + col - firstWeekday;
    return addDays(first, offset);
  }

  /** Open the calendar popover, seeding the cursor from the current selection (or today). */
  public openCalendar(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    const screen = this.getScreen();
    if (!screen) return;

    this.cursorDate = this.selectedDate ?? new Date();
    this.viewMonth = startOfMonth(this.cursorDate);
    this.headerFocus = "grid";
    this.subPicker = null;

    const clientRect = this.getClientRect();
    const screenHeight = screen.region.height;
    const screenWidth = screen.region.width;
    const spaceBelow = screenHeight - clientRect.bottom;

    let overlayY = clientRect.bottom;
    if (spaceBelow < CALENDAR_HEIGHT && clientRect.y > spaceBelow) {
      overlayY = Math.max(0, clientRect.y - CALENDAR_HEIGHT);
    }
    const overlayX = Math.max(0, Math.min(clientRect.x, screenWidth - CALENDAR_WIDTH));

    this.overlay = new CalendarOverlayWidget(this, overlayX, overlayY);
    screen.addOverlay(this.overlay);
    this.overlayScreen = screen;
    App.instance?.queueRender();
  }

  /** Close the calendar popover without committing a selection. */
  public closeCalendar(): void {
    if (!this.isOpen) return;
    this.isOpen = false;

    const screen = this.overlayScreen ?? this.getScreen();
    if (screen && this.overlay) screen.removeOverlay(this.overlay);
    this.overlay = null;
    this.overlayScreen = null;
    App.instance?.queueRender();
  }

  /** Move the displayed month by `delta` months, keeping the cursor's day-of-month (clamped). */
  public shiftMonth(delta: number): void {
    this.cursorDate = addMonths(this.cursorDate, delta);
    this.viewMonth = startOfMonth(this.cursorDate);
    App.instance?.queueRender();
  }

  /** Open the 12-month grid in place of the day grid. */
  public openMonthPicker(): void {
    this.headerFocus = "month";
    this.subPicker = "month";
    this.subPickerIndex = this.viewMonth.getMonth();
    App.instance?.queueRender();
  }

  /** Open the 12-year grid (a range centered on the displayed year) in place of the day grid. */
  public openYearPicker(): void {
    this.headerFocus = "year";
    this.subPicker = "year";
    this.yearRangeStart = this.viewMonth.getFullYear() - 5;
    this.subPickerIndex = this.viewMonth.getFullYear() - this.yearRangeStart;
    App.instance?.queueRender();
  }

  /** Cancel the open sub-picker without changing the view, returning focus to its header zone. */
  public closeSubPicker(): void {
    this.subPicker = null;
    App.instance?.queueRender();
  }

  /** Commit the sub-picker cell at `index` (month name or year), then close it. */
  public commitSubPickerIndex(index: number): void {
    if (this.subPicker === "month") {
      const year = this.viewMonth.getFullYear();
      const day = this.cursorDate.getDate();
      const lastDay = new Date(year, index + 1, 0).getDate();
      this.cursorDate = new Date(year, index, Math.min(day, lastDay));
    } else if (this.subPicker === "year") {
      const year = this.yearRangeStart + index;
      const month = this.cursorDate.getMonth();
      const day = this.cursorDate.getDate();
      const lastDay = new Date(year, month + 1, 0).getDate();
      this.cursorDate = new Date(year, month, Math.min(day, lastDay));
    }
    this.viewMonth = startOfMonth(this.cursorDate);
    this.subPicker = null;
    App.instance?.queueRender();
  }

  /** Select `day` as the value and close the popover. */
  public commitDay(day: Date): void {
    this.value = formatISODate(day);
    this.onChange?.(this.value);
    this.validation.maybeValidate("change");
    this.closeCalendar();
  }

  /** The owning {@link Screen}, or null when detached. */
  public getScreen(): Screen | null {
    let current: any = this.parent;
    while (current) {
      if (current instanceof Screen) return current;
      current = current.parent;
    }
    return null;
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;
    if (ev.type === "press" && ev.button === "left") this.openCalendar();
  }

  /** True when {@link cursorDate} falls in the day grid's first displayed row — the edge past which Up moves focus to the header instead of the date. */
  private cursorInTopRow(): boolean {
    const monthStart = startOfMonth(this.cursorDate);
    const firstWeekday = monthStart.getDay();
    return Math.floor((this.cursorDate.getDate() - 1 + firstWeekday) / 7) === 0;
  }

  private handleDateKey(ev: any): void {
    const keyName = ev.name || ev.key;

    if (!this.isOpen) {
      if (keyName === "enter" || keyName === "space" || keyName === " " || keyName === "down") {
        this.openCalendar();
        ev.handled = true;
      }
      return;
    }

    // Tab always moves focus off the field, regardless of what's focused inside the popover.
    if (keyName === "tab") {
      this.closeCalendar();
      return;
    }

    if (this.subPicker) {
      this.handleSubPickerKey(keyName, ev);
      return;
    }

    if (this.headerFocus !== "grid") {
      this.handleHeaderZoneKey(keyName, ev);
      return;
    }

    if (keyName === "left") {
      this.cursorDate = addDays(this.cursorDate, -1);
      this.viewMonth = startOfMonth(this.cursorDate);
      ev.handled = true;
    } else if (keyName === "right") {
      this.cursorDate = addDays(this.cursorDate, 1);
      this.viewMonth = startOfMonth(this.cursorDate);
      ev.handled = true;
    } else if (keyName === "up") {
      if (this.cursorInTopRow()) {
        this.headerFocus = "month";
      } else {
        this.cursorDate = addDays(this.cursorDate, -7);
        this.viewMonth = startOfMonth(this.cursorDate);
      }
      ev.handled = true;
    } else if (keyName === "down") {
      this.cursorDate = addDays(this.cursorDate, 7);
      this.viewMonth = startOfMonth(this.cursorDate);
      ev.handled = true;
    } else if (keyName === "pageup") {
      this.shiftMonth(-1);
      ev.handled = true;
    } else if (keyName === "pagedown") {
      this.shiftMonth(1);
      ev.handled = true;
    } else if (keyName === "space" || keyName === " " || keyName === "enter") {
      this.commitDay(this.cursorDate);
      ev.handled = true;
    } else if (keyName === "escape") {
      this.closeCalendar();
      ev.handled = true;
    }
  }

  /** Keyboard handling while a header zone (chevron, month, or year text) has focus. */
  private handleHeaderZoneKey(keyName: string, ev: any): void {
    const zones: HeaderZone[] = ["prev", "month", "year", "next"];
    const i = zones.indexOf(this.headerFocus as (typeof zones)[number]);

    if (keyName === "left") {
      this.headerFocus = zones[(i - 1 + zones.length) % zones.length];
      ev.handled = true;
    } else if (keyName === "right") {
      this.headerFocus = zones[(i + 1) % zones.length];
      ev.handled = true;
    } else if (keyName === "down") {
      this.headerFocus = "grid";
      ev.handled = true;
    } else if (keyName === "space" || keyName === " " || keyName === "enter") {
      if (this.headerFocus === "prev") this.shiftMonth(-1);
      else if (this.headerFocus === "next") this.shiftMonth(1);
      else if (this.headerFocus === "month") this.openMonthPicker();
      else if (this.headerFocus === "year") this.openYearPicker();
      ev.handled = true;
    } else if (keyName === "escape") {
      this.closeCalendar();
      ev.handled = true;
    }
  }

  /** Keyboard handling while the month/year sub-picker grid has focus. */
  private handleSubPickerKey(keyName: string, ev: any): void {
    if (keyName === "left") {
      this.subPickerIndex = Math.max(0, this.subPickerIndex - 1);
      ev.handled = true;
    } else if (keyName === "right") {
      this.subPickerIndex = Math.min(11, this.subPickerIndex + 1);
      ev.handled = true;
    } else if (keyName === "up") {
      this.subPickerIndex = Math.max(0, this.subPickerIndex - SUB_COLS);
      ev.handled = true;
    } else if (keyName === "down") {
      this.subPickerIndex = Math.min(11, this.subPickerIndex + SUB_COLS);
      ev.handled = true;
    } else if (this.subPicker === "year" && keyName === "pageup") {
      this.yearRangeStart -= 12;
      ev.handled = true;
    } else if (this.subPicker === "year" && keyName === "pagedown") {
      this.yearRangeStart += 12;
      ev.handled = true;
    } else if (keyName === "space" || keyName === " " || keyName === "enter") {
      this.commitSubPickerIndex(this.subPickerIndex);
      ev.handled = true;
    } else if (keyName === "escape") {
      this.closeSubPicker();
      ev.handled = true;
    }
  }

  public override onUnmount(): void {
    this.closeCalendar();
    super.onUnmount();
  }

  protected override resolveBorderColor(): string | undefined {
    const severityColor = this.validation.resolveColor();
    if (severityColor) return severityColor;
    if (this.focused && this.style.borderColor === undefined && App.instance) {
      return App.instance.cssResolver.resolveVariable(this, "$focus");
    }
    return super.resolveBorderColor();
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const contentRect = this.getContentRect();

    const fg = this.computedStyle.color || "default";
    const bg = this.findResolvedBackground();
    const disabled = this.isDisabled();

    let displayColor = fg;
    if (disabled) {
      displayColor = App.instance?.cssResolver.resolveVariable(this, "$disabled") || fg;
    } else if (this.focused) {
      displayColor = App.instance?.cssResolver.resolveVariable(this, "$focus") || fg;
    }
    const textStyle = new Style({ color: displayColor, background: bg });

    let displayLabel = this.value || this.placeholder;
    const maxTextWidth = contentRect.width - 2; // 1 for the icon + 1 spacing
    if (stringWidth(displayLabel) > maxTextWidth) {
      displayLabel = `${displayLabel.slice(0, Math.max(0, maxTextWidth - 1))}…`;
    }
    const style =
      this.value === ""
        ? new Style({
            color: App.instance?.cssResolver.resolveVariable(this, "$placeholder") || "gray",
            background: bg,
          })
        : textStyle;

    buffer.drawSegment(contentRect.x, contentRect.y, new Segment(displayLabel, style), contentRect);

    const iconX = contentRect.right - 1;
    buffer.setCell(iconX, contentRect.y, this.isOpen ? "▲" : "▾", textStyle);
  }
}
