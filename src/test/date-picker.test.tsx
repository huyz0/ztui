import { describe, expect, test } from "vitest";
import { DatePicker } from "../react.ts";
import { mountApp } from "./harness.tsx";

describe("DatePicker", () => {
  test("opens on click, navigates days with arrows, and commits with Enter", async () => {
    let value = "";
    const { screen, findById } = await mountApp(
      <DatePicker
        id="dp"
        value={value}
        onChange={(v) => {
          value = v;
        }}
      />,
      { cols: 40, rows: 20 },
    );

    const dp = findById("dp");
    expect(dp.isOpen).toBe(false);

    dp.handleMouse({ type: "press", button: "left" });
    expect(dp.isOpen).toBe(true);
    expect(screen.overlays.length).toBe(1);

    const startDay = dp.cursorDate.getDate();
    dp.handleKey({ key: "right" });
    expect(dp.cursorDate.getDate()).toBe(
      new Date(dp.cursorDate.getFullYear(), dp.cursorDate.getMonth(), startDay + 1).getDate(),
    );

    dp.handleKey({ key: "enter" });
    expect(dp.isOpen).toBe(false);
    expect(screen.overlays.length).toBe(0);
    expect(value).toBe(dp.value);
    expect(value).not.toBe("");
  });

  test("pageup/pagedown navigate months without committing a selection", async () => {
    const { findById } = await mountApp(<DatePicker id="dp" />, { cols: 40, rows: 20 });
    const dp = findById("dp");

    dp.handleKey({ key: "enter" }); // open
    const startMonth = dp.viewMonth.getMonth();
    dp.handleKey({ key: "pagedown" });
    expect(dp.viewMonth.getMonth()).toBe((startMonth + 1) % 12);
    expect(dp.value).toBe(""); // navigating months doesn't select a day
  });

  test("Escape closes without changing the value", async () => {
    const { findById } = await mountApp(<DatePicker id="dp" value="2026-07-13" />, {
      cols: 40,
      rows: 20,
    });
    const dp = findById("dp");

    dp.handleKey({ key: "enter" }); // open
    expect(dp.isOpen).toBe(true);
    dp.handleKey({ key: "escape" });
    expect(dp.isOpen).toBe(false);
    expect(dp.value).toBe("2026-07-13");
  });

  test("clicking outside the popover closes it", async () => {
    const { screen, findById } = await mountApp(<DatePicker id="dp" />, { cols: 40, rows: 20 });
    const dp = findById("dp");

    dp.handleMouse({ type: "press", button: "left" });
    expect(dp.isOpen).toBe(true);

    const overlay = screen.overlays[0];
    overlay.handleMouse({ type: "press", button: "left", x: 0, y: 0 });
    expect(dp.isOpen).toBe(false);
    expect(screen.overlays.length).toBe(0);
  });
});
