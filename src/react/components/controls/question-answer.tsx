import { useCallback, useState } from "react";
import { VBox } from "../layout/vbox.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";
import { Button } from "./button.tsx";
import { Checkbox } from "./checkbox.tsx";
import { Form } from "./form.tsx";
import { Input } from "./input.tsx";
import { RadioGroup } from "./radio-group.tsx";

/** Pick one answer (`single`, radio) or several (`multi`, checkboxes). */
export type QAMode = "single" | "multi";

/** One selectable answer. */
export interface QAOption {
  /** Text shown to the user. */
  label: string;
  /** Value reported in the result; defaults to `label`. */
  value?: string;
  /** Dimmed help text appended after the label. */
  hint?: string;
}

/** The value produced when the user submits. */
export interface QAResult {
  /** Values of the chosen options. */
  selected: string[];
  /** Free-text answer when the "Other" field was filled in. */
  other?: string;
}

export interface QuestionAnswerProps extends ComponentProps {
  /** The prompt shown above the answers. */
  question: string;
  /** The selectable answers. */
  options: QAOption[];
  /** Pick one (`single`) or several (`multi`). Default `single`. */
  mode?: QAMode;
  /** Lay the answers out vertically (default) or in a row. */
  orientation?: "vertical" | "horizontal";
  /** Append a free-text "Other" input below the options. */
  allowOther?: boolean;
  /** Placeholder/label for the free-text input. Defaults to `Other`. */
  otherLabel?: string;
  /** Submit-button caption. Defaults to `Submit`. */
  submitLabel?: string;
  /** Fired once with the collected answer when the user submits. */
  onSubmit?: (result: QAResult) => void;
}

const optValue = (o: QAOption): string => o.value ?? o.label;
const optLabel = (o: QAOption): string => (o.hint ? `${o.label} — ${o.hint}` : o.label);

/**
 * A "ask the user a question" composite: a prompt, radio/checkbox answers, an
 * optional free-text "Other" input, and a submit button — assembled from the
 * library's own `Form`, `RadioGroup`, `Checkbox`, `Input` and `Button` widgets.
 *
 * Building it from existing widgets (rather than a bespoke renderer) means it
 * inherits their behaviour for free: real text entry and horizontal scrolling
 * in the `Other` field, Tab/Shift-Tab focus traversal across the answers and the
 * button, button activation on Enter/Space, and consistent theming.
 *
 * Aimed at LLM-as-tool flows that present options and await a choice; the answer
 * arrives via `onSubmit`:
 *
 * ```tsx
 * <QuestionAnswer
 *   question="Which database for the cache?"
 *   options={[{ label: "Redis" }, { label: "Postgres", value: "pg" }]}
 *   allowOther
 *   onSubmit={({ selected, other }) => ...}
 * />
 * ```
 */
export function QuestionAnswer({
  question,
  options,
  mode = "single",
  orientation = "vertical",
  allowOther = false,
  otherLabel = "Other",
  submitLabel = "Submit",
  onSubmit,
  style,
  ...rest
}: QuestionAnswerProps) {
  const [single, setSingle] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [other, setOther] = useState("");

  const handleSubmit = useCallback(() => {
    const selected =
      mode === "multi"
        ? options.filter((o) => checked[optValue(o)]).map(optValue)
        : single
          ? [single]
          : [];
    const trimmed = other.trim();
    onSubmit?.({ selected, other: trimmed || undefined });
  }, [mode, options, checked, single, other, onSubmit]);

  const answers =
    mode === "single" ? (
      <RadioGroup
        options={options.map((o) => ({ label: optLabel(o), value: optValue(o) }))}
        value={single}
        orientation={orientation}
        onChange={setSingle}
      />
    ) : (
      <VBox style={{ flexDirection: orientation === "horizontal" ? "row" : "column" }}>
        {options.map((o) => {
          const v = optValue(o);
          return (
            <Checkbox
              key={v}
              label={optLabel(o)}
              checked={!!checked[v]}
              onChange={(c) => setChecked((prev) => ({ ...prev, [v]: c }))}
              style={orientation === "horizontal" ? { margin: { right: 2 } } : undefined}
            />
          );
        })}
      </VBox>
    );

  return (
    <Form
      {...rest}
      messageMode="none"
      onSubmit={handleSubmit}
      style={{ border: "rounded", ...style }}
    >
      <Label>{question}</Label>
      {answers}
      {allowOther && (
        <Input
          placeholder={`${otherLabel}…`}
          value={other}
          onChange={setOther}
          style={{ margin: { top: 1 } }}
        />
      )}
      <Button formAction="submit">{submitLabel}</Button>
    </Form>
  );
}
