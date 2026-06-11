import { useEffect, useRef, useState } from "react";
import type { Widget } from "../src/dom/widget.ts";
import { App, Dock, Footer, Header, hotkeys, RichLog, render } from "../src/index.ts";

// A scripted "agent" turn: each step appends one or more markup lines to the
// log, the way a real streaming agent would emit reasoning, tool calls, tool
// output, and a final answer. RichLog wraps every entry to its width, keeps
// only the visible rows on screen, and tails the bottom as new lines arrive.
const STEPS: string[][] = [
  ["[dim]›[/] [bold]user[/]: summarize the open PRs and flag anything risky"],
  ["[magenta]thinking…[/] [dim]I'll list PRs, then inspect the risky-looking ones.[/]"],
  ['[cyan]⚙ tool[/] [bold]gh.pr_list[/] [dim]{ state: "open", limit: 20 }[/]'],
  [
    "[dim]  → 7 open PRs[/]",
    "[dim]  #312 feat(richlog): streaming log   +126/-0[/]",
    "[dim]  #309 chore: bump deps              +18/-902[/]",
    "[dim]  #305 fix(auth): rotate tokens       +44/-12[/]",
  ],
  ["[magenta]thinking…[/] [dim]#309 deletes 900 lines — worth a closer look.[/]"],
  ["[cyan]⚙ tool[/] [bold]gh.pr_diff[/] [dim]{ number: 309 }[/]"],
  [
    "[yellow]⚠ warning[/] #309 removes [bold]src/legacy/session.ts[/] — still imported by 3 files.",
    "[dim]  callers: app.ts, login.ts, middleware/auth.ts[/]",
  ],
  ["[cyan]⚙ tool[/] [bold]gh.pr_checks[/] [dim]{ number: 305 }[/]"],
  ["[red]✗ ci[/] #305 [bold]auth-e2e[/] failing: [dim]token refresh returns 401[/]"],
  [
    "[green]✔ done[/] [bold]Summary[/]",
    "  • [green]#312[/] safe — additive, fully tested",
    "  • [yellow]#309[/] risky — deletes a module 3 files still import; request changes",
    "  • [red]#305[/] blocked — auth-e2e red on token refresh",
  ],
];

function RichLogDemo() {
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const step = useRef(0);

  // Drive the scripted stream on a timer; pause/resume/clear via hotkeys.
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      const s = STEPS[step.current % STEPS.length];
      const turn = Math.floor(step.current / STEPS.length) + 1;
      setLines((prev) => [
        ...prev,
        ...(step.current % STEPS.length === 0 ? [`[dim]── turn ${turn} ──[/]`] : []),
        ...s,
      ]);
      step.current += 1;
    }, 700);
    return () => clearInterval(id);
  }, [paused]);

  useEffect(() => {
    const unbind = [
      hotkeys.register({ key: "space", name: "Pause/resume", handler: () => setPaused((p) => !p) }),
      hotkeys.register({ key: "c", name: "Clear", handler: () => setLines([]) }),
    ];
    return () => {
      for (const u of unbind) u();
    };
  }, []);

  return (
    <Dock style={{ background: "#11111b" }}>
      <Header>
        🤖 ZTUI RichLog — streaming agent transcript {paused ? "[paused]" : "[streaming]"}
      </Header>
      <Footer>
        ↑/↓ scroll · PgUp/PgDn · Home/End (End resumes tail) · Space pause · c clear · Ctrl+C quit
      </Footer>
      <RichLog style={{ padding: 1 }} lines={lines} maxLines={2000} />
    </Dock>
  );
}

const app = new App();
render(<RichLogDemo />, app.activeScreen);
app.run();

// Auto-focus the log so the keyboard scrolls it without a Tab first.
const focusLog = () => {
  let log: Widget | null = null;
  app.activeScreen.walk((node) => {
    if ((node as Widget).tagName === "richlog") log = node as Widget;
  });
  if (log) app.activeScreen.focusWidget(log);
  else setTimeout(focusLog, 10);
};
focusLog();
