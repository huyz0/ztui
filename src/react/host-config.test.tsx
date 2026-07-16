import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { Box, Label } from "../react.ts";
import { mountApp } from "../test/harness.tsx";

describe("host-config applyProps", () => {
  test("id/className/style are cleared from the widget when the prop is removed", async () => {
    function App({ withProps }: { withProps: boolean }) {
      return withProps ? <Box id="box" className="a b" style={{ width: 5 }} /> : <Box />;
    }
    let setWithProps: (v: boolean) => void = () => {};
    function Wrapper() {
      const [withProps, set] = useState(true);
      setWithProps = set;
      return <App withProps={withProps} />;
    }

    const t = await mountApp(<Wrapper />);
    const box = t.findById<any>("box");
    expect(box.id).toBe("box");
    expect([...box.classes]).toEqual(["a", "b"]);
    expect(box.style.width).toBe(5);

    setWithProps(false);
    await t.settle();
    expect(box.id).toBe("");
    expect(box.classes.size).toBe(0);
    expect(box.style).toEqual({});
  });

  test("a handler removed between renders is cleared on the instance, not left stale", async () => {
    const onClick = vi.fn();
    function App({ withHandler }: { withHandler: boolean }) {
      return <Box id="box" onClick={withHandler ? onClick : undefined} />;
    }
    let setWithHandler: (v: boolean) => void = () => {};
    function Wrapper() {
      const [withHandler, set] = useState(true);
      setWithHandler = set;
      return <App withHandler={withHandler} />;
    }

    const t = await mountApp(<Wrapper />);
    const box = t.findById<any>("box");
    expect(box.onClick).toBe(onClick);

    setWithHandler(false);
    await t.settle();
    expect(box.onClick).toBeUndefined();
  });

  test("a generic widget field (not id/style/className/on*) is mirrored onto the instance", async () => {
    const t = await mountApp(<Label id="lbl">hi</Label>);
    const lbl = t.findById<any>("lbl");
    // `wrap` is a plain (non-handler, non-internal) field Label exposes.
    expect(typeof lbl.wrap).toBe("boolean");
  });

  test("onScroll is wired to the widget instance, not silently dropped", async () => {
    // Regression: onScroll is typed on ComponentProps and Widget.onScroll
    // exists (and fires from handleScroll), but the generic prop-mirror in
    // applyProps explicitly skips every "on*"-prefixed key, and
    // KNOWN_HANDLER_PROPS (the list of handlers applied explicitly) omitted
    // "onScroll" -- so a JSX onScroll={...} prop never reached the widget at
    // all, despite looking fully wired (typed, documented, and a real widget
    // field ready to receive it).
    const onScroll = vi.fn();
    const t = await mountApp(<Box id="box" onScroll={onScroll} style={{ height: 3 }} />, {
      rows: 10,
    });
    const box = t.findById<any>("box");
    expect(box.onScroll).toBe(onScroll);

    box.handleScroll({ type: "scroll_down" });
    expect(onScroll).toHaveBeenCalledTimes(1);
  });
});
