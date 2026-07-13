import { describe, expect, test } from "vitest";
import { Combobox } from "../react.ts";
import { mountApp } from "./harness.tsx";

describe("Combobox", () => {
  test("typing filters suggestions and opens the popover", async () => {
    let value = "";
    const { screen, findById } = await mountApp(
      <Combobox
        id="cb"
        options={["Apple", "Banana", "Cherry", "apricot"]}
        value={value}
        onChange={(v) => {
          value = v;
        }}
      />,
      { cols: 40, rows: 15 },
    );

    const cb = findById("cb");
    expect(cb.isOpen).toBe(false);

    cb.handleKey({ key: "a" });
    expect(cb.isOpen).toBe(true);
    expect(screen.overlays.length).toBe(1);
    expect(value).toBe("a");
    expect(cb.getFilteredOptions().map((o: any) => o.label)).toEqual([
      "Apple",
      "Banana",
      "apricot",
    ]);
  });

  test("arrow keys move the highlighted suggestion, Enter commits it", async () => {
    let value = "";
    const { findById } = await mountApp(
      <Combobox
        id="cb"
        options={["Apple", "Banana", "Cherry"]}
        onChange={(v) => {
          value = v;
        }}
      />,
      { cols: 40, rows: 15 },
    );
    const cb = findById("cb");

    cb.handleKey({ key: "down" }); // opens with all 3 options, highlightedIndex 0
    expect(cb.isOpen).toBe(true);
    cb.handleKey({ key: "down" }); // -> index 1 (Banana)
    expect(cb.highlightedIndex).toBe(1);

    cb.handleKey({ key: "enter" });
    expect(value).toBe("Banana");
    expect(cb.isOpen).toBe(false);
  });

  test("Escape closes the popover without changing the value", async () => {
    const { findById } = await mountApp(
      <Combobox id="cb" options={["Apple", "Banana"]} value="Ap" />,
      {
        cols: 40,
        rows: 15,
      },
    );
    const cb = findById("cb");
    cb.handleKey({ key: "down" });
    expect(cb.isOpen).toBe(true);
    cb.handleKey({ key: "escape" });
    expect(cb.isOpen).toBe(false);
    expect(cb.value).toBe("Ap");
  });

  test("clicking a suggestion selects it", async () => {
    const { screen, findById } = await mountApp(
      <Combobox id="cb" options={["Apple", "Banana"]} />,
      {
        cols: 40,
        rows: 15,
      },
    );
    const cb = findById("cb");
    cb.handleMouse({ type: "press", button: "left" });
    expect(cb.isOpen).toBe(true);

    const overlay = screen.overlays[0] as any;
    overlay.handleMouse({
      type: "press",
      button: "left",
      x: overlay.overlayX + 1,
      y: overlay.overlayY + 1,
    });
    expect(cb.value).toBe("Apple");
    expect(cb.isOpen).toBe(false);
  });

  test("allowCustomValue={false} reverts an unmatched typed value on outside click", async () => {
    const { screen, findById } = await mountApp(
      <Combobox id="cb" options={["Apple", "Banana"]} allowCustomValue={false} />,
      { cols: 40, rows: 15 },
    );
    const cb = findById("cb");
    cb.handleKey({ key: "z" });
    expect(cb.value).toBe("z");
    expect(cb.isOpen).toBe(true);

    const overlay = screen.overlays[0];
    overlay.handleMouse({ type: "press", button: "left", x: 0, y: 0 }); // outside
    expect(cb.isOpen).toBe(false);
    expect(cb.value).toBe(""); // "z" matched nothing, so it's cleared
  });
});
