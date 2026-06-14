import { App } from "../../core/app.ts";
import type { Widget } from "../../dom/widget.ts";

/** Severity of a validation outcome, mapped to a theme color token. */
export type Severity = "error" | "warning" | "success";

/** Normalized result of validating a single field. */
export interface ValidationResult {
  /** Whether the value passed. */
  valid: boolean;
  /** Message to show when invalid (or for a success/warning note). */
  message?: string;
  /** Severity driving the control's color (defaults to `"error"` when invalid). */
  severity?: Severity;
}

/**
 * A validator inspects a value and reports whether it passes.
 *
 * Return shapes (all normalized by {@link normalizeResult}):
 *  - `null` / `undefined` / `true`  → valid
 *  - a `string`                     → invalid, the string is the error message
 *  - a `ValidationResult`           → used as-is
 */
export type Validator<T = any> = (
  value: T,
) => ValidationResult | string | boolean | null | undefined;

const VALID: ValidationResult = { valid: true };

/** Coerce a validator's loose return value into a {@link ValidationResult}. */
export function normalizeResult(
  raw: ValidationResult | string | boolean | null | undefined,
): ValidationResult {
  if (raw == null || raw === true) return VALID;
  if (raw === false) return { valid: false, severity: "error" };
  if (typeof raw === "string") return { valid: false, message: raw, severity: "error" };
  if (raw.valid) return raw.severity ? raw : { ...raw, severity: "success" };
  return { severity: "error", ...raw };
}

/**
 * Runs validators in order and returns the first non-passing result, defaulting
 * to a `valid` result when every validator passes. A `warning` result does not
 * short-circuit unless it is the only failure — `error` always wins.
 */
export function runValidators<T>(value: T, validators: Validator<T>[]): ValidationResult {
  let firstWarning: ValidationResult | null = null;
  for (const v of validators) {
    const res = normalizeResult(v(value));
    if (res.valid) continue;
    if (res.severity === "warning") {
      firstWarning ??= res;
      continue;
    }
    return res; // first error wins
  }
  return firstWarning ?? VALID;
}

// ── Built-in validators ──────────────────────────────────────────────────────

const isEmpty = (v: any): boolean =>
  v == null || v === "" || v === false || (Array.isArray(v) && v.length === 0);

/** Fails when the value is empty (null, "", false, or an empty array). */
export function required(message = "This field is required"): Validator {
  return (v) => (isEmpty(v) ? message : null);
}

/** Fails when the string is shorter than `n` characters. */
export function minLength(n: number, message?: string): Validator<string> {
  return (v) => ((v?.length ?? 0) < n ? (message ?? `Must be at least ${n} characters`) : null);
}

/** Fails when the string is longer than `n` characters. */
export function maxLength(n: number, message?: string): Validator<string> {
  return (v) => ((v?.length ?? 0) > n ? (message ?? `Must be at most ${n} characters`) : null);
}

