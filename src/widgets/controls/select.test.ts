import { describe, expect, test, vi } from "vitest";
import { Screen } from "../../dom/screen.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
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
