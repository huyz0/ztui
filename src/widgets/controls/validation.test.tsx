import { describe, expect, test } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import {
  Box,
  Button,
  Checkbox,
  FieldError,
  Form,
  Input,
  Select,
  ValidationSummary,
  VBox,
} from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { mountApp } from "../../test/harness.tsx";
import type { CheckboxWidget } from "./checkbox.ts";
import { FieldErrorWidget } from "./field-error.ts";
import type { FormWidget } from "./form.ts";
import { InputWidget } from "./input.ts";
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
import { ValidationSummaryWidget } from "./validation-summary.ts";

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

  test("normalizeResult passes through a valid ValidationResult that already carries a severity", () => {
    const result = { valid: true, severity: "warning" as const, message: "heads up" };
    expect(normalizeResult(result)).toBe(result); // same object, untouched
  });

  test("normalizeResult defaults a valid ValidationResult with no severity to 'success'", () => {
    expect(normalizeResult({ valid: true, message: "ok" })).toEqual({
      valid: true,
      message: "ok",
      severity: "success",
    });
  });

  test("minLength/maxLength treat a nullish value as length 0", () => {
    expect(minLength(1)(undefined as unknown as string)).toBeTruthy();
    expect(maxLength(0)(undefined as unknown as string)).toBeNull();
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

  test("auto/shared message mode paints the focused field's error on the form's bottom row", async () => {
    const { findById, settle, text } = await mountApp(
      <Form id="form" style={{ width: 30, height: 4 }}>
        <Input id="a" validators={[required("Name required")]} validateOn="submit" />
      </Form>,
    );
    const form = findById<FormWidget>("form")!;
    form.submit(); // invalid → focuses "a" and sets its validation message
    await settle();
    expect(text()).toContain("Name required");
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

  test("FieldError binds to the nearest preceding field and renders its message", async () => {
    const { findById, settle, text } = await mountApp(
      <Form id="form" style={{ width: 30 }}>
        <Input id="a" validators={[required("Name is required")]} validateOn="submit" />
        <FieldError id="err" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    await settle();
    // No targetId → reports on the immediately-preceding Input.
    expect(text()).toContain("Name is required");
  });

  test("FieldError with no preceding validatable sibling stays collapsed", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <FieldError id="err" />
      </Form>,
    );
    const err = findById<FieldErrorWidget>("err")!;
    err.measure(40, 10);
    expect(err.measuredHeight).toBe(0);
  });

  test("targetId resolves a field nested inside a wrapper, not just a direct child", async () => {
    const { findById, settle, text } = await mountApp(
      <Form id="form">
        <Box>
          <Input id="a" validators={[required("Nested required")]} validateOn="submit" />
        </Box>
        <FieldError id="err" targetId="a" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    await settle();
    expect(text()).toContain("Nested required");
  });

  test("targetId that matches no field in the tree resolves to no message", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <Input id="a" validators={[required("Required")]} validateOn="submit" />
        <FieldError id="err" targetId="does-not-exist" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    const err = findById<FieldErrorWidget>("err")!;
    err.measure(40, 10);
    expect(err.measuredHeight).toBe(0);
  });

  test("FieldError truncates a message wider than its box", async () => {
    const long = "This validation message is far too long to fit the narrow field width";
    const { findById, settle, text } = await mountApp(
      <Form id="form" style={{ width: 20 }}>
        <Input id="a" validators={[required(long)]} validateOn="submit" />
        <FieldError id="err" style={{ width: 20 }} />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    await settle();
    expect(text()).toContain("…");
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

  test("resolveColor resolves against the field's own app, not whichever App is currently the global instance", async () => {
    // Regression: resolveColor() always used App.instance (whichever App was
    // constructed/started most recently) instead of this.field.app. With two
    // App instances alive, validating a field that belongs to the first app
    // while the second app is the live App.instance pulled the second app's
    // stylesheet override instead of the field's own.
    const first = await mountApp(
      <Form id="form">
        <Input id="a" validators={[required()]} validateOn="submit" />
      </Form>,
    );
    first.app.loadStyles("$error: #111111;");
    const input = first.findById<InputWidget>("a")!;
    first.findById<FormWidget>("form")!.validate();
    expect(input.validation.resolveColor()).toBe("#111111");

    // Mounting a second app makes it the new App.instance.
    const second = await mountApp(<Form id="form2" />);
    second.app.loadStyles("$error: #222222;");

    // The first field's color must still resolve against its own app's
    // override, unaffected by the second app now being App.instance.
    expect(input.validation.resolveColor()).toBe("#111111");
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

describe("FieldValidation — trigger and severity branches", () => {
  test("maybeValidate re-validates on the matching trigger even before the field is touched", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <Input id="a" validators={[required("Required")]} validateOn="change" />
      </Form>,
    );
    const input = findById<InputWidget>("a")!;
    expect(input.validation.touched).toBe(false);
    input.value = "x";
    input.handleKey({ key: "backspace" } as any); // triggers "change"
    expect(input.validation.touched).toBe(true);
  });

  test("maybeValidate re-validates on any change once touched, even if validateOn is 'blur'", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <Input id="a" validators={[required("Required")]} validateOn="blur" />
      </Form>,
    );
    const input = findById<InputWidget>("a")!;
    input.value = "x";
    input.validation.touched = true;
    input.validation.result = { valid: false, severity: "error" };
    input.handleKey({ key: "y" } as any); // not "blur", but touched + "change" still re-validates
    expect(input.validation.result.valid).toBe(true);
  });

  test("maybeValidate is a no-op for a mismatched trigger while untouched", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <Input id="a" validators={[required("Required")]} validateOn="submit" />
      </Form>,
    );
    const input = findById<InputWidget>("a")!;
    input.value = "x";
    input.handleKey({ key: "y" } as any); // "change" event, but validateOn is "submit" and not yet touched
    expect(input.validation.touched).toBe(false);
  });

  test("severity defaults to 'error' when the validator result carries none", () => {
    const { validation } = new InputWidget();
    validation.validators = [() => ({ valid: false })];
    validation.validate();
    expect(validation.severity).toBe("error");
  });

  test("resolveColor resolves the warning and success theme tokens too", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <Input id="a" />
      </Form>,
    );
    const input = findById<InputWidget>("a")!;
    input.validation.validators = [() => ({ valid: false, severity: "warning", message: "hmm" })];
    input.validation.validate();
    expect(input.validation.severity).toBe("warning");
    expect(input.validation.resolveColor()).toBeTruthy();

    input.validation.validators = [() => ({ valid: true, severity: "success" })];
    input.validation.validate();
    // A "success" result is valid, so `invalid`/`severity` report undefined —
    // resolveColor sees no severity and returns null.
    expect(input.validation.resolveColor()).toBeNull();
  });

  test("severity getter falls back to 'error' when the stored result has no severity at all", () => {
    const input = new InputWidget();
    input.validation.touched = true;
    input.validation.result = { valid: false }; // no `severity` key present
    expect(input.validation.severity).toBe("error");
  });

  test("resolveColor falls back to plain red when there's no App to resolve the theme token", () => {
    const input = new InputWidget();
    input.validators = [() => "Bad"];
    input.validation.touched = true;
    input.validation.validate();
    expect(input.validation.resolveColor()).toBe("red");
  });
});