/** Fails when a non-empty string doesn't match `re`. */
export function pattern(re: RegExp, message = "Invalid format"): Validator<string> {
  return (v) => (!v || re.test(v) ? null : message);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Fails when a non-empty string isn't a valid email address. */
export function email(message = "Enter a valid email address"): Validator<string> {
  return (v) => (!v || EMAIL_RE.test(v) ? null : message);
}

/** Fails when the number is outside `[min, max]`. */
export function range(min: number, max: number, message?: string): Validator<number> {
  return (v) => (v < min || v > max ? (message ?? `Must be between ${min} and ${max}`) : null);
}

/** Fails when the value isn't one of `allowed`. */
export function oneOf<T>(allowed: T[], message = "Not an allowed value"): Validator<T> {
  return (v) => (allowed.includes(v) ? null : message);
}

/** Wraps a predicate; returns `message` when the predicate is false. */
export function custom<T>(predicate: (v: T) => boolean, message: string): Validator<T> {
  return (v) => (predicate(v) ? null : message);
}

// ── Widget integration helper ────────────────────────────────────────────────

/** When a field re-validates itself. */
export type ValidateTrigger = "change" | "blur" | "submit" | "manual";

/**
 * A widget that participates in form validation. Controls embed a
 * {@link FieldValidation} helper and forward to it; the helper owns the state
 * machine so each control only supplies its current value.
 */
export interface ValidatableField extends Widget {
  /** The embedded per-field validation state machine. */
  readonly validation: FieldValidation;
  /** Returns the value to validate (e.g. input text, checkbox boolean). */
  getValidationValue(): unknown;
}

/**
 * Per-field validation state + behavior, embedded in a control widget. Keeps the
 * control's `invalid` flag and resolved border/icon color in sync with the
 * latest result, and reports the message for the shared/inline display layers.
 */
export class FieldValidation {
  /** Validators run against the field's value, in order. */
  public validators: Validator[] = [];
  /** When the field re-validates itself. */
  public validateOn: ValidateTrigger = "blur";
  /** The latest validation result. */
  public result: ValidationResult = VALID;
  /** Called after each validation with the normalized result. */
  public onValidate?: (result: ValidationResult) => void;
  /** Becomes true after the field's first validation, gating eager display. */
  public touched = false;

  constructor(private readonly field: ValidatableField) {}

  /** True when the field has been validated and is currently invalid. */
  public get invalid(): boolean {
    return this.touched && !this.result.valid;
  }

  /** The current error message when invalid, else undefined. */
  public get message(): string | undefined {
    return this.invalid ? this.result.message : undefined;
  }

  /** The current severity when invalid, else undefined. */
  public get severity(): Severity | undefined {
    return this.touched && !this.result.valid ? (this.result.severity ?? "error") : undefined;
  }

  /** Runs validators against the field's current value and stores the result. */
  public validate(): ValidationResult {
    this.touched = true;
    this.result = runValidators(this.field.getValidationValue(), this.validators);
    this.onValidate?.(this.result);
    App.instance?.queueRender();
    return this.result;
  }

  /** Re-validates only if the configured trigger matches the given event. */
  public maybeValidate(trigger: ValidateTrigger): void {
    if (this.validators.length === 0) return;
    // Once touched, every change re-validates so an error clears as the user fixes it.
    if (this.validateOn === trigger || (this.touched && trigger === "change")) {
      this.validate();
    }
  }

  /** Resolves the theme color for the current severity, or null when valid. */
  public resolveColor(): string | null {
    const sev = this.severity;
    if (!sev) return null;
    const token = sev === "error" ? "$error" : sev === "warning" ? "$warning" : "$success";
    return App.instance?.cssResolver.resolveVariable(this.field, token) || "red";
  }
}

/**
 * Wires a control into the validation system with the standard prop surface
 * (`validation`, `getValidationValue`, `validators`, `validateOn`, `onValidate`,
 * `invalid`), so a control only supplies how to read its current value. Returns
 * the field's {@link FieldValidation} for use in the control's render.
 *
 * `InputWidget` predates this and inlines the same accessors (it also supports a
 * manual `invalid` override); new controls should prefer this helper.
 */
export function attachFieldValidation(widget: Widget, getValue: () => unknown): FieldValidation {
  const field = widget as ValidatableField;
  (field as any).getValidationValue = getValue;
  const validation = new FieldValidation(field);
  Object.defineProperty(field, "validators", {
    get: () => validation.validators,
    set: (v: Validator[]) => {
      validation.validators = v ?? [];
    },
    enumerable: true,
  });
  Object.defineProperty(field, "validateOn", {
    get: () => validation.validateOn,
    set: (v: ValidateTrigger) => {
      validation.validateOn = v;
    },
    enumerable: true,
  });
  Object.defineProperty(field, "onValidate", {
    get: () => validation.onValidate,
    set: (fn) => {
      validation.onValidate = fn;
    },
    enumerable: true,
  });
  Object.defineProperty(field, "invalid", {
    get: () => validation.invalid,
    enumerable: true,
  });
  return validation;
}
