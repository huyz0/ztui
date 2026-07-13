import { describe, expect, test, vi } from "vitest";
import { Screen } from "../../dom/screen.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { ComboboxOverlayWidget, ComboboxWidget } from "./combobox.ts";

describe("ComboboxWidget option logic", () => {
  test("resolves string and object options to a uniform shape", () => {
    const w = new ComboboxWidget();
    w.options = ["plain", { label: "Rich", value: "r" }];
    const resolved = w.getResolvedOptions();
    expect(resolved[0]).toEqual({ label: "plain", value: "plain" });
    expect(resolved[1]).toEqual({ label: "Rich", value: "r" });
  });

  test("filters options case-insensitively by substring", () => {
    const w = new ComboboxWidget();
    w.options = ["Apple", "Banana", "Cherry", "apricot"];
    w.value = "ap";
    const labels = w.getFilteredOptions().map((o) => o.label);
    expect(labels).toEqual(["Apple", "apricot"]);
  });

  test("empty value shows every option", () => {
    const w = new ComboboxWidget();
    w.options = ["a", "b", "c"];
    w.value = "";
    expect(w.getFilteredOptions().length).toBe(3);
  });

  test("selectOption commits the label, fires onChange/onSelect, and closes", () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    const w = new ComboboxWidget();
    w.options = ["Apple", "Banana"];
    w.onChange = onChange;
    w.onSelect = onSelect;
    w.isOpen = true;
    w.selectOption({ label: "Banana", value: "Banana" });
    expect(w.value).toBe("Banana");
    expect(onChange).toHaveBeenCalledWith("Banana");
    expect(onSelect).toHaveBeenCalledWith({ label: "Banana", value: "Banana" });
    expect(w.isOpen).toBe(false);
  });

  test("allowCustomValue: false clears a typed value with zero matches on close", () => {
    const w = new ComboboxWidget();
    w.options = ["Apple", "Banana"];
    w.allowCustomValue = false;
    w.value = "zzz";
    w.isOpen = true;
    w.closeDropdown();
    expect(w.value).toBe(""); // no matches at all -> cleared
  });

  test("allowCustomValue: false reverts to the value shown on open, not an arbitrary filtered match", () => {
    // Regression: closing with some (but no exact) matches used to commit
    // filtered[0] — an option the user never picked — instead of reverting to
    // the last valid selection.
    const w = new ComboboxWidget();
    w.options = ["Apple", "Apricot", "Banana"];
    w.allowCustomValue = false;
    w.value = "Banana";
    w.openDropdown();
    w.value = "Ap"; // narrows to Apple/Apricot, matching neither exactly
    w.closeDropdown();
    expect(w.value).toBe("Banana");
  });

  test("allowCustomValue: true (default) keeps a non-matching typed value on close", () => {
    const w = new ComboboxWidget();
    w.options = ["Apple", "Banana"];
    w.value = "zzz";
    w.isOpen = true;
    w.closeDropdown();
    expect(w.value).toBe("zzz");
  });

  test("openDropdown bails (no overlay) when there is no mounted screen", () => {
    const w = new ComboboxWidget();
    w.options = ["a"];
    w.openDropdown();
    expect((w as unknown as { overlay: unknown }).overlay).toBeFalsy();
  });
});

describe("ComboboxOverlayWidget click hit-testing when the list is scrolled", () => {
  test("clicking a visible row selects the option actually drawn there, not the unscrolled one", () => {
    // Regression: render() offsets by `scrollTop` once the highlighted option
    // scrolls past the visible window, but handleMouse used to index straight
    // into `filtered` with the raw row number, selecting the wrong option.
    const w = new ComboboxWidget();
    w.options = Array.from({ length: 12 }, (_, i) => `opt${i}`);
    w.highlightedIndex = 9; // scrolls the 8-row window so row 0 shows opt2
    const overlay = new ComboboxOverlayWidget(w, 0, 0, 20);

    let selected: unknown;
    w.selectOption = (opt: unknown) => {
      selected = opt;
    };
    // Row 0 of the overlay body is at overlayY + 1.
    overlay.handleMouse({ type: "press", button: "left", x: 5, y: 1 });
    expect((selected as { label: string }).label).toBe("opt2");
  });
});

describe("ComboboxWidget highlightedIndex stays valid as the filtered list shrinks", () => {
  test("delete clamps highlightedIndex so Enter still selects the visibly-highlighted row, not nothing", () => {
    // Regression: highlightedIndex was never re-clamped when backspace/delete
    // narrowed the filtered list, so Enter would index past the (now shorter)
    // array and fall through to closeDropdown() instead of selecting anything.
    const w = new ComboboxWidget();
    w.options = ["ax", "ay"]; // "a" matches both; "az" (typed below) matches neither
    w.value = "a";
    w.isOpen = true;
    (w as any).cursorCol = 1;
    expect(w.getFilteredOptions().length).toBe(2);
    w.highlightedIndex = 1; // highlight the last (2nd) match

    // Type "z": narrows the filter to zero matches, well below highlightedIndex=1.
    w.onKey?.({ key: "z", name: "z", handled: false });
    expect(w.getFilteredOptions().length).toBe(0);
    // Typing already resets highlightedIndex to 0 — exercise the other path:
    // delete the "z" back out via backspace, re-narrowing again.
    w.highlightedIndex = 5; // force out-of-range as if content changed elsewhere
    w.onKey?.({ key: "backspace", name: "backspace", handled: false });
    // Back to "a", 2 matches — highlightedIndex must be a valid index again.
    expect(w.getFilteredOptions().length).toBe(2);
    expect(w.highlightedIndex).toBeLessThan(w.getFilteredOptions().length);

    let selected: unknown;
    w.selectOption = (opt: unknown) => {
      selected = opt;
    };
    w.onKey?.({ key: "enter", name: "enter", handled: false });
    expect(selected).toBeDefined();
  });
});

describe("ComboboxWidget overlay placement when neither direction fits", () => {
  test("overlay height shrinks to available space instead of overflowing the screen", () => {
    // Regression: the "flip above" branch only checked spaceBelow < overlayHeight
    // && spaceAbove > spaceBelow, with no re-check that spaceAbove actually
    // fits either. When both directions are smaller than the natural overlay
    // height, it opened at the natural height anyway and overflowed the screen.
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));

    const w = new ComboboxWidget();
    // Enough options that the natural overlay height (rows+2, capped at 10)
    // exceeds either the space above or below a combobox near mid-screen.
    w.options = Array.from({ length: 20 }, (_, i) => `opt${i}`);
    screen.appendChild(w);
    // Combobox sits at y=4, height=1 -> spaceAbove=4, spaceBelow=10-5=5. Natural
    // height is min(20,8)+2=10, which fits neither side.
    w.region = new Region(new Offset(0, 4), new Size(10, 1));

    w.openDropdown();
    const overlay = (w as unknown as { overlay: any }).overlay;
    expect(overlay).toBeTruthy();

    // The overlay must end within the screen in both directions.
    expect(overlay.overlayY).toBeGreaterThanOrEqual(0);
    // biome-ignore lint/complexity/useLiteralKeys: intentional bracket access to a private method for testing
    expect(overlay.overlayY + overlay["overlayHeight"]()).toBeLessThanOrEqual(screen.region.height);
  });
});
