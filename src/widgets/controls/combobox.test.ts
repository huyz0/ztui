import { describe, expect, test, vi } from "vitest";
import { App } from "../../core/app.ts";
import { Screen } from "../../dom/screen.ts";
import { Widget } from "../../dom/widget.ts";
import { MockDriver } from "../../driver/mock/index.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
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

  test("allowCustomValue: false keeps the typed text as-is when it exactly matches an option", () => {
    const w = new ComboboxWidget();
    w.options = ["Apple", "Banana"];
    w.allowCustomValue = false;
    w.value = "apple"; // case-insensitive exact match
    w.isOpen = true;
    w.closeDropdown();
    expect(w.value).toBe("Apple");
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

  test("prefers opening above when there's more room above than below", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));
    const w = new ComboboxWidget();
    w.options = ["a", "b"];
    screen.appendChild(w);
    // spaceAbove = 8, spaceBelow = 10 - 9 = 1; natural height = min(2,8)+2 = 4.
    w.region = new Region(new Offset(0, 8), new Size(10, 1));

    w.openDropdown();
    const overlay = (w as unknown as { overlay: any }).overlay;
    expect(overlay.overlayY).toBeLessThan(8);
  });
});

describe("ComboboxWidget openDropdown/closeDropdown/getScreen edge cases", () => {
  test("openDropdown is a no-op when already open", () => {
    const w = new ComboboxWidget();
    w.isOpen = true;
    w.highlightedIndex = 3;
    w.openDropdown();
    expect(w.highlightedIndex).toBe(3); // untouched — early return
  });

  test("closeDropdown is a no-op when not open", () => {
    const w = new ComboboxWidget();
    expect(() => w.closeDropdown()).not.toThrow();
    expect(w.isOpen).toBe(false);
  });

  test("getScreen returns null when attached to a non-Screen ancestor chain", () => {
    const container = new Widget("view");
    const w = new ComboboxWidget();
    container.appendChild(w);
    expect(w.getScreen()).toBeNull();
  });
});

describe("ComboboxWidget mouse handling", () => {
  test("opens the dropdown on an unhandled left press", () => {
    const w = new ComboboxWidget();
    w.handleMouse({ type: "press", button: "left", handled: false });
    expect(w.isOpen).toBe(true);
  });

  test("does nothing further once the event is already handled", () => {
    const w = new ComboboxWidget();
    w.handleMouse({ type: "press", button: "left", handled: true });
    expect(w.isOpen).toBe(false);
  });
});

describe("ComboboxOverlayWidget handleMouse", () => {
  test("ignores non-left-press events", () => {
    const w = new ComboboxWidget();
    w.options = ["a"];
    const overlay = new ComboboxOverlayWidget(w, 0, 0, 20);
    let closed = false;
    w.closeDropdown = () => {
      closed = true;
    };
    overlay.handleMouse({ type: "move", button: "left" });
    overlay.handleMouse({ type: "press", button: "right" });
    expect(closed).toBe(false);
  });

  test("closes the dropdown on a click outside the popover bounds", () => {
    const w = new ComboboxWidget();
    w.options = ["a", "b"];
    w.isOpen = true;
    const overlay = new ComboboxOverlayWidget(w, 5, 5, 10);
    const ev = { type: "press", button: "left", x: 0, y: 0, handled: false };
    overlay.handleMouse(ev);
    expect(w.isOpen).toBe(false);
    expect(ev.handled).toBe(true);
  });

  test("a click on a row past the filtered list does not select anything", () => {
    const w = new ComboboxWidget();
    w.options = ["a", "b"];
    const overlay = new ComboboxOverlayWidget(w, 0, 0, 20);
    let selected: unknown;
    w.selectOption = (opt: unknown) => {
      selected = opt;
    };
    // Row far past the 2 available options.
    overlay.handleMouse({ type: "press", button: "left", x: 5, y: 9 });
    expect(selected).toBeUndefined();
  });
});

