import { useEffect, useState } from "react";
import { Dock, Footer, Header, TerminalView, VBox } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";

// Simulated bash/shell tool output streaming into a sandboxed terminal view:
// ANSI colors, a \r progress bar that redraws in place, then a summary. The
// escape codes are parsed into the widget's own grid — they can't escape it.
const C = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

type Step = { text: string; delay: number };
const SCRIPT: Step[] = [
  { text: `${C.dim("$")} ${C.bold("npm run build")}\n`, delay: 300 },
  { text: `${C.cyan("›")} cleaning dist/\n`, delay: 400 },
  { text: `${C.cyan("›")} compiling typescript…\n`, delay: 500 },
  // Progress bar redrawing in place via \r.
  ...Array.from({ length: 11 }, (_, i) => {
    const pct = i * 10;
    const filled = "█".repeat(i * 2);
    const empty = "░".repeat((10 - i) * 2);
    return {
      text: `\rbundling ${C.green(filled)}${C.dim(empty)} ${String(pct).padStart(3)}%`,
      delay: 160,
    };
  }),
  { text: "\n", delay: 200 },
  { text: `${C.yellow("⚠")} 2 warnings (unused exports)\n`, delay: 400 },
  { text: `${C.green("✓")} build succeeded in ${C.bold("4.2s")}\n`, delay: 300 },
  { text: `${C.dim("$")} ${C.bold("npm test")}\n`, delay: 500 },
  { text: `${C.green("✓")} 525 passed  ${C.red("✗")} 0 failed\n`, delay: 300 },
];

function TerminalViewDemo() {
  const [out, setOut] = useState("");

  useEffect(() => {
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (i >= SCRIPT.length) return;
      const step = SCRIPT[i++];
      setOut((o) => o + step.text);
      timer = setTimeout(tick, step.delay);
    };
    timer = setTimeout(tick, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Dock style={{ background: "$surface" }}>
      <Header>🖥 ZTUI TerminalView — sandboxed streaming command output</Header>
      <Footer>
        ↑↓ scroll · ANSI colors + \r progress · output can't escape the view{quitHint()}
      </Footer>

      <VBox style={{ padding: 1 }}>
        <TerminalView
          content={out}
          style={{
            height: 14,
            border: "round",
            borderColor: "$primary",
            padding: { left: 1, right: 1 },
            background: "#0b0b12",
          }}
        />
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const terminalDemo: Demo = {
  id: "terminal",
  title: "Terminal View",
  group: "Data",
  description: "Embedded terminal output.",
  Component: TerminalViewDemo,
};
