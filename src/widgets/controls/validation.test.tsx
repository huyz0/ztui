import { describe, expect, test } from "vitest";
import {
  Button,
  Checkbox,
  FieldError,
  Form,
  Input,
  Select,
  ValidationSummary,
  VBox,
} from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";
import type { CheckboxWidget } from "./checkbox.ts";
import type { FieldErrorWidget } from "./field-error.ts";
import type { FormWidget } from "./form.ts";
import type { InputWidget } from "./input.ts";
import type { SelectWidget } from "./select.ts";
import {
  custom,
  email,
  maxLength,
  minLength,
  normalizeResult,
  oneOf,
  pattern,
  range,
  required,
  runValidators,
} from "./validation.ts";
import type { ValidationSummaryWidget } from "./validation-summary.ts";

describe("built-in validators", () => {
  test("required rejects empty values", () => {
    const v = required();
    expect(v("")).toBeTruthy();
    expect(v(null)).toBeTruthy();
    expect(v([])).toBeTruthy();
    expect(v(false)).toBeTruthy();
    expect(v("x")).toBeNull();
  });

  test("minLength / maxLength", () => {
    expect(minLength(3)("ab")).toBeTruthy();
    expect(minLength(3)("abc")).toBeNull();
    expect(maxLength(3)("abcd")).toBeTruthy();
    expect(maxLength(3)("abc")).toBeNull();
  });

  test("email + pattern skip empty (let required own emptiness)", () => {
    expect(email()("")).toBeNull();
    expect(email()("nope")).toBeTruthy();
    expect(email()("a@b.co")).toBeNull();
    expect(pattern(/^\d+$/)("12a")).toBeTruthy();
    expect(pattern(/^\d+$/)("")).toBeNull();
  });

  test("range + oneOf", () => {
    expect(range(1, 5)(6)).toBeTruthy();
    expect(range(1, 5)(3)).toBeNull();
    expect(oneOf(["a", "b"])("c")).toBeTruthy();
    expect(oneOf(["a", "b"])("a")).toBeNull();
  });

  test("custom predicate", () => {
    const even = custom<number>((n) => n % 2 === 0, "Must be even");
    expect(even(3)).toBe("Must be even");
    expect(even(4)).toBeNull();
  });
});

describe("runValidators", () => {
  test("returns the first error, valid when all pass", () => {
    const res = runValidators("", [required("req"), minLength(3, "min")]);
    expect(res).toEqual({ valid: false, message: "req", severity: "error" });
    expect(runValidators("abcd", [required(), minLength(3)]).valid).toBe(true);
  });

  test("errors win over warnings, warnings surface when no error", () => {
    const warn = () => ({ valid: false, message: "w", severity: "warning" as const });
    const err = () => "e";
    expect(runValidators("x", [warn, err]).severity).toBe("error");
    expect(runValidators("x", [warn]).severity).toBe("warning");
  });

  test("normalizeResult handles all return shapes", () => {
    expect(normalizeResult(null).valid).toBe(true);
    expect(normalizeResult(true).valid).toBe(true);
    expect(normalizeResult(false)).toEqual({ valid: false, severity: "error" });
    expect(normalizeResult("bad")).toEqual({ valid: false, message: "bad", severity: "error" });
  });
});

