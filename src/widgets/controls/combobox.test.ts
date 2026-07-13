import { describe, expect, test, vi } from "vitest";
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
