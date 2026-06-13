import { useState } from "react";
import { hotkeys } from "../src/core.ts";
import {
  Button,
  Dock,
  Footer,
  HBox,
  Header,
  Label,
  RichLog,
  Spinner,
  useWorker,
  VBox,
} from "../src/react.ts";

// A cancellable async task, the way an agent loop runs one model/tool call at a
// time: Run starts a job, Run again supersedes the in-flight one (latest wins),
// Cancel aborts it. The task respects the AbortSignal so it stops promptly.
const STEPS = [
  "connecting to model…",
  "streaming tokens…",
  "calling tool: read_file…",
  "calling tool: grep…",
  "composing answer…",
];

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(id);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}

function WorkerDemo() {
  const job = useWorker<string>();
  const [log, setLog] = useState<string[]>([]);

  const start = () => {
    setLog([]);
    job.run(async (signal) => {
      for (const step of STEPS) {
        await sleep(700, signal);
        setLog((l) => [...l, `[dim]·[/] ${step}`]);
      }
      return "All steps complete.";
    });
  };

  hotkeys.register({ key: "r", name: "Run", handler: start });
  hotkeys.register({ key: "x", name: "Cancel", handler: () => job.cancel() });

  const statusColor =
    job.status === "success"
      ? "$success"
      : job.status === "error" || job.status === "cancelled"
        ? "$error"
        : "$accent";

  return (
    <Dock style={{ background: "$surface" }}>
      <Header>🧵 ZTUI useWorker — one cancellable task at a time</Header>
      <Footer>r run (again = supersede) · x cancel · Ctrl+C quit</Footer>

      <VBox style={{ padding: 1 }}>
        <HBox style={{ height: 1, margin: { bottom: 1 } }}>
          {job.isRunning ? <Spinner /> : <Label style={{ color: statusColor }}>●</Label>}
          <Label style={{ margin: { left: 1 }, color: statusColor }}>{` ${job.status}`}</Label>
          {job.status === "success" && <Label style={{ dim: true }}>{`  — ${job.data}`}</Label>}
        </HBox>

        <HBox style={{ height: 1, margin: { bottom: 1 } }}>
          <Button onClick={start} style={{ margin: { right: 1 } }}>
            Run
          </Button>
          <Button onClick={() => job.cancel()}>Cancel</Button>
        </HBox>

        <RichLog lines={log} style={{ height: 8, border: "round", borderColor: "$primary" }} />
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const workerDemo: Demo = {
  id: "worker",
  title: "Worker",
  group: "Overview",
  description: "Background worker integration.",
  Component: WorkerDemo,
};
