import { useState } from "react";
// Demonstrates alpha-blended cell compositing (ScreenBuffer.blendRegion):
//   • Translucent panels — a widget whose background is `rgba(...)` / `#rrggbbaa`
//     composites over whatever is painted behind it instead of replacing it, so
//     the content underneath shows through, tinted. Where panels overlap, the
//     blends stack.
//   • Modal scrim — opening the Dialog darkens the whole backdrop with a real
//     translucent-black wash (not the terminal-dependent SGR-dim attribute),
//     keeping the text readable but dimmed to concrete colours.
//
// Press `d` to toggle the dialog. Press `q` / Ctrl+C to quit.
import {
  App,
  Box,
  Button,
  Dialog,
  Footer,
  Header,
  Label,
  render,
  useHotkey,
  VBox,
} from "../src/index.ts";

// Height of the stage that holds the backdrop text and the floating panels. The
// panels are positioned absolutely within it, so the stage needs an explicit
// height to contain them (out-of-flow children don't grow their parent).
const STAGE_HEIGHT = 13;

// A patch of opaque content for the translucent panels to float over.
function Backdrop() {
  const rows = [
    "The quick brown fox jumps over the lazy dog.",
    "Pack my box with five dozen liquor jugs.",
    "How vexingly quick daft zebras jump!",
    "Sphinx of black quartz, judge my vow.",
    "Five wizards jump quickly; the glow fades.",
    "Crazy Fredrick bought many exquisite opals.",
  ];
  return (
    <VBox style={{ padding: 1, background: "$surface" }}>
      {rows.map((r) => (
        <Label key={r} style={{ color: "$foreground" }}>
          {r}
        </Label>
      ))}
    </VBox>
  );
}

// `rgba(r,g,b,a)` background → the panel blends over the backdrop beneath it.
function GlassPanel({
  left,
  top,
  color,
  label,
}: {
  left: number;
  top: number;
  color: string;
  label: string;
}) {
  return (
    <Box
      style={{
        position: "absolute",
        left,
        top,
        width: 26,
        height: 5,
        background: color,
        border: "round",
        borderColor: "$foreground",
      }}
    >
      <Label style={{ padding: 1, color: "$surface", bold: true }}>{label}</Label>
    </Box>
  );
}

function BlendDemo() {
  const [open, setOpen] = useState(false);

  // Global hotkeys: bare-key bindings fire when no focused widget consumes the
  // key (an `onKey` on a non-focusable container never receives anything).
  useHotkey({ key: "d", name: "Toggle modal", handler: () => setOpen((v) => !v) });
  useHotkey({ key: "q", name: "Quit", handler: () => process.exit(0) });

  return (
    <VBox style={{ width: "100%", height: "100%", background: "$background" }}>
      <Header>ztui — alpha-blended compositing</Header>

      {/* A positioned, fixed-height stage so the absolute panels stay inside it
          and don't spill onto the footer below. */}
      <Box style={{ position: "relative", height: STAGE_HEIGHT, margin: 1 }}>
        <Backdrop />
        {/* Three overlapping translucent panels: where they overlap, the blends
            stack — each composites over the result of the one beneath. */}
        <GlassPanel left={2} top={1} color="rgba(137, 180, 250, 0.45)" label="blue · 45%" />
        <GlassPanel left={18} top={3} color="rgba(166, 227, 161, 0.40)" label="green · 40%" />
        <GlassPanel left={10} top={6} color="rgba(243, 139, 168, 0.40)" label="pink · 40%" />
      </Box>

      <Footer>Press d to toggle the dimmed modal · q to quit</Footer>

      {/* `dim` paints a translucent-black scrim over everything behind the panel. */}
      <Dialog open={open} dim onClose={() => setOpen(false)}>
        <VBox style={{ padding: 1, width: 44 }}>
          <Label style={{ bold: true, color: "$foreground" }}>Modal scrim</Label>
          <Label style={{ color: "$comment" }}>
            The backdrop is darkened by a real alpha wash — the text stays legible, just dimmed to
            concrete colours.
          </Label>
          <Box style={{ height: 1 }} />
          <Button onClick={() => setOpen(false)} style={{ width: 12 }}>
            Close
          </Button>
        </VBox>
      </Dialog>
    </VBox>
  );
}

const app = new App();
render(<BlendDemo />, app.activeScreen);
app.run();
