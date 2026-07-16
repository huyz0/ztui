import React from "react";
import { describe, expect, test, vi } from "vitest";
import { Size } from "../geometry/size.ts";
import { View } from "../react.ts";
import { mountApp } from "../test/harness.tsx";
import { logger } from "../utils/logger.ts";
import { reconciler } from "./reconciler.ts";

describe("host-config — prop clearing on re-render", () => {
  test("removed onClick / className / style / id are cleared from the reused widget", async () => {
    function Comp({ active }: { active: boolean }) {
      return (
        <View
          id={active ? "target" : undefined}
          className={active ? "active box" : undefined}
          style={active ? { color: "red" } : undefined}
          onClick={active ? () => {} : undefined}
        />
      );
    }

    const { container, findById, settle } = await mountApp(<Comp active={true} />);

    const widget = findById("target");
    expect(widget).toBeDefined();
    if (!widget) return;
    expect(typeof widget.onClick).toBe("function");
    expect(widget.classes.has("active")).toBe(true);
    expect(widget.classes.has("box")).toBe(true);
    expect(widget.style.color).toBe("red");

    // Re-render with all of those props removed; the widget instance is reused.
    reconciler.updateContainer(<Comp active={false} />, container, null, () => {});
    await settle();

    expect(widget.onClick).toBeUndefined();
    expect(widget.classes.size).toBe(0);
    expect(widget.style.color).toBeUndefined();
    expect(widget.id).toBe("");
  });

  test("empty className produces an empty class set (no bogus '' class)", async () => {
    const { findById } = await mountApp(<View id="t" className="" />);

    const widget = findById("t");
    expect(widget).toBeDefined();
    expect(widget?.classes.size).toBe(0);
    expect(widget?.classes.has("")).toBe(false);
  });
});

describe("render — error callbacks", () => {
  test("an uncaught render error (no error boundary) is logged via logger.error", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    function Boom(): React.ReactNode {
      throw new Error("boom");
    }

    await mountApp(<Boom />);

    expect(errorSpy).toHaveBeenCalledWith("react", "uncaught render error", expect.any(Error));

    errorSpy.mockRestore();
  });

  test("an error caught by an error boundary is logged via logger.error", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    class Boundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
      state = { hasError: false };
      static getDerivedStateFromError() {
        return { hasError: true };
      }
      componentDidCatch() {
        // swallow — logging is asserted via the reconciler's onCaughtError.
      }
      render() {
        return this.state.hasError ? <View id="fallback" /> : this.props.children;
      }
    }

    function Boom(): React.ReactNode {
      throw new Error("boom");
    }

    const { findById } = await mountApp(
      <Boundary>
        <Boom />
      </Boundary>,
    );

    expect(findById("fallback")).toBeDefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "react",
      "caught render error (error boundary)",
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });
});

describe("App — resize timer lifecycle", () => {
  test("pending resize debounce timer is cleared on stop()", async () => {
    const { app, driver } = await mountApp(<View />);

    // Fire a resize so the 30ms debounce timer is armed.
    (driver as any).emit("resize", new Size(100, 30));
    expect((app as any).resizeTimeout).not.toBeNull();

    app.stop();
    expect((app as any).resizeTimeout).toBeNull();
  });
});
