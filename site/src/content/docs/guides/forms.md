---
title: Form validation & disabled state
description: ztui's form system — validators, per-field triggers, the Form container, message display modes, and the disabled state that propagates through a subtree.
---

ztui ships a small, composable form system. Each control owns its own
validation state; a `<Form>` coordinates the group on submit. Nothing reserves
screen space until an error actually appears, which keeps dense forms compact in
a terminal.

## Validators

A **validator** is a plain function: it takes the field's value and returns
whether it passed. The loose return shape is normalized for you, so you can
return whatever is most convenient:

- `null` / `undefined` / `true` → valid
- a `string` → invalid, the string is the error message
- a `ValidationResult` (`{ valid, message?, severity? }`) → used as-is

```ts
import type { Validator } from "@huyz0/ztui";

// the long form
const notTaken: Validator<string> = (v) =>
  takenNames.has(v) ? { valid: false, message: "Already taken", severity: "warning" } : null;
```

ztui bundles the common ones (all importable from `@huyz0/ztui`):

| Validator | Fails when |
|-----------|------------|
| `required(msg?)`        | value is empty (`null`, `""`, `false`, or `[]`) |
| `minLength(n, msg?)`    | string shorter than `n` |
| `maxLength(n, msg?)`    | string longer than `n` |
| `pattern(re, msg?)`     | non-empty string doesn't match `re` |
| `email(msg?)`           | non-empty string isn't a valid email |
| `range(min, max, msg?)` | number outside `[min, max]` |
| `oneOf(allowed, msg?)`  | value isn't in `allowed` |
| `custom(predicate, msg)`| `predicate(value)` is false |

Attach them to any control with the `validators` prop. They run in order;
**the first `error` wins**, and a `warning` only surfaces if nothing harder
failed — so you can stack a hard rule and a soft hint on one field.

```tsx
import { email, minLength, required } from "@huyz0/ztui";
import { Form, Input } from "@huyz0/ztui/react";

<Form onSubmit={(values) => save(values)}>
  <Input id="email" validators={[required("Email is required"), email()]} />
  <Input id="password" validators={[required(), minLength(8, "Use at least 8 characters")]} />
</Form>;
```

### When a field re-validates

The `validateOn` prop picks the trigger: `"blur"` (default), `"change"`,
`"submit"`, or `"manual"`. Whatever you choose, once a field has been validated
**every keystroke re-validates it** — so an error clears the moment the user
fixes it, rather than lingering until the next blur.

A field also tracks a `touched` flag: messages and error coloring only show
*after* the first validation, so a pristine form isn't a wall of red.

## The Form container

`<Form>` is a vertical box that coordinates its descendant fields. It doesn't
need to wrap them directly — it walks the whole subtree, so fields can sit
inside any layout. Submission is triggered by a descendant
`<Button formAction="submit">` or an imperative `formWidget.submit()`:

- every field validates;
- the **first invalid field is focused**;
- `onSubmit(values)` fires only when all fields pass.

`values` is keyed by each field's `id` (falling back to document order). Use
`formAction="reset"` (or `formWidget.reset()`) to clear validation state without
clearing the values.

```tsx
<Form onSubmit={(v) => console.log(v)} onValidate={(ok) => setCanSave(ok)}>
  <Input id="name" validators={[required()]} />
  <Button formAction="submit">Save</Button>
  <Button formAction="reset">Clear</Button>
</Form>
```

## Showing error messages

Terminal rows are scarce, so the form is frugal about where messages go. Pick
with the `messageMode` prop:

| Mode | Behavior |
|------|----------|
| `"auto"` / `"shared"` (default) | One status line on the form's bottom row, showing the **focused** field's message. N fields cost at most one row. |
| `"inline"` | Defers to per-field `<FieldError>` widgets you place yourself. |
| `"none"`   | No text — relies on border/icon color alone. |

Two widgets help when you want more than the shared line:

- **`<FieldError>`** — an inline, per-field message. It collapses to **zero
  height** while its field is valid, so the layout doesn't jump until an error
  appears. Binds to the nearest preceding sibling field, or set `targetId`.
- **`<ValidationSummary>`** — lists every currently-invalid field, one per row,
  and lets the user jump to a field (↑/↓ then Enter, or click). Collapses to
  zero height when the form is valid. Good for tall or scrollable forms. Binds
  to the nearest ancestor `<Form>`, or set `formId`.

Severity drives color through theme tokens: `$error`, `$warning`, `$success`.

### Forcing the invalid style

`<Input>` also accepts `invalid` to force the error style regardless of its
validators — handy for server-side errors that the client validators can't know
about.

## Disabled state

Any widget accepts `disabled`. A disabled widget (and its descendants) is
**inert**: not focusable, ignores key and mouse input, and interactive controls
render in a muted style.

The key behavior is **propagation** — `disabled` is checked through the
ancestor chain, so disabling a container disables everything inside it. Wrap a
whole `<Form>` (or any section) to switch the group off in one place:

```tsx
<Form disabled={submitting}>
  <Input id="name" validators={[required()]} />
  <Button formAction="submit">{submitting ? "Saving…" : "Save"}</Button>
</Form>
```

This is cheaper and less error-prone than threading a `disabled` prop into every
control, and it's the same mechanism a custom widget gets for free — call
`isDisabled()` (which walks ancestors) rather than reading the local `disabled`
flag when deciding whether to handle input.

## See also

- [Focus, keys & hotkeys](/ztui/guides/input/) — how focus and key dispatch work,
  which disabled fields opt out of.
- [Extending ztui](/ztui/guides/extending/) — `attachFieldValidation()` wires a
  custom control into this system; it only has to say how to read its value.
