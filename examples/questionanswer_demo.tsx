import { useState } from "react";
import {
  App,
  Footer,
  Header,
  Label,
  type QAResult,
  QuestionAnswer,
  render,
  VBox,
} from "../src/index.ts";

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
    <VBox style={{ background: "#11111b", padding: 1 }}>
      <Header>◍ ZTUI QuestionAnswer</Header>
      <Footer>tab next field · ↑↓ move · space select · enter submit · Ctrl+C quit</Footer>

      <Label style={{ color: "#cdd6f4", bold: true, margin: { top: 1 } }}>
        single-select + free text
      </Label>
      <QuestionAnswer
        style={{ margin: { top: 0, bottom: 0 }, width: 50, borderColor: "#45475a" }}
        question="Which database should I use for the cache?"
        options={[
          { label: "Redis", hint: "in-memory, fast" },
          { label: "Postgres", hint: "durable, already running" },
          { label: "SQLite", hint: "zero-config, single file" },
        ]}
        allowOther
        onSubmit={setDbAnswer}
      />
      <Label style={{ color: "#a6adc8" }}>{fmt(dbAnswer)}</Label>

      <Label style={{ color: "#cdd6f4", bold: true, margin: { top: 1 } }}>multi-select</Label>
      <QuestionAnswer
        style={{ width: 50, borderColor: "#45475a" }}
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
      <Label style={{ color: "#a6adc8" }}>{fmt(checks)}</Label>

      <Label style={{ color: "#cdd6f4", bold: true, margin: { top: 1 } }}>horizontal yes/no</Label>
      <QuestionAnswer
        style={{ width: 50, borderColor: "#45475a" }}
        question="Proceed with the migration?"
        orientation="horizontal"
        options={[{ label: "Yes" }, { label: "No" }, { label: "Dry-run first" }]}
        onSubmit={setMigrate}
      />
      <Label style={{ color: "#a6adc8" }}>{fmt(migrate)}</Label>
    </VBox>
  );
}

const app = new App();
render(<QADemo />, app.activeScreen);
app.run();

// Focus the first QuestionAnswer so the keyboard works without a Tab first.
// The React tree commits asynchronously, so poll until a focusable exists.
const focusFirst = () => {
  const focusable = app.activeScreen.getFocusableWidgets();
  if (focusable.length > 0) {
    app.activeScreen.focusWidget(focusable[0]);
  } else {
    setTimeout(focusFirst, 10);
  }
};
focusFirst();
