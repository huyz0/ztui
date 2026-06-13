import { afterEach, describe, expect, test } from "vitest";
import { motion } from "../anim/motion.ts";
import { App } from "../core/app.ts";
import { Attention, Input, Label, VBox } from "../index.ts";
import { mountApp } from "./harness.tsx";

afterEach(() => motion.reset());

describe("$focus breathing accent", () => {
  test("is the static theme primary when motion is off", async () => {
    const { findById } = await mountApp(
      <VBox theme="default-dark">
        <Input id="i" />
      </VBox>,
      { cols: 20, rows: 3 },
    );
    const w = findById("i")!;
    const resolver = App.instance!.cssResolver;
    // default-dark primary is a hex; with motion off, $focus resolves to it verbatim.
    expect(resolver.resolveVariable(w, "$focus")).toBe(resolver.resolveVariable(w, "$primary"));
  });

  test("breathes (resolves to an rgb shimmer) when motion is on", async () => {
    motion.set(true);
    const { findById } = await mountApp(
      <VBox theme="default-dark">
        <Input id="i" />
      </VBox>,
      { cols: 20, rows: 3 },
    );
    const w = findById("i")!;
    // The breathing form always returns an rgb(...) blend, distinct from the
    // static hex primary.
    expect(App.instance!.cssResolver.resolveVariable(w, "$focus")).toMatch(/^rgb\(/);
  });
});

describe("Attention panel", () => {
  test("uses a static $attention border when motion is off", async () => {
    const { findById } = await mountApp(
      <VBox theme="default-dark">
        <Attention id="a" style={{ padding: 1 }}>
          <Label>Allow?</Label>
        </Attention>
      </VBox>,
      { cols: 24, rows: 6 },
    );
    const w = findById("a")!;
    const resolver = App.instance!.cssResolver;
    // Border colour is driven by $attention (warning-based) — static hex here.
    expect(w.computedStyle.borderColor).toBe(resolver.resolveVariable(w, "$attention"));
  });

  test("an explicit borderColor still wins over the pulse", async () => {
    motion.set(true);
    const { findById } = await mountApp(
      <VBox theme="default-dark">
        <Attention id="a" style={{ borderColor: "#123456", padding: 1 }}>
          <Label>Hi</Label>
        </Attention>
      </VBox>,
      { cols: 24, rows: 6 },
    );
    expect(findById("a")!.computedStyle.borderColor).toBe("#123456");
  });
});
