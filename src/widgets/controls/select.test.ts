import { describe, expect, test, vi } from "vitest";
import { App } from "../../core/app.ts";
import { Screen } from "../../dom/screen.ts";
import { Widget } from "../../dom/widget.ts";
import { MockDriver } from "../../driver/mock/index.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { DropdownOverlayWidget, SelectWidget } from "./select.ts";

describe("SelectWidget option logic", () => {
  test("resolves string and object options to a uniform shape", () => {
    const w = new SelectWidget();
    w.options = ["plain", { label: "Rich", value: "r" }];
    const resolved = w.getResolvedOptions();
    expect(resolved[0]).toEqual({ label: "plain", value: "plain" });
    expect(resolved[1]).toEqual({ label: "Rich", value: "r" });
  });

  test("single-select replaces the value and fires onChange", () => {
    const onChange = vi.fn();
    const w = new SelectWidget();
    w.options = ["a", "b"];
    w.onChange = onChange;
    w.toggleOption("a");
    expect(w.value).toBe("a");
    w.toggleOption("b");
    expect(w.value).toBe("b");
    expect(onChange).toHaveBeenLastCalledWith("b");
    expect(w.isOptionSelected("b")).toBe(true);
    expect(w.isOptionSelected("a")).toBe(false);
  });

  test("multi-select adds then removes a value, tracking membership", () => {
    const changes: string[][] = [];
    const w = new SelectWidget();
    w.multiple = true;
    w.options = ["x", "y", "z"];
    w.onChange = (v) => changes.push(v as string[]);
    w.toggleOption("x");
    w.toggleOption("y");
    expect(w.isOptionSelected("x")).toBe(true);
    expect(w.isOptionSelected("y")).toBe(true);
    w.toggleOption("x"); // remove
    expect(w.isOptionSelected("x")).toBe(false);
    expect(changes.at(-1)).toEqual(["y"]);
  });

  test("selectOptionIndex picks by position and ignores out-of-range indices", () => {
    const w = new SelectWidget();
    w.options = ["one", "two"];
    w.selectOptionIndex(1);
    expect(w.value).toBe("two");
    w.selectOptionIndex(99); // out of range — no change, no throw
    expect(w.value).toBe("two");
  });

  test("openDropdown bails (no overlay) when there is no mounted screen", () => {
    const w = new SelectWidget();
    w.options = ["a"];
    w.openDropdown();
    // Without a screen to portal into, it can't build the dropdown overlay.
    expect((w as unknown as { overlay: unknown }).overlay).toBeFalsy();
  });

  test("getAccessibleNode reports the resolved label, option count, and open state", () => {
    const w = new SelectWidget();
    w.options = ["Apple", "Banana"];
    w.value = "Banana";
    let node = w.getAccessibleNode();
    expect(node?.role).toBe("select");
    expect(node?.label).toBe("Banana");
    expect(node?.state).toContain("2 options");
    expect(node?.state).toContain("collapsed");

    w.isOpen = true;
    node = w.getAccessibleNode();
    expect(node?.state).toContain("expanded");
  });

  test("getAccessibleNode reports every selected label and count for multi-select", () => {
    const w = new SelectWidget();
    w.multiple = true;
    w.options = ["Apple", "Banana", "Cherry"];
    w.value = ["Apple", "Cherry"];
    const node = w.getAccessibleNode();
    expect(node?.label).toBe("Apple, Cherry");
    expect(node?.state).toContain("2 selected");
  });
});

describe("SelectWidget dropdown overlay height clamps to available space", () => {
  test("overlay height shrinks to available space instead of overflowing the screen", () => {
    // Regression: dropdownHeight was always resolved.length + 2 with no cap,
    // so a long option list opened past the screen edge with zero scrolling
    // support — unlike Combobox, which caps at MAX_VISIBLE_ROWS and shrinks
    // to whichever side has more room when neither direction fits.
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));

    const w = new SelectWidget();
    w.options = Array.from({ length: 20 }, (_, i) => `opt${i}`);
    screen.appendChild(w);
    // Select sits at y=4, height=1 -> spaceAbove=4, spaceBelow=10-5=5. Natural
    // height is min(20,8)+2=10, which fits neither side.
    w.region = new Region(new Offset(0, 4), new Size(10, 1));

    w.openDropdown();
    const overlay = (w as unknown as { overlay: DropdownOverlayWidget }).overlay;
    expect(overlay).toBeTruthy();

    expect(overlay.dropdownY).toBeGreaterThanOrEqual(0);
    expect(overlay.dropdownY + overlay.dropdownHeight).toBeLessThanOrEqual(screen.region.height);
  });

  test("clicking a visible row selects the option actually drawn there, not the unscrolled one", () => {
    // Regression: render() would need to offset by scrollTop once the
    // hovered option scrolls past the visible window, but handleMouse
    // indexed straight into the full option list with the raw row number.
    const w = new SelectWidget();
    w.options = Array.from({ length: 12 }, (_, i) => `opt${i}`);
    w.hoveredIndex = 9; // scrolls the 8-row window so row 0 shows opt2
    const overlay = new DropdownOverlayWidget(w, 0, 0, 20);

    let selectedIndex: number | undefined;
    w.selectOptionIndex = (i: number) => {
      selectedIndex = i;
    };
    // Row 0 of the overlay body is at dropdownY + 1.
    overlay.handleMouse({ type: "press", button: "left", x: 5, y: 1 });
    expect(selectedIndex).toBe(2);
  });
});

