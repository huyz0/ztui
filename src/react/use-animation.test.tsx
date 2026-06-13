import { useState } from "react";
import { describe, expect, test } from "vitest";
import { HBox, Label, useAnimatedColor, useAnimatedValue } from "../react.ts";
import { mountApp } from "../test/harness.tsx";

// Each test captures the component's setter so it can change the tween target
// from outside React, then flushes real (short) timers to let the driver settle.
let setTarget: ((n: number) => void) | undefined;
let setColorTarget: ((c: string) => void) | undefined;

function ValueProbe({ duration }: { duration: number }) {
  const [to, setTo] = useState(0);
  setTarget = setTo;
  const v = useAnimatedValue(to, { duration, easing: "linear" });
  return (
    <HBox>
      <Label id="v">{`[${Math.round(v)}]`}</Label>
    </HBox>
  );
}

function ColorProbe() {
  const [to, setTo] = useState("#000000");
  setColorTarget = setTo;
  const c = useAnimatedColor(to, { duration: 40, easing: "linear" });
  return (
    <HBox>
      <Label id="c">{c}</Label>
    </HBox>
  );
}

describe("useAnimatedValue", () => {
  test("snaps immediately when duration is zero", async () => {
    const h = await mountApp(<ValueProbe duration={0} />);
    expect(h.text()).toContain("[0]");
    setTarget?.(100);
    await h.settle(20);
    expect(h.text()).toContain("[100]");
  });

  test("tweens toward a new target and lands exactly on it", async () => {
    const h = await mountApp(<ValueProbe duration={50} />);
    expect(h.text()).toContain("[0]");
    setTarget?.(100);
    // Well past the duration: the value must have settled on the target.
    await h.settle(140);
    expect(h.text()).toContain("[100]");
  });
});

describe("useAnimatedColor", () => {
  test("tweens a colour to its target", async () => {
    const h = await mountApp(<ColorProbe />);
    expect(h.text()).toContain("#000000");
    setColorTarget?.("#ffffff");
    await h.settle(120);
    // Lands precisely on the requested string at the end of the tween.
    expect(h.text()).toContain("#ffffff");
  });
});
