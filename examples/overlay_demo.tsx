import { useMemo, useRef, useState } from "react";
// Demonstrates the two overlay flavours:
//   • Dialog      — a modal that traps focus and closes on Esc / backdrop click.
//   • StickyPanel — a non-modal slash-command popup that floats above the chat
//                   input WITHOUT stealing focus: you keep typing, ↑/↓ move the
//                   highlight, Enter inserts the command, and the list filters
//                   live as you type.
import {
  App,
  Button,
  Dialog,
  Footer,
  Header,
  Input,
  Label,
  render,
  StickyPanel,
  VBox,
  type Widget,
} from "../src/index.ts";

const COMMANDS = ["/help", "/clear", "/model", "/retry", "/exit", "/theme", "/copy"];

function ChatDemo() {
  const [text, setText] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<Widget>(null);

  // The slash menu is open whenever the input is a bare "/word" token.
  const slashQuery = /(^|\s)\/(\w*)$/.exec(text)?.[2];
  const menuOpen = slashQuery !== undefined;
  const matches = useMemo(
    () => (menuOpen ? COMMANDS.filter((c) => c.slice(1).startsWith(slashQuery ?? "")) : []),
    [menuOpen, slashQuery],
  );

  const insert = (cmd: string) => {
    setText((t) => `${t.replace(/\/(\w*)$/, cmd)} `);
    setHighlight(0);
  };

  return (
    <VBox style={{ width: "100%", height: "100%", background: "$background" }}>
      <Header>ztui — Dialog & StickyPanel</Header>

      <VBox style={{ flexGrow: 1, padding: 1 }}>
        <Label style={{ dim: true }}>
          Type "/" to open the command menu (focus stays in the input). Press the button to open a
          modal dialog.
        </Label>
        <Button onClick={() => setDialogOpen(true)} style={{ margin: { top: 1 }, width: 20 }}>
          Open dialog
        </Button>
      </VBox>

      {/* The chat input keeps focus the whole time the slash menu is up. */}
      <Input
        ref={inputRef}
        id="chat"
        value={text}
        onChange={setText}
        placeholder="Message the agent…  (try /he)"
        style={{ margin: 1 }}
      />
      <Footer>Tab: focus · Esc: close dialog · ↑/↓ + Enter: pick command</Footer>

      {/* Anchored above the input — placement="above" and auto screen-clamping
          keep it from overlapping the textbox or running off any edge. */}
      <StickyPanel
        open={menuOpen && matches.length > 0}
        anchorRef={inputRef}
        placement="above"
        panelStyle={{ width: 36, background: "$panel" }}
        onKeyIntercept={(ev) => {
          if (ev.name === "down") {
            setHighlight((h) => Math.min(matches.length - 1, h + 1));
            ev.handled = true;
          } else if (ev.name === "up") {
            setHighlight((h) => Math.max(0, h - 1));
            ev.handled = true;
          } else if (ev.name === "enter") {
            if (matches[highlight]) insert(matches[highlight]);
            ev.handled = true;
          }
        }}
      >
        {matches.map((cmd, i) => (
          <Label
            key={cmd}
            onClick={() => insert(cmd)}
            style={{
              padding: { left: 1, right: 1 },
              background: i === highlight ? "$primary" : undefined,
              color: i === highlight ? "$background" : undefined,
            }}
          >
            {cmd}
          </Label>
        ))}
      </StickyPanel>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} dim>
        <Label style={{ bold: true }}>Clear the conversation?</Label>
        <Label style={{ dim: true, margin: { bottom: 1 } }}>This can't be undone.</Label>
        <Button onClick={() => setDialogOpen(false)} style={{ width: 18 }}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            setText("");
            setDialogOpen(false);
          }}
          style={{ width: 18 }}
        >
          Clear
        </Button>
      </Dialog>
    </VBox>
  );
}

const app = new App();
render(<ChatDemo />, app.activeScreen);
app.run();
