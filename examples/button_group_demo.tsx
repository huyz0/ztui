import { useState } from "react";
import {
  Button,
  ButtonGroup,
  Dock,
  Footer,
  Form,
  Header,
  Input,
  Label,
  VBox,
} from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";
import type { Demo } from "./gallery/types.ts";

// ButtonGroup is a roving-focus toolbar: Tab lands on the group (one stop),
// then ←/→ (or ↑/↓, Home/End) move focus between the buttons and Enter/Space
// activates the focused one. Because each child is a real Button, formAction
// still works — so the second group below is a form's actions row: arrow to
// Save and press Enter to submit.
function ButtonGroupDemoApp() {
  const [last, setLast] = useState("—");
  const [saved, setSaved] = useState<string | null>(null);

  return (
    <Dock style={{ background: "$background" }}>
      <Header>🎛️ ZTUI Button Group — arrow-navigable toolbars</Header>
      <VBox style={{ padding: 1, height: "1fr" }}>
        <Label style={{ color: "$dimmed" }}>A toolbar (Tab here, then ←/→, Enter):</Label>
        <ButtonGroup>
          <Button onClick={() => setLast("Cut")}>Cut</Button>
          <Button onClick={() => setLast("Copy")}>Copy</Button>
          <Button onClick={() => setLast("Paste")}>Paste</Button>
          <Button disabled>Undo</Button>
          <Button onClick={() => setLast("Redo")}>Redo</Button>
        </ButtonGroup>
        <Label style={{ color: "$accent", padding: { top: 0, bottom: 1 } }}>
          Last action: {last}
        </Label>

        <Label style={{ color: "$dimmed" }}>A form's actions row (Save submits):</Label>
        <Form onSubmit={(v) => setSaved(String(v.name ?? ""))}>
          <Input id="name" placeholder="Your name…" style={{ width: 28 }} />
          <ButtonGroup>
            <Button formAction="reset">Reset</Button>
            <Button formAction="submit" style={{ color: "$success" }}>
              Save
            </Button>
          </ButtonGroup>
        </Form>
        {saved != null ? <Label style={{ color: "$success" }}>Saved: "{saved}"</Label> : undefined}
      </VBox>
      <Footer>
        <ExitButton style={{ margin: 0 }}>Exit</ExitButton>
      </Footer>
    </Dock>
  );
}

export const buttonGroupDemo: Demo = {
  id: "button-group",
  title: "Button Group",
  group: "Controls",
  description:
    "Roving-focus toolbar: one Tab stop, arrow keys move between buttons; formAction works inside a Form.",
  Component: ButtonGroupDemoApp,
};
