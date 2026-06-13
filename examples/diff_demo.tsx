import { useState } from "react";
import { hotkeys } from "../src/core.ts";
import { Diff, Dock, Footer, Header, Label, VBox } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";

// The view a coding agent shows when it proposes a file edit: a syntax-
// highlighted diff with a +/- gutter and line numbers. Toggle unified vs
// split, and full-file vs collapsed context, the way you'd review a patch.
const OLD = `import { readFile } from "node:fs";

function loadConfig(path) {
  return new Promise((resolve, reject) => {
    readFile(path, "utf8", (err, data) => {
      if (err) reject(err);
      else resolve(JSON.parse(data));
    });
  });
}

export function greet(name) {
  const msg = "hello " + name;
  console.log(msg);
  return msg;
}

export function farewell(name) {
  console.log("bye " + name);
}

export class Session {
  constructor(user) {
    this.user = user;
    this.started = Date.now();
  }

  duration() {
    return Date.now() - this.started;
  }

  describe() {
    return this.user + " active for " + this.duration() + "ms";
  }
}

const DEFAULTS = {
  retries: 3,
  timeout: 5000,
};

export function withDefaults(opts) {
  return Object.assign({}, DEFAULTS, opts);
}`;

const NEW = `import { readFile } from "node:fs/promises";

async function loadConfig(path: string): Promise<Config> {
  const data = await readFile(path, "utf8");
  return JSON.parse(data) as Config;
}

export function greet(name: string): string {
  const msg = \`hello \${name}\`;
  console.log(msg);
  return msg;
}

export function farewell(name: string): void {
  console.log(\`bye \${name}\`);
}

export class Session {
  constructor(public readonly user: string) {
    this.started = Date.now();
  }

  private started: number;

  duration(): number {
    return Date.now() - this.started;
  }

  describe(): string {
    return \`\${this.user} active for \${this.duration()}ms\`;
  }
}

const DEFAULTS = {
  retries: 5,
  timeout: 10_000,
  backoff: "exponential",
};

export function withDefaults(opts: Options): Options {
  return { ...DEFAULTS, ...opts };
}`;

function DiffDemo() {
  const [full, setFull] = useState(false);

  hotkeys.register({ key: "c", name: "Context", handler: () => setFull((f) => !f) });

  return (
    <Dock style={{ background: "$surface" }}>
      <Header>🪢 ZTUI Diff — a proposed edit to greet.ts</Header>
      <Footer>
        click Unified/Split to switch view · c collapse/full context · ↑↓ scroll{quitHint()}
      </Footer>

      <VBox style={{ padding: 1 }}>
        <Label style={{ dim: true, margin: { bottom: 1 } }}>
          {full ? "full file" : "3 lines of context"} — click the tabs above the diff to switch view
        </Label>
        <Diff
          language="ts"
          oldText={OLD}
          newText={NEW}
          defaultView="unified"
          context={full ? Number.POSITIVE_INFINITY : 3}
          style={{
            flexGrow: 1,
            border: "round",
            borderColor: "$primary",
            padding: { left: 1, right: 1 },
          }}
        />
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const diffDemo: Demo = {
  id: "diff",
  title: "Diff",
  group: "Data",
  description: "Side-by-side / unified diff viewer.",
  autoFocusTag: "diff",
  Component: DiffDemo,
};
