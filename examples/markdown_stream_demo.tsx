import { useEffect, useRef, useState } from "react";
import type { Widget } from "../src/dom/widget.ts";
import { App, Dock, Footer, Header, hotkeys, Markdown, render } from "../src/index.ts";

// A markdown document streamed in small chunks, the way a model emits tokens.
// The Markdown widget re-lexes only the trailing (incomplete) block each tick
// and reuses the already-rendered blocks above, so a long answer stays smooth.
const DOC = `# Streaming Markdown

Here's a short answer that arrives **one chunk at a time**, just like a model
streaming tokens into the terminal.

## What it shows

- committed blocks above the cursor are *not* re-parsed
- the trailing block re-lexes as it grows
- inline styles like \`code\`, **bold**, and _italics_ resolve live

## A code block

\`\`\`ts
function greet(name: string) {
  return \`hello, \${name}\`;
}
\`\`\`

> Blockquotes, lists, and headings all stream the same way.

That's it — **done**.
`;

// Split into model-like chunks: a few characters at a time, but never break in a
// way that matters since the widget repairs the incomplete tail each tick.
function chunk(text: string, size = 4): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}
const CHUNKS = chunk(DOC);

function MarkdownStreamDemo() {
  const [shown, setShown] = useState("");
  const [paused, setPaused] = useState(false);
  const i = useRef(0);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (i.current >= CHUNKS.length) {
        i.current = 0;
        setShown("");
        return;
      }
      setShown((s) => s + CHUNKS[i.current]);
      i.current += 1;
    }, 90);
    return () => clearInterval(id);
  }, [paused]);

  useEffect(() => {
    const unbind = [
      hotkeys.register({ key: "space", name: "Pause/resume", handler: () => setPaused((p) => !p) }),
      hotkeys.register({
        key: "r",
        name: "Restart",
        handler: () => {
          i.current = 0;
          setShown("");
        },
      }),
    ];
    return () => {
      for (const u of unbind) u();
    };
  }, []);

  return (
    <Dock style={{ background: "$surface" }}>
      <Header>
        📝 ZTUI Markdown — streaming token-by-token {paused ? "[paused]" : "[streaming]"}
      </Header>
      <Footer>Space pause · r restart · Ctrl+C quit</Footer>
      <Markdown style={{ padding: 1 }}>{shown}</Markdown>
    </Dock>
  );
}

const app = new App();
render(<MarkdownStreamDemo />, app.activeScreen);
app.run();

// Auto-focus the markdown view so wheel/keys scroll it without a Tab first.
const focusMd = () => {
  let md: Widget | null = null;
  app.activeScreen.walk((node) => {
    if ((node as Widget).tagName === "markdown") md = node as Widget;
  });
  if (md) app.activeScreen.focusWidget(md);
  else setTimeout(focusMd, 10);
};
focusMd();