describe("FieldErrorWidget branch coverage", () => {
  test("targetId lookup works when the widget itself has no parent yet", () => {
    const err = new FieldErrorWidget();
    err.targetId = "does-not-exist";
    // No parent -> rootOf() branch is skipped, `this` is used as the search
    // root directly; findById() still returns null for a missing id.
    expect(() => err.measure(40, 10)).not.toThrow();
    expect(err.measuredHeight).toBe(0);
  });

  test("skips a non-validatable preceding sibling to find the field further back", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <Input id="a" validators={[required("Required")]} validateOn="submit" />
        <Box id="spacer" />
        <FieldError id="err" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    const err = findById<FieldErrorWidget>("err")!;
    err.measure(40, 10);
    // The immediately-preceding sibling ("spacer") isn't validatable, so it
    // walks further back to "a".
    expect(err.measuredHeight).toBe(1);
  });

  test("render is a no-op when there is no message", () => {
    const err = new FieldErrorWidget();
    const buffer = new ScreenBuffer(20, 5);
    expect(() => err.render(buffer)).not.toThrow();
  });

  test("render bails when the content rect has zero width or height", async () => {
    const { findById } = await mountApp(
      <Form id="form" style={{ width: 30 }}>
        <Input id="a" validators={[required("Required")]} validateOn="submit" />
        <FieldError id="err" style={{ width: 0, height: 0 }} />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    const err = findById<FieldErrorWidget>("err")!;
    const buffer = new ScreenBuffer(20, 5);
    expect(() => err.render(buffer)).not.toThrow();
  });

  test("measure resolves a non-numeric dimension (fr) by falling back to maxW", () => {
    const err = new FieldErrorWidget();
    err.style = { width: "2fr" };
    expect(() => err.measure(40, 10)).not.toThrow();
    expect(err.measuredWidth).toBe(40);
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

  test("does nothing on keypress while every field is valid", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <ValidationSummary id="summary" />
        <Input id="a" />
      </Form>,
    );
    const summary = findById<ValidationSummaryWidget>("summary")!;
    summary.focused = true;
    // No validators → no invalid fields → onKey returns before moving selection.
    expect(() => summary.handleKey({ name: "down" } as any)).not.toThrow();
    expect(() => summary.handleKey({ name: "enter" } as any)).not.toThrow();
    summary.measure(40, 10);
    expect(summary.measuredHeight).toBe(0); // collapsed: nothing to show
  });

  test("space also jumps to the selected field", async () => {
    const { app, findById } = await mountApp(
      <Form id="form">
        <ValidationSummary id="summary" />
        <Input id="a" validators={[required("A required")]} validateOn="submit" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    const summary = findById<ValidationSummaryWidget>("summary")!;
    summary.focused = true;
    summary.handleKey({ name: "space" } as any);
    expect(app.activeScreen.focusedWidget?.id).toBe("a");
  });

  test("a message wider than the box is truncated with an ellipsis", async () => {
    const long = "This is a very long validation message that exceeds the available width";
    const { findById, settle, text } = await mountApp(
      <Form id="form" style={{ width: 24 }}>
        <ValidationSummary id="summary" style={{ width: 24 }} />
        <Input id="a" validators={[required(long)]} validateOn="submit" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    await settle();
    expect(text()).toContain("…"); // truncated to fit
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

  test("binds to a form by id nested several levels deeper than a direct sibling", async () => {
    const { findById, settle, text } = await mountApp(
      <VBox>
        <ValidationSummary id="summary" formId="form" />
        <Box>
          <Box>
            <Form id="form">
              <Input id="a" validators={[required("Deeply nested required")]} validateOn="submit" />
            </Form>
          </Box>
        </Box>
      </VBox>,
    );
    findById<FormWidget>("form")!.validate();
    await settle();
    expect(text()).toContain("Deeply nested required");
  });

  test("falls back to scanning its own descendants when there's no bound form at all", async () => {
    const { findById } = await mountApp(
      <VBox id="root">
        <ValidationSummary id="summary" formId="does-not-exist">
          <Input id="a" validators={[required("A required")]} validateOn="submit" />
        </ValidationSummary>
      </VBox>,
    );
    const input = findById<InputWidget>("a")!;
    input.validation.touched = true;
    input.validation.validate();
    const summary = findById<ValidationSummaryWidget>("summary")!;
    summary.measure(40, 10);
    // No form found by id, and no ancestor <Form> either -> falls back to
    // scanning the summary's own descendants, finding the nested Input.
    expect(summary.measuredHeight).toBe(1);
  });

  test("onKey resolves the key from ev.key when ev.name is absent", async () => {
    const { app, findById } = await mountApp(
      <Form id="form">
        <ValidationSummary id="summary" />
        <Input id="a" validators={[required("A required")]} validateOn="submit" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    const summary = findById<ValidationSummaryWidget>("summary")!;
    summary.focused = true;
    summary.onKey?.({ key: "enter", handled: false });
    expect(app.activeScreen.focusedWidget?.id).toBe("a");
  });

  test("finds the ancestor form through intermediate non-form wrapper widgets", async () => {
    const { findById, settle, text } = await mountApp(
      <Form id="form">
        <Box>
          <Box>
            <ValidationSummary id="summary" />
          </Box>
        </Box>
        <Input id="a" validators={[required("Wrapped required")]} validateOn="submit" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    await settle();
    expect(text()).toContain("Wrapped required");
  });

  test("space (literal ' ' key) also jumps to the selected field", async () => {
    const { app, findById } = await mountApp(
      <Form id="form">
        <ValidationSummary id="summary" />
        <Input id="a" validators={[required("A required")]} validateOn="submit" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    const summary = findById<ValidationSummaryWidget>("summary")!;
    summary.focused = true;
    summary.handleKey({ key: " ", handled: false } as any);
    expect(app.activeScreen.focusedWidget?.id).toBe("a");
  });

  test("measure resolves a non-numeric dimension (fr) by falling back to maxW", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <ValidationSummary id="summary" style={{ width: "2fr" }} />
        <Input id="a" validators={[required("A required")]} validateOn="submit" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    const summary = findById<ValidationSummaryWidget>("summary")!;
    summary.measure(40, 10);
    expect(summary.measuredWidth).toBe(40);
  });

  test("handleMouse ignores an event already handled upstream", async () => {
    const { app, findById } = await mountApp(
      <Form id="form">
        <ValidationSummary id="summary" />
        <Input id="a" validators={[required("A required")]} validateOn="submit" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    const summary = findById<ValidationSummaryWidget>("summary")!;
    const rect = summary.getContentRect();
    summary.handleMouse({ type: "press", button: "left", x: rect.x, y: rect.y, handled: true });
    expect(app.activeScreen.focusedWidget?.id).not.toBe("a");
  });

  test("handleMouse row math accounts for the title row when present", async () => {
    const { app, findById } = await mountApp(
      <Form id="form">
        <ValidationSummary id="summary" title="Fix these:" />
        <Input id="a" validators={[required("A required")]} validateOn="submit" />
        <Input id="b" validators={[required("B required")]} validateOn="submit" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    const summary = findById<ValidationSummaryWidget>("summary")!;
    const rect = summary.getContentRect();
    // Row 0 of the content rect is the title; row 1 is the first message.
    summary.handleMouse({
      type: "press",
      button: "left",
      x: rect.x,
      y: rect.y + 1,
      handled: false,
    });
    expect(app.activeScreen.focusedWidget?.id).toBe("a");
  });

  test("render falls back to the plain theme colors when no App is running", () => {
    const summary = new ValidationSummaryWidget();
    const input = new InputWidget();
    input.validators = [() => "Bad value"];
    input.validation.touched = true;
    input.validation.validate();
    summary.appendChild(input);
    summary.region = new Region(new Offset(0, 0), new Size(20, 5));
    const buffer = new ScreenBuffer(20, 5);
    expect(() => summary.render(buffer)).not.toThrow();
  });

  test("render is a no-op when the form is valid", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <ValidationSummary id="summary" />
        <Input id="a" />
      </Form>,
    );
    const summary = findById<ValidationSummaryWidget>("summary")!;
    const buffer = new ScreenBuffer(20, 5);
    expect(() => summary.render(buffer)).not.toThrow();
  });

  test("render clamps a stale selectedIndex to the shrunken item list", async () => {
    const { findById } = await mountApp(
      <Form id="form">
        <ValidationSummary id="summary" />
        <Input id="a" validators={[required("A required")]} validateOn="submit" />
        <Input id="b" validators={[required("B required")]} validateOn="submit" />
      </Form>,
    );
    findById<FormWidget>("form")!.validate();
    const summary = findById<ValidationSummaryWidget>("summary")!;
    (summary as unknown as { selectedIndex: number }).selectedIndex = 5;
    const buffer = new ScreenBuffer(20, 5);
    expect(() => summary.render(buffer)).not.toThrow();

    findById<InputWidget>("b")!.value = "fixed"; // only "a" stays invalid
    (summary as unknown as { selectedIndex: number }).selectedIndex = 5;
    expect(() => summary.render(buffer)).not.toThrow();
  });
});