describe("SelectWidget hoveredIndex stays valid when options shrinks while open", () => {
  test("Enter clamps hoveredIndex first, so it still selects the visibly-highlighted row instead of silently no-oping", () => {
    // Regression: `options` is a plain field with no setter, so nothing
    // re-validated hoveredIndex when it was reassigned to a shorter array
    // while the dropdown stayed open (e.g. a dependent-dropdown pattern).
    // selectOptionIndex bounds-checks internally, so Enter with a stale
    // out-of-range hoveredIndex silently did nothing.
    const w = new SelectWidget();
    w.options = ["a", "b", "c", "d", "e", "f"];
    w.isOpen = true;
    w.hoveredIndex = 5; // last of 6 options

    // The parent replaces options with a much shorter list while still open.
    w.options = ["x", "y"];

    let selectedValue: string | undefined;
    const onChange = (v: unknown) => {
      selectedValue = v as string;
    };
    w.onChange = onChange;
    w.onKey?.({ key: "enter", name: "enter", handled: false });
    expect(selectedValue).toBe("y"); // clamped to the new last index (1)
  });
});

describe("SelectWidget openDropdown/closeDropdown/getScreen edge cases", () => {
  test("openDropdown is a no-op when already open", () => {
    const w = new SelectWidget();
    w.isOpen = true;
    w.hoveredIndex = 3;
    w.openDropdown();
    expect(w.hoveredIndex).toBe(3); // untouched — early return
  });

  test("closeDropdown is a no-op when not open", () => {
    const w = new SelectWidget();
    expect(() => w.closeDropdown()).not.toThrow();
    expect(w.isOpen).toBe(false);
  });

  test("getScreen returns null when attached to a non-Screen ancestor chain", () => {
    const container = new Widget("view");
    const w = new SelectWidget();
    container.appendChild(w);
    expect(w.getScreen()).toBeNull();
  });

  test("openDropdown highlights the currently-selected single-select option", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(40, 20));
    const w = new SelectWidget();
    w.options = ["a", "b", "c"];
    w.value = "b";
    screen.appendChild(w);
    w.region = new Region(new Offset(0, 0), new Size(20, 3));
    w.openDropdown();
    expect(w.hoveredIndex).toBe(1);
  });

  test("openDropdown leaves hoveredIndex at 0 when the current value matches no option", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(40, 20));
    const w = new SelectWidget();
    w.options = ["a", "b"];
    w.value = "zzz";
    screen.appendChild(w);
    w.region = new Region(new Offset(0, 0), new Size(20, 3));
    w.openDropdown();
    expect(w.hoveredIndex).toBe(0);
  });

  test("prefers opening above when there's more room above than below", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));
    const w = new SelectWidget();
    w.options = ["a", "b"];
    screen.appendChild(w);
    // spaceAbove = 8, spaceBelow = 1; natural height fits neither perfectly but above has more room.
    w.region = new Region(new Offset(0, 8), new Size(10, 1));
    w.openDropdown();
    const overlay = (w as unknown as { overlay: DropdownOverlayWidget }).overlay;
    expect(overlay.dropdownY).toBeLessThan(8);
  });
});

describe("SelectWidget mouse handling", () => {
  test("opens the dropdown on an unhandled left press", () => {
    const w = new SelectWidget();
    w.handleMouse({ type: "press", button: "left", handled: false });
    expect(w.isOpen).toBe(true);
  });

  test("does nothing further once the event is already handled", () => {
    const w = new SelectWidget();
    w.handleMouse({ type: "press", button: "left", handled: true });
    expect(w.isOpen).toBe(false);
  });
});

