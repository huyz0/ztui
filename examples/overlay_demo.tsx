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
  HBox,
  Header,
  Input,
  Label,
  render,
  StickyPanel,
  ToastHost,
  toast,
  VBox,
  type Widget,
} from "../src/index.ts";

const COMMANDS = ["/help", "/clear", "/model", "/retry", "/exit", "/theme", "/copy"];

function ChatDemo() {
  const [text, setText] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<Widget>(null);

  // The slash menu is open whenever the input ends in a bare "/word" token and
  // the user hasn't dismissed it with Esc.
  const slashQuery = /(^|\s)\/(\w*)$/.exec(text)?.[2];
  const menuOpen = slashQuery !== undefined && !dismissed;
  const matches = useMemo(
    () => (menuOpen ? COMMANDS.filter((c) => c.slice(1).startsWith(slashQuery ?? "")) : []),
    [menuOpen, slashQuery],
  );

  // Typing re-opens the menu after an Esc dismissal.
  const onChange = (v: string) => {
    setDismissed(false);
    setText(v);
  };

  const insert = (cmd: string) => {
    setText((t) => `${t.replace(/\/(\w*)$/, cmd)} `);
    setHighlight(0);
  };

  return (
    <VBox style={{ width: "100%", height: "100%", background: "$background" }}>
      {/* Mounted once; toasts raised anywhere via the `toast` façade appear here. */}
      <ToastHost position="top-right" />

      <Header>ztui — Dialog, StickyPanel & Toasts</Header>

      <VBox style={{ flexGrow: 1, padding: 1 }}>
        <Label style={{ dim: true }}>
          Type "/" to open the command menu (focus stays in the input). Buttons open a modal dialog
          or raise stacked toast notifications.
        </Label>
        <HBox style={{ margin: { top: 1 } }}>
          <Button onClick={() => setDialogOpen(true)} style={{ width: 16, margin: { right: 1 } }}>
            Open dialog
          </Button>
          <Button onClick={() => toast.info("Heads up — just so you know.")} style={{ width: 10 }}>
            Info
          </Button>
          <Button onClick={() => toast.success("Saved successfully!")} style={{ width: 12 }}>
            Success
          </Button>
          <Button onClick={() => toast.warn("Connection is unstable.")} style={{ width: 10 }}>
            Warn
          </Button>
          <Button
            onClick={() => toast.error("Upload failed.", { title: "Error" })}
            style={{ width: 10 }}
          >
            Error
          </Button>
        </HBox>
      </VBox>

      {/* The chat input keeps focus the whole time the slash menu is up. */}
      <Input
        ref={inputRef}
        id="chat"
        value={text}
        onChange={onChange}
        placeholder="Message the agent…  (try /he)"
        style={{ margin: 1 }}
      />
      <Footer>
        Tab: focus · Esc: close dialog/menu · ↑/↓ + Enter: pick command · click a toast to dismiss
      </Footer>

      {/* Anchored above the input — placement="above" and auto screen-clamping
          keep it from overlapping the textbox or running off any edge. */}
      <StickyPanel
        open={menuOpen && matches.length > 0}
        anchorRef={inputRef}
        placement="above"
        panelStyle={{ width: 36, background: "$panel" }}
        onClose={() => setDismissed(true)}
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
            toast.success("Conversation cleared.");
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