describe("Form widget integration", () => {
  test("fields validate and the form aggregates validity", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <Input id="name" validators={[required("Name required")]} validateOn="submit" />
        <Input id="mail" value="a@b.co" validators={[email()]} validateOn="submit" />
      </Form>,
    );
    const form = findById<FormWidget>("form")!;
    expect(form.validate()).toBe(false); // name is empty

    const name = findById<InputWidget>("name")!;
    expect(name.invalid).toBe(true);
    expect(name.validation.message).toBe("Name required");

    name.value = "Ada";
    expect(form.validate()).toBe(true);
    expect(name.invalid).toBe(false);
  });

  test("submit focuses the first invalid field and gates onSubmit", async () => {
    let submitted: Record<string, unknown> | null = null;
    const { app, findById } = await mountApp(
      <Form id="form" onSubmit={(v) => (submitted = v)}>
        <Input id="a" validators={[required()]} validateOn="submit" />
        <Button formAction="submit" label="Go" />
      </Form>,
    );
    const form = findById<FormWidget>("form")!;
    form.submit();
    expect(submitted).toBeNull();
    expect(app.activeScreen.focusedWidget?.id).toBe("a");

    findById<InputWidget>("a")!.value = "ok";
    form.submit();
    expect(submitted).toEqual({ a: "ok" });
  });

  test("FieldError takes zero rows until its field is invalid", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <Input id="a" validators={[required("Required!")]} validateOn="submit" />
        <FieldError id="err" targetId="a" />
      </Form>,
    );
    const err = findById<FieldErrorWidget>("err")!;
    err.measure(40, 10);
    expect(err.measuredHeight).toBe(0); // valid → collapsed

    findById<FormWidget>("form")!.validate(); // field now invalid
    err.measure(40, 10);
    expect(err.measuredHeight).toBe(1); // message → one row
  });

  test("invalid input resolves an error border color", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <Input id="a" validators={[required()]} validateOn="submit" />
      </Form>,
    );
    const input = findById<InputWidget>("a")!;
    expect(input.validation.resolveColor()).toBeNull(); // untouched
    findById<FormWidget>("form")!.validate();
    expect(input.validation.resolveColor()).toBeTruthy(); // error color resolved
  });

  test("values are keyed by field id", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <Input id="x" value="1" />
        <Input id="y" value="2" />
      </Form>,
    );
    expect(findById<FormWidget>("form")!.values).toEqual({ x: "1", y: "2" });
  });

  test("non-text controls (checkbox, select) validate too", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <Checkbox id="terms" validators={[required("Accept the terms")]} validateOn="submit" />
        <Select
          id="plan"
          options={["free", "pro"]}
          validators={[required("Pick a plan")]}
          validateOn="submit"
        />
      </Form>,
    );
    const form = findById<FormWidget>("form")!;
    expect(form.validate()).toBe(false);
    expect(findById<CheckboxWidget>("terms")!.validation.invalid).toBe(true);
    expect(findById<SelectWidget>("plan")!.validation.invalid).toBe(true);

    findById<CheckboxWidget>("terms")!.checked = true;
    findById<SelectWidget>("plan")!.value = "pro";
    expect(form.validate()).toBe(true);
  });
});

describe("ValidationSummary", () => {
  test("lists invalid fields and jumps focus to a chosen one", async () => {
    const { app, findById } = await mountApp(
      <Form id="form">
        <ValidationSummary id="summary" />
        <Input id="a" validators={[required("A is required")]} validateOn="submit" />
        <Input id="b" validators={[required("B is required")]} validateOn="submit" />
      </Form>,
    );
    const summary = findById<ValidationSummaryWidget>("summary")!;
    summary.measure(40, 10);
    expect(summary.measuredHeight).toBe(0); // valid → collapsed

    findById<FormWidget>("form")!.validate();
    summary.measure(40, 10);
    expect(summary.measuredHeight).toBe(2); // two messages

    // Clicking the second row focuses field "b".
    const rect = summary.getContentRect();
    summary.focused = true;
    summary.handleMouse({ type: "press", button: "left", x: rect.x, y: rect.y + 1 });
    expect(app.activeScreen.focusedWidget?.id).toBe("b");
  });

  test("renders a title + message rows and supports keyboard jump", async () => {
    const { app, findById, settle, text } = await mountApp(
      <Form id="form">
        <ValidationSummary id="summary" title="Fix these:" />
        <Input id="a" validators={[required("A is required")]} validateOn="submit" />
        <Input id="b" validators={[required("B is required")]} validateOn="submit" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    await settle();
    const out = text();
    expect(out).toContain("Fix these:");
    expect(out).toContain("A is required");

    const summary = findById<ValidationSummaryWidget>("summary")!;
    summary.focused = true;
    summary.handleKey({ name: "down" } as any); // select second row
    summary.handleKey({ name: "enter" } as any); // jump to it
    expect(app.activeScreen.focusedWidget?.id).toBe("b");
  });

  test("up-arrow clamps at the top and Enter jumps to the first field", async () => {
    const { app, findById } = await mountApp(
      <Form id="form">
        <ValidationSummary id="summary" />
        <Input id="a" validators={[required("A required")]} validateOn="submit" />
        <Input id="b" validators={[required("B required")]} validateOn="submit" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    const summary = findById<ValidationSummaryWidget>("summary")!;
    summary.focused = true;
    summary.handleKey({ name: "down" } as any); // → row 1
    summary.handleKey({ name: "up" } as any); // → row 0
    summary.handleKey({ name: "up" } as any); // clamps at 0
    summary.handleKey({ name: "enter" } as any);
    expect(app.activeScreen.focusedWidget?.id).toBe("a");
  });

  test("binds to a form by id when placed outside it", async () => {
    const { findById, settle, text } = await mountApp(
      <VBox>
        <ValidationSummary id="summary" formId="form" />
        <Form id="form">
          <Input id="a" validators={[required("A required")]} validateOn="submit" />
        </Form>
      </VBox>,
    );
    findById<FormWidget>("form")!.validate();
    await settle();
    expect(text()).toContain("A required"); // resolved the form by id across the tree
  });
});