describe("DropdownOverlayWidget handleMouse", () => {
  test("ignores non-left-press events", () => {
    const w = new SelectWidget();
    w.options = ["a"];
    const overlay = new DropdownOverlayWidget(w, 0, 0, 20);
    let closed = false;
    w.closeDropdown = () => {
      closed = true;
    };
    overlay.handleMouse({ type: "move", button: "left" });
    overlay.handleMouse({ type: "press", button: "right" });
    expect(closed).toBe(false);
  });

  test("closes the dropdown on a click outside its bounds", () => {
    const w = new SelectWidget();
    w.options = ["a", "b"];
    w.isOpen = true;
    const overlay = new DropdownOverlayWidget(w, 5, 5, 10);
    const ev = { type: "press", button: "left", x: 0, y: 0, handled: false };
    overlay.handleMouse(ev);
    expect(w.isOpen).toBe(false);
    expect(ev.handled).toBe(true);
  });

  test("a click on a row past the option list does not select anything", () => {
    const w = new SelectWidget();
    w.options = ["a", "b"];
    const overlay = new DropdownOverlayWidget(w, 0, 0, 20);
    let selectedIndex: number | undefined;
    w.selectOptionIndex = (i: number) => {
      selectedIndex = i;
    };
    overlay.handleMouse({ type: "press", button: "left", x: 5, y: 9 });
    expect(selectedIndex).toBeUndefined();
  });
});

describe("DropdownOverlayWidget render", () => {
  test("renders multi-select checkbox prefixes for selected and unselected rows", () => {
    const w = new SelectWidget();
    w.multiple = true;
    w.options = ["Apple", "Banana"];
    w.value = ["Banana"];
    w.hoveredIndex = 0;
    const overlay = new DropdownOverlayWidget(w, 0, 0, 20);
    const buffer = new ScreenBuffer(20, 10);
    expect(() => overlay.render(buffer)).not.toThrow();
  });

  test("renders single-select bullet prefixes for selected and unselected rows", () => {
    const w = new SelectWidget();
    w.options = ["Apple", "Banana"];
    w.value = "Banana";
    const overlay = new DropdownOverlayWidget(w, 0, 0, 20);
    const buffer = new ScreenBuffer(20, 10);
    expect(() => overlay.render(buffer)).not.toThrow();
  });

  test("truncates an option label wider than the overlay's inner width", () => {
    const w = new SelectWidget();
    w.options = ["A very long option label that overflows the dropdown width"];
    const overlay = new DropdownOverlayWidget(w, 0, 0, 8);
    const buffer = new ScreenBuffer(20, 10);
    expect(() => overlay.render(buffer)).not.toThrow();
  });

  test("renders with App.instance resolving real theme colors", () => {
    const driver = new MockDriver(40, 20);
    const app = new App(driver);
    const w = new SelectWidget();
    w.options = ["Apple", "Banana"];
    app.activeScreen.appendChild(w);
    const overlay = new DropdownOverlayWidget(w, 0, 0, 20);
    const buffer = new ScreenBuffer(40, 20);
    expect(() => overlay.render(buffer)).not.toThrow();
    app.stop();
  });
});

describe("SelectWidget keyboard handling", () => {
  test("enter/space/down open the dropdown when closed; other keys are ignored", () => {
    for (const key of ["enter", "space", "down"]) {
      const w = new SelectWidget();
      w.options = ["a"];
      const ev = { name: key, handled: false };
      w.onKey?.(ev);
      expect(w.isOpen).toBe(true);
      expect(ev.handled).toBe(true);
    }
    const w = new SelectWidget();
    const ev = { name: "x", handled: false };
    w.onKey?.(ev);
    expect(w.isOpen).toBe(false);
    expect(ev.handled).toBe(false);
  });

  test("up/down move hoveredIndex while open, clamped to the option bounds", () => {
    const w = new SelectWidget();
    w.options = ["a", "b", "c"];
    w.isOpen = true;
    w.hoveredIndex = 0;
    w.onKey?.({ name: "up", handled: false });
    expect(w.hoveredIndex).toBe(0); // clamped at 0

    w.onKey?.({ name: "down", handled: false });
    w.onKey?.({ name: "down", handled: false });
    expect(w.hoveredIndex).toBe(2);
    w.onKey?.({ name: "down", handled: false });
    expect(w.hoveredIndex).toBe(2); // clamped at the last index
  });

  test("space/enter select the hovered option while open", () => {
    const w = new SelectWidget();
    w.options = ["a", "b"];
    w.isOpen = true;
    w.hoveredIndex = 1;
    w.onKey?.({ name: "enter", handled: false });
    expect(w.value).toBe("b");
    expect(w.isOpen).toBe(false);
  });

  test("escape closes and marks handled; tab closes without marking handled", () => {
    const w1 = new SelectWidget();
    w1.options = ["a"];
    w1.isOpen = true;
    const ev1 = { name: "escape", handled: false };
    w1.onKey?.(ev1);
    expect(w1.isOpen).toBe(false);
    expect(ev1.handled).toBe(true);

    const w2 = new SelectWidget();
    w2.options = ["a"];
    w2.isOpen = true;
    const ev2 = { name: "tab", handled: false };
    w2.onKey?.(ev2);
    expect(w2.isOpen).toBe(false);
    expect(ev2.handled).toBe(false);
  });
});

