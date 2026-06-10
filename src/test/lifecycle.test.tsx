import { useState } from "react";
import { describe, expect, test } from "vitest";
import { Select, VBox } from "../react/components.tsx";
import "../widgets/index.ts";
import type { SelectWidget } from "../widgets/controls/select.ts";
import { mountApp } from "./harness.tsx";

describe("widget lifecycle (onUnmount)", () => {
  test("a Select unmounted while its dropdown is open cleans up the overlay", async () => {
    let setShow: (v: boolean) => void = () => {};
    function App() {
      const [show, _setShow] = useState(true);
      setShow = _setShow;
      return <VBox>{show ? <Select id="sel" options={["a", "b"]} /> : null}</VBox>;
    }

    const t = await mountApp(<App />);
    const sel = t.findById<SelectWidget>("sel");
    sel?.openDropdown();
    await t.settle();
    expect(t.screen.overlays.length).toBe(1);

    // Unmount the Select.
    setShow(false);
    await t.settle();

    expect(t.screen.overlays.length).toBe(0);
  });

  test("onUnmount fires for a nested widget when an ancestor unmounts", async () => {
    let setShow: (v: boolean) => void = () => {};
    function App() {
      const [show, _setShow] = useState(true);
      setShow = _setShow;
      return (
        <VBox>
          {show ? (
            <VBox>
              <Select id="sel" options={["a", "b"]} />
            </VBox>
          ) : null}
        </VBox>
      );
    }

    const t = await mountApp(<App />);
    const sel = t.findById<SelectWidget>("sel");
    sel?.openDropdown();
    await t.settle();
    expect(t.screen.overlays.length).toBe(1);

    // Unmount the wrapping VBox (the Select is nested inside it).
    setShow(false);
    await t.settle();

    expect(t.screen.overlays.length).toBe(0);
  });
});
