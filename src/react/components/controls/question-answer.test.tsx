import { describe, expect, test } from "vitest";
// Import from the package root so the widget registrations in
// `src/widgets/index.ts` run — without them the host elements fall back to
// non-focusable generic widgets and the composite can't be driven.
import { type QAResult, QuestionAnswer } from "../../../index.ts";
import { mountApp } from "../../../test/harness.tsx";

// These exercise the composite through the real App ↔ React ↔ driver pipeline,
// so they cover the behaviour the widget inherits from its parts: RadioGroup /
// Checkbox selection, Input text entry, Tab focus traversal and Button submit.

describe("QuestionAnswer composite — single select", () => {
  test("selecting a radio option and submitting reports its value", async () => {
    let result: QAResult | undefined;
    const { app, driver, settle } = await mountApp(
      <QuestionAnswer
        question="Pick one"
        options={[{ label: "Redis" }, { label: "Postgres", value: "pg" }]}
        onSubmit={(r) => {
          result = r;
        }}
      />,
    );
    const screen = app.activeScreen;
    screen.focusWidget(screen.getFocusableWidgets()[0]); // the RadioGroup
    driver.simulateKey("down", "down"); // hover Postgres
    driver.simulateKey("space", "space"); // select it
    await settle();
    driver.simulateKey("tab", "tab"); // focus the submit button
    driver.simulateKey("enter", "enter"); // submit
    await settle();

    expect(result).toEqual({ selected: ["pg"], other: undefined });
  });
});

describe("QuestionAnswer composite — multi select", () => {
  test("toggling several checkboxes reports all checked values", async () => {
    let result: QAResult | undefined;
    const { app, driver, settle } = await mountApp(
      <QuestionAnswer
        question="Pick many"
        mode="multi"
        options={[{ label: "a" }, { label: "b" }, { label: "c" }]}
        onSubmit={(r) => {
          result = r;
        }}
      />,
    );
    const screen = app.activeScreen;
    screen.focusWidget(screen.getFocusableWidgets()[0]); // first checkbox (a)
    driver.simulateKey("space", "space"); // a on
    await settle();
    driver.simulateKey("tab", "tab"); // → b
    driver.simulateKey("tab", "tab"); // → c
    driver.simulateKey("space", "space"); // c on
    await settle();
    driver.simulateKey("tab", "tab"); // → submit button
    driver.simulateKey("enter", "enter");
    await settle();

    expect(result?.selected).toEqual(["a", "c"]);
  });
});

describe("QuestionAnswer composite — free text", () => {
  test("typing in the Other input is reported as `other`", async () => {
    let result: QAResult | undefined;
    const { app, driver, settle } = await mountApp(
      <QuestionAnswer
        question="Pick one"
        options={[{ label: "Redis" }]}
        allowOther
        onSubmit={(r) => {
          result = r;
        }}
      />,
    );
    const screen = app.activeScreen;
    screen.focusWidget(screen.getFocusableWidgets()[0]); // RadioGroup
    driver.simulateKey("tab", "tab"); // → Other input
    expect(screen.focusedWidget?.tagName).toBe("input");
    for (const ch of "hello") driver.simulateKey(ch, ch);
    await settle();
    driver.simulateKey("tab", "tab"); // → submit button
    driver.simulateKey("enter", "enter");
    await settle();

    expect(result?.other).toBe("hello");
  });
});

describe("QuestionAnswer composite — focus traversal", () => {
  test("Tab walks answers → free text → submit button", async () => {
    const { app, driver, settle } = await mountApp(
      <QuestionAnswer
        question="Pick one"
        options={[{ label: "Redis" }]}
        allowOther
        onSubmit={() => {}}
      />,
    );
    const screen = app.activeScreen;
    screen.focusWidget(screen.getFocusableWidgets()[0]);
    expect(screen.focusedWidget?.tagName).toBe("radio-group");
    driver.simulateKey("tab", "tab");
    await settle();
    expect(screen.focusedWidget?.tagName).toBe("input");
    driver.simulateKey("tab", "tab");
    await settle();
    expect(screen.focusedWidget?.tagName).toBe("button");
  });
});