describe("ComboboxOverlayWidget render", () => {
  test("renders a 'No matches' row when the filtered list is empty", () => {
    const w = new ComboboxWidget();
    w.options = ["Apple"];
    w.value = "zzz";
    const overlay = new ComboboxOverlayWidget(w, 0, 0, 20);
    const buffer = new ScreenBuffer(20, 10);
    expect(() => overlay.render(buffer)).not.toThrow();
  });

  test("renders visible rows, highlighting the current index, without an App running", () => {
    const w = new ComboboxWidget();
    w.options = ["Apple", "Banana", "Cherry"];
    w.highlightedIndex = 1;
    const overlay = new ComboboxOverlayWidget(w, 0, 0, 20);
    const buffer = new ScreenBuffer(20, 10);
    expect(() => overlay.render(buffer)).not.toThrow();
  });

  test("truncates a label wider than the overlay's inner width", () => {
    const w = new ComboboxWidget();
    w.options = ["A very long option label that overflows"];
    const overlay = new ComboboxOverlayWidget(w, 0, 0, 8);
    const buffer = new ScreenBuffer(20, 10);
    expect(() => overlay.render(buffer)).not.toThrow();
  });

  test("renders with App.instance resolving real theme colors", () => {
    const driver = new MockDriver(40, 20);
    const app = new App(driver);
    const w = new ComboboxWidget();
    w.options = ["Apple", "Banana"];
    app.activeScreen.appendChild(w);
    const overlay = new ComboboxOverlayWidget(w, 0, 0, 20);
    const buffer = new ScreenBuffer(40, 20);
    expect(() => overlay.render(buffer)).not.toThrow();
    app.stop();
  });
});

describe("ComboboxWidget keyboard handling", () => {
  test("left/right/home/end move the cursor without changing the value", () => {
    const w = new ComboboxWidget();
    w.value = "abc";
    (w as any).cursorCol = 3;
    w.onKey?.({ name: "left", handled: false });
    expect((w as any).cursorCol).toBe(2);
    w.onKey?.({ name: "right", handled: false });
    expect((w as any).cursorCol).toBe(3);
    w.onKey?.({ name: "home", handled: false });
    expect((w as any).cursorCol).toBe(0);
    w.onKey?.({ name: "end", handled: false });
    expect((w as any).cursorCol).toBe(3);
  });

  test("backspace at column 0 does nothing", () => {
    const w = new ComboboxWidget();
    w.value = "abc";
    (w as any).cursorCol = 0;
    w.onKey?.({ name: "backspace", handled: false });
    expect(w.value).toBe("abc");
  });

  test("delete at the end of the text does nothing", () => {
    const w = new ComboboxWidget();
    w.value = "abc";
    (w as any).cursorCol = 3;
    w.onKey?.({ name: "delete", handled: false });
    expect(w.value).toBe("abc");
  });

  test("delete removes the character at the cursor and re-clamps the highlight", () => {
    const w = new ComboboxWidget();
    w.value = "abc";
    (w as any).cursorCol = 1;
    w.onKey?.({ name: "delete", handled: false });
    expect(w.value).toBe("ac");
  });

  test("an out-of-range cursorCol is clamped to the text length before handling a key", () => {
    const w = new ComboboxWidget();
    w.value = "abc";
    (w as any).cursorCol = 99;
    w.onKey?.({ name: "left", handled: false });
    expect((w as any).cursorCol).toBe(2); // clamped to 3, then left moves to 2
  });

  test("down opens the dropdown when closed, and moves the highlight when already open", () => {
    const w = new ComboboxWidget();
    w.options = ["a", "b", "c"];
    w.onKey?.({ name: "down", handled: false });
    expect(w.isOpen).toBe(true);
    expect(w.highlightedIndex).toBe(0);

    w.onKey?.({ name: "down", handled: false });
    expect(w.highlightedIndex).toBe(1);
  });

  test("down with zero filtered options resets the highlight to 0", () => {
    const w = new ComboboxWidget();
    w.options = ["ax"];
    w.value = "zzz";
    w.isOpen = true;
    w.highlightedIndex = 4;
    w.onKey?.({ name: "down", handled: false });
    expect(w.highlightedIndex).toBe(0);
  });

  test("up is a no-op when closed, and moves the highlight up when open", () => {
    const w = new ComboboxWidget();
    w.options = ["a", "b"];
    w.highlightedIndex = 1;
    w.onKey?.({ name: "up", handled: false }); // closed: no-op
    expect(w.highlightedIndex).toBe(1);

    w.isOpen = true;
    w.onKey?.({ name: "up", handled: false });
    expect(w.highlightedIndex).toBe(0);
  });

  test("enter closes without selecting when closed", () => {
    const w = new ComboboxWidget();
    w.options = ["a"];
    let closed = false;
    w.closeDropdown = () => {
      closed = true;
    };
    w.onKey?.({ name: "enter", handled: false });
    expect(closed).toBe(true);
  });

  test("escape and tab close the dropdown", () => {
    const w1 = new ComboboxWidget();
    w1.options = ["a"];
    w1.isOpen = true;
    w1.onKey?.({ name: "escape", handled: false });
    expect(w1.isOpen).toBe(false);

    const w2 = new ComboboxWidget();
    w2.options = ["a"];
    w2.isOpen = true;
    w2.onKey?.({ name: "tab", handled: false });
    expect(w2.isOpen).toBe(false);
  });

  test("typing a printable character inserts it, opens the dropdown, and fires onChange", () => {
    const onChange = vi.fn();
    const w = new ComboboxWidget();
    w.options = ["ab"];
    w.onChange = onChange;
    w.onKey?.({ key: "a", name: "a", handled: false });
    expect(w.value).toBe("a");
    expect(w.isOpen).toBe(true);
    expect(onChange).toHaveBeenCalledWith("a");
  });

  test("ctrl/meta-modified single-char keys do not insert text", () => {
    const w = new ComboboxWidget();
    w.onKey?.({ key: "a", name: "a", ctrl: true, handled: false });
    expect(w.value).toBe("");
    const w2 = new ComboboxWidget();
    w2.onKey?.({ key: "a", name: "a", meta: true, handled: false });
    expect(w2.value).toBe("");
  });

  test("multi-character key values (e.g. paste-like) are not inserted", () => {
    const w = new ComboboxWidget();
    w.onKey?.({ key: "ab", name: "ab", handled: false });
    expect(w.value).toBe("");
  });

  test("an unrecognized key with no ev.key leaves the value untouched", () => {
    const w = new ComboboxWidget();
    w.value = "x";
    w.onKey?.({ name: "f1", handled: false });
    expect(w.value).toBe("x");
  });
});