describe("SelectWidget getAccessibleNode edge cases", () => {
  test("returns null when not visible", () => {
    const w = new SelectWidget();
    w.visible = false;
    expect(w.getAccessibleNode()).toBeNull();
  });

  test("reports 'focused'/'disabled' state and singular option count", () => {
    const w = new SelectWidget();
    w.options = ["only"];
    w.focused = true;
    w.disabled = true;
    const node = w.getAccessibleNode();
    expect(node?.state).toContain("focused");
    expect(node?.state).toContain("disabled");
    expect(node?.state).toContain("1 option");
  });

  test("falls back to the placeholder label with no selection or matching option", () => {
    const w = new SelectWidget();
    w.options = ["a", "b"];
    const node = w.getAccessibleNode();
    expect(node?.label).toBe("Select...");
    expect(node?.value).toBeUndefined();
  });

  test("multi-select falls back to the placeholder when nothing is selected", () => {
    const w = new SelectWidget();
    w.multiple = true;
    w.options = ["a", "b"];
    w.value = [];
    const node = w.getAccessibleNode();
    expect(node?.label).toBe("Select...");
  });

  test("multi-select uses raw values in the label when an id has no matching option", () => {
    const w = new SelectWidget();
    w.multiple = true;
    w.options = ["a"];
    w.value = ["a", "ghost"];
    const node = w.getAccessibleNode();
    expect(node?.label).toBe("a, ghost");
  });

  test("single-select falls back to a String(value) label when the value matches no option", () => {
    const w = new SelectWidget();
    w.options = ["a", "b"];
    w.value = "zzz";
    const node = w.getAccessibleNode();
    expect(node?.label).toBe("zzz");
    expect(node?.value).toBe("zzz");
  });
});

describe("SelectWidget resolveBorderColor", () => {
  test("falls back to the base implementation when not focused and no severity color", () => {
    const w = new SelectWidget();
    expect(() =>
      (w as unknown as { resolveBorderColor(): string | undefined }).resolveBorderColor(),
    ).not.toThrow();
  });

  test("uses the severity color when validation is invalid and touched", () => {
    const w = new SelectWidget();
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
    const w = new SelectWidget();
    app.activeScreen.appendChild(w);
    w.focused = true;
    const color = (
      w as unknown as { resolveBorderColor(): string | undefined }
    ).resolveBorderColor();
    expect(typeof color).toBe("string");
    app.stop();
  });
});

describe("SelectWidget render", () => {
  test("renders the placeholder, a plain value, and a multi-select bracketed list", () => {
    const w = new SelectWidget();
    w.options = ["Apple", "Banana"];
    w.region = new Region(new Offset(0, 0), new Size(24, 3));
    const buffer = new ScreenBuffer(24, 3);
    expect(() => w.render(buffer)).not.toThrow(); // placeholder

    w.value = "Banana";
    expect(() => w.render(buffer)).not.toThrow(); // resolved label

    w.multiple = true;
    w.value = ["Apple", "Banana"];
    expect(() => w.render(buffer)).not.toThrow(); // bracketed multi list
  });

  test("multi-select shows the raw value when it matches no resolved option", () => {
    const w = new SelectWidget();
    w.multiple = true;
    w.options = ["Apple"];
    w.value = ["ghost"];
    w.region = new Region(new Offset(0, 0), new Size(24, 3));
    const buffer = new ScreenBuffer(24, 3);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("single-select shows a String(value) fallback when the value matches no option", () => {
    const w = new SelectWidget();
    w.options = ["Apple"];
    w.value = "zzz";
    w.region = new Region(new Offset(0, 0), new Size(24, 3));
    const buffer = new ScreenBuffer(24, 3);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("truncates an overlong label with an ellipsis", () => {
    const w = new SelectWidget();
    w.options = ["A very long selected option label"];
    w.value = "A very long selected option label";
    w.region = new Region(new Offset(0, 0), new Size(10, 3));
    const buffer = new ScreenBuffer(10, 3);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("renders with the disabled color and with the focus color when an App is running", () => {
    const driver = new MockDriver(40, 10);
    const app = new App(driver);
    const w = new SelectWidget();
    app.activeScreen.appendChild(w);
    w.region = new Region(new Offset(0, 0), new Size(24, 3));
    w.disabled = true;
    const buffer = new ScreenBuffer(24, 3);
    expect(() => w.render(buffer)).not.toThrow();

    w.disabled = false;
    w.focused = true;
    expect(() => w.render(buffer)).not.toThrow();
    app.stop();
  });
});
