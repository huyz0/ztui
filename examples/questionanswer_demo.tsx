import { useState } from "react";
import { Footer, Header, Label, type QAResult, QuestionAnswer, VBox } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";

// Showcases the QuestionAnswer composite: a single-select ask with free text,
// a multi-select ask, and a horizontal yes/no-style ask. Each reports its
// answer below the widget via onSubmit. Tab/Shift-Tab move between the answers,
// the free-text field and the submit button.

function QADemo() {
  const [dbAnswer, setDbAnswer] = useState<QAResult | null>(null);
  const [checks, setChecks] = useState<QAResult | null>(null);
  const [migrate, setMigrate] = useState<QAResult | null>(null);

  const fmt = (r: QAResult | null) =>
    r ? `selected=[${r.selected.join(", ")}]${r.other ? ` other="${r.other}"` : ""}` : "—";

  return (
    <VBox style={{ background: "$surface", padding: 1 }}>
      <Header>◍ ZTUI QuestionAnswer</Header>
      <Footer>tab next field · ↑↓ move · space select · enter submit{quitHint()}</Footer>

      <Label style={{ color: "$foreground", bold: true, margin: { top: 1 } }}>
        single-select + free text
      </Label>
      <QuestionAnswer
        style={{ margin: { top: 0, bottom: 0 }, width: 50, borderColor: "$panel" }}
        question="Which database should I use for the cache?"
        options={[
          { label: "Redis", hint: "in-memory, fast" },
          { label: "Postgres", hint: "durable, already running" },
          { label: "SQLite", hint: "zero-config, single file" },
        ]}
        allowOther
        onSubmit={setDbAnswer}
      />
      <Label style={{ color: "$dimmed" }}>{fmt(dbAnswer)}</Label>

      <Label style={{ color: "$foreground", bold: true, margin: { top: 1 } }}>multi-select</Label>
      <QuestionAnswer
        style={{ width: 50, borderColor: "$panel" }}
        question="Which checks should run before deploy?"
        mode="multi"
        options={[
          { label: "Lint" },
          { label: "Unit tests" },
          { label: "Type check" },
          { label: "E2E" },
        ]}
        allowOther
        onSubmit={setChecks}
      />
      <Label style={{ color: "$dimmed" }}>{fmt(checks)}</Label>

      <Label style={{ color: "$foreground", bold: true, margin: { top: 1 } }}>
        horizontal yes/no
      </Label>
      <QuestionAnswer
        style={{ width: 50, borderColor: "$panel" }}
        question="Proceed with the migration?"
        orientation="horizontal"
        options={[{ label: "Yes" }, { label: "No" }, { label: "Dry-run first" }]}
        onSubmit={setMigrate}
      />
      <Label style={{ color: "$dimmed" }}>{fmt(migrate)}</Label>
    </VBox>
  );
}

import type { Demo } from "./gallery/types.ts";

export const qaDemo: Demo = {
  id: "qa",
  title: "Question / Answer",
  group: "Feedback",
  description: "Inline Q&A prompts.",
  autoFocusTag: "@first",
  Component: QADemo,
};
