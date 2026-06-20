import type { ReactNode } from "react";
import { Dock, Footer, HBox, Header, Label, VBox } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";

// One labelled box. The border config is passed straight through as style, so
// each cell shows exactly the styles a user would write.
function Cell({
  title,
  sub,
  style,
}: {
  title: string;
  sub: string;
  style: Record<string, unknown>;
}) {
  return (
    <VBox
      style={{
        width: 24,
        height: 4,
        padding: { left: 1, right: 1 },
        margin: { right: 2, bottom: 1 },
        ...style,
      }}
    >
      <Label>{title}</Label>
      <Label style={{ color: "$dimmed" }}>{sub}</Label>
    </VBox>
  );
}

/** Split cells into rows of `perRow` so they wrap (there is no flex-wrap). */
function inRows(cells: ReactNode[], perRow: number): ReactNode {
  const rows: ReactNode[] = [];
  for (let i = 0; i < cells.length; i += perRow) {
    rows.push(<HBox key={i}>{cells.slice(i, i + perRow)}</HBox>);
  }
  return rows;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <VBox style={{ margin: { bottom: 1 } }}>
      <Label style={{ bold: true, color: "$foreground" }}>{title}</Label>
      <VBox style={{ margin: { top: 1 } }}>{children}</VBox>
    </VBox>
  );
}

// Every full-box weight, including the new heavy / bar / block.
const WEIGHTS: Array<{ w: string; c: string }> = [
  { w: "thin", c: "$secondary" },
  { w: "solid", c: "$secondary" },
  { w: "rounded", c: "$success" },
  { w: "heavy", c: "$primary" },
  { w: "double", c: "$warning" },
  { w: "dashed", c: "$error" },
  { w: "bar", c: "$accent" },
  { w: "block", c: "$primary" },
];

// A single corner-less edge — color = meaning, weight = emphasis (Toast-style).
const SIDES: Array<{ prop: string; w: string; c: string }> = [
  { prop: "borderLeft", w: "heavy", c: "$primary" },
  { prop: "borderTop", w: "thin", c: "$success" },
  { prop: "borderRight", w: "double", c: "$warning" },
  { prop: "borderBottom", w: "bar", c: "$accent" },
];

// Mixing `border` with a per-side override: a side wins over the all-sides
// value, and `"none"` drops one edge.
const MIXED: Array<{ title: string; sub: string; style: Record<string, unknown> }> = [
  {
    title: "frame + accent",
    sub: 'thin + left "heavy"',
    style: { border: "thin", borderLeft: "heavy", borderColor: "$primary" },
  },
  {
    title: "open bottom",
    sub: 'rounded, bottom "none"',
    style: { border: "rounded", borderBottom: "none", borderColor: "$success" },
  },
  {
    title: "top & bottom rails",
    sub: "top + bottom only",
    style: { borderTop: "double", borderBottom: "double", borderColor: "$warning" },
  },
  {
    title: "block accent",
    sub: 'thin + left "block"',
    style: { border: "thin", borderLeft: "block", borderColor: "$error" },
  },
];

function BorderDemo() {
  return (
    <Dock style={{ background: "$surface" }}>
      <Header>🟦 ZTUI Borders — weights · single-side bars · per-side overrides</Header>
      <Footer>color = meaning, weight = emphasis (like Toast info/warn/error){quitHint("")}</Footer>

      <VBox style={{ flexGrow: 1, padding: 1 }}>
        <Section title="Full-box weights">
          {inRows(
            WEIGHTS.map((s) => (
              <Cell
                key={s.w}
                title={s.w}
                sub={`"${s.w}"`}
                style={{ border: s.w, borderColor: s.c }}
              />
            )),
            3,
          )}
        </Section>

        <Section title="Single-side accent bars (no corners)">
          {inRows(
            SIDES.map((s) => (
              <Cell
                key={s.prop}
                title={s.prop}
                sub={`"${s.w}"`}
                style={{ [s.prop]: s.w, borderColor: s.c }}
              />
            )),
            3,
          )}
        </Section>

        <Section title="Per-side mix & override">
          {inRows(
            MIXED.map((s) => <Cell key={s.title} title={s.title} sub={s.sub} style={s.style} />),
            3,
          )}
        </Section>
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const borderDemo: Demo = {
  id: "border",
  title: "Borders",
  group: "Layout",
  description: "All border weights, corner-less single-side bars, and per-side overrides.",
  Component: BorderDemo,
};