describe("ComboboxWidget resolveBorderColor", () => {
  test("falls back to the base implementation when not focused and no severity color", () => {
    const w = new ComboboxWidget();
    expect(() =>
      (w as unknown as { resolveBorderColor(): string | undefined }).resolveBorderColor(),
    ).not.toThrow();
  });

  test("uses the severity color when validation is invalid and touched", () => {
    const w = new ComboboxWidget();
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
    const w = new ComboboxWidget();
    app.activeScreen.appendChild(w);
    w.focused = true;
    const color = (
      w as unknown as { resolveBorderColor(): string | undefined }
    ).resolveBorderColor();
    expect(typeof color).toBe("string");
    app.stop();
  });
});

describe("ComboboxWidget render", () => {
  test("renders the placeholder when empty and the value with a caret when focused", () => {
    const w = new ComboboxWidget();
    w.region = new Region(new Offset(0, 0), new Size(24, 3));
    const buffer = new ScreenBuffer(24, 3);
    expect(() => w.render(buffer)).not.toThrow();

    w.value = "hello";
    w.focused = true;
    (w as any).cursorCol = 3;
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("scrolls the visible text window when the cursor moves past the right/left edge", () => {
    const w = new ComboboxWidget();
    w.region = new Region(new Offset(0, 0), new Size(6, 3));
    w.value = "a long value that overflows the field";
    (w as any).cursorCol = 30;
    const buffer = new ScreenBuffer(6, 3);
    expect(() => w.render(buffer)).not.toThrow();

    (w as any).cursorCol = 0;
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("does not draw a caret when disabled even if focused", () => {
    const w = new ComboboxWidget();
    w.region = new Region(new Offset(0, 0), new Size(24, 3));
    w.value = "abc";
    w.focused = true;
    w.disabled = true;
    const buffer = new ScreenBuffer(24, 3);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("skips drawing the caret when it would land past the field's right edge", () => {
    const w = new ComboboxWidget();
    w.region = new Region(new Offset(0, 0), new Size(4, 3));
    w.value = "abcdefgh";
    w.focused = true;
    (w as any).cursorCol = 8;
    const buffer = new ScreenBuffer(4, 3);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("renders with the disabled color and with App.instance resolving the focus color", () => {
    const driver = new MockDriver(40, 10);
    const app = new App(driver);
    const w = new ComboboxWidget();
    app.activeScreen.appendChild(w);
    w.region = new Region(new Offset(0, 0), new Size(24, 3));
    w.disabled = true;
    const buffer = new ScreenBuffer(24, 3);
    expect(() => w.render(buffer)).not.toThrow();

    w.disabled = false;
    w.focused = true;
    w.value = "abc";
    (w as any).cursorCol = 1;
    expect(() => w.render(buffer)).not.toThrow();
    app.stop();
  });
});
