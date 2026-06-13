import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Dock,
  email,
  FieldError,
  FileIcon,
  Footer,
  Form,
  HBox,
  Header,
  HeroIcon,
  Input,
  Label,
  type ListItem,
  ListView,
  Markdown,
  minLength,
  ProgressBar,
  RadioGroup,
  required,
  Select,
  Slider,
  Spinner,
  StatusBadge,
  StatusDot,
  type StatusState,
  Switch,
  TabContainer,
  Table,
  type TableColumn,
  Tree,
  type TreeNode,
  VBox,
  View,
} from "../src/index.ts";

/**
 * The widget showcase shown by both the live web demo (`examples/web_demo.tsx`)
 * and the headless debug tool (`scripts/web-debug.ts`), so what an agent inspects
 * is exactly what a user sees. A TabContainer walks through the major widget
 * families — controls, forms, trees, tabular/list data, status glyphs, and rich
 * text — exercising borders, scrollbars, fills, and color on the web backend.
 */

const listItems: ListItem[] = Array.from({ length: 200 }, (_, i) => ({
  id: `i${i}`,
  label: `Row ${i}`,
  detail: i % 7 === 0 ? "lucky" : undefined,
}));

const tree: TreeNode[] = [
  {
    id: "src",
    label: "src",
    icon: "📁",
    children: [
      { id: "src/app.ts", label: "app.ts", icon: "📄" },
      {
        id: "src/widgets",
        label: "widgets",
        icon: "📁",
        children: [
          { id: "src/widgets/tree.ts", label: "tree.ts", icon: "📄" },
          { id: "src/widgets/list.ts", label: "list-view.ts", icon: "📄" },
        ],
      },
      {
        id: "src/big",
        label: "generated (1000 files)",
        icon: "📁",
        children: Array.from({ length: 1000 }, (_, i) => ({
          id: `g${i}`,
          label: `module_${String(i).padStart(4, "0")}.ts`,
          icon: "📄",
        })),
      },
    ],
  },
  { id: "package.json", label: "package.json", icon: "📄" },
  { id: "README.md", label: "README.md", icon: "📄" },
];

interface Pkg {
  name: string;
  version: string;
  size: string;
}
const packages: Pkg[] = [
  { name: "react", version: "19.2.6", size: "2.4 MB" },
  { name: "marked", version: "17.0.1", size: "0.9 MB" },
  { name: "prismjs", version: "1.30.0", size: "0.6 MB" },
  { name: "pngjs", version: "7.0.0", size: "0.3 MB" },
  { name: "opentype.js", version: "2.0.0", size: "1.1 MB" },
];
const columns: TableColumn<Pkg>[] = [
  { key: "name", header: "Package", width: "2fr", sortable: true },
  { key: "version", header: "Version", width: "1fr", align: "right" },
  { key: "size", header: "Size", width: "1fr", align: "right", sortable: true },
];

const STATES: StatusState[] = [
  "active",
  "ongoing",
  "pending",
  "completed",
  "warning",
  "failed",
  "inactive",
];

const HERO_ICONS = ["home", "user", "bell", "cog", "heart", "beaker"];

const MARKDOWN = `# Markdown on the web

ZTUI renders **the same widget tree** to a browser as it does to a terminal.

- *Italic*, **bold**, and \`inline code\`
- [Links](https://example.com) are clickable
- Lists, quotes, and rules all work

> The buffer is the portable hand-off point.

\`\`\`ts
const app = new App(new WebDriver());
render(<Demo />, app.activeScreen);
\`\`\`
`;

function ControlsTab() {
  const [count, setCount] = useState(0);
  const [on, setOn] = useState(true);
  const [checked, setChecked] = useState(false);
  const [choice, setChoice] = useState("comfortable");
  const [fruit, setFruit] = useState("apple");
  const [volume, setVolume] = useState(60);
  const [progress, setProgress] = useState(0);

  // Animate the progress bar so the demo shows live, block-fill rendering.
  useEffect(() => {
    const t = setInterval(() => setProgress((p) => (p >= 100 ? 0 : p + 4)), 200);
    return () => clearInterval(t);
  }, []);

  return (
    <VBox label="🎛 Controls" style={{ padding: 1 }}>
      <HBox style={{ height: 1 }}>
        <Label style={{ bold: true, color: "cyan" }}>Count: {count} </Label>
        <Button onClick={() => setCount((c) => c + 1)}>Increment</Button>
        <View style={{ width: 2 }} />
        <Spinner />
      </HBox>
      <View style={{ height: 1 }} />
      <HBox style={{ height: 1 }}>
        <Switch active={on} label="Notifications" onChange={setOn} />
        <View style={{ width: 4 }} />
        <Checkbox checked={checked} label="Analytics" onChange={setChecked} />
      </HBox>
      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>Density</Label>
      <RadioGroup
        options={["compact", "comfortable", "spacious"]}
        value={choice}
        orientation="horizontal"
        onChange={setChoice}
      />
      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>Favorite fruit</Label>
      <Select options={["apple", "banana", "cherry", "date"]} value={fruit} onChange={setFruit} />
      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>Volume: {volume}</Label>
      <Slider
        value={volume}
        min={0}
        max={100}
        step={5}
        onChange={setVolume}
        style={{ width: 40 }}
      />
      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>Download</Label>
      <ProgressBar value={progress} showPercent style={{ width: 40 }} />
    </VBox>
  );
}

function FormTab() {
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);
  return (
    <VBox label="📝 Form" style={{ padding: 1 }}>
      <Form
        messageMode="inline"
        onSubmit={(values) => setSubmitted(values)}
        style={{ border: "round", padding: 1, width: 52 }}
      >
        <Label style={{ color: "$success" }}>Username</Label>
        <Input
          id="username"
          placeholder="at least 3 characters"
          validateOn="blur"
          validators={[required("Username is required"), minLength(3)]}
          style={{ background: "$panel", color: "$accent" }}
        />
        <FieldError targetId="username" style={{ color: "$error" }} />

        <Label style={{ color: "$success" }}>Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          validateOn="blur"
          validators={[required("Email is required"), email()]}
          style={{ background: "$panel", color: "$accent" }}
        />
        <FieldError targetId="email" style={{ color: "$error" }} />
        <View style={{ height: 1 }} />
        <Button>Submit</Button>
      </Form>
      <View style={{ height: 1 }} />
      <Label style={{ color: submitted ? "$success" : "$dimmed" }}>
        {submitted ? `Submitted: ${JSON.stringify(submitted)}` : "Fill the form and submit…"}
      </Label>
    </VBox>
  );
}

function DataTab() {
  const [selected, setSelected] = useState("");
  return (
    <VBox label="📊 Data" style={{ padding: 1 }}>
      <Label style={{ bold: true, color: "$secondary" }}>Table — sortable, virtualized</Label>
      <Table data={packages} columns={columns} style={{ height: 8, border: "round" }} />
      <View style={{ height: 1 }} />
      <Label style={{ bold: true, color: "$secondary" }}>
        ListView — 200 rows {selected && `· ${selected}`}
      </Label>
      <ListView
        items={listItems}
        onSelect={(it) => setSelected(it.id)}
        style={{ height: 8, border: "round" }}
      />
    </VBox>
  );
}

function TreeTab() {
  const [expanded, setExpanded] = useState<string[]>(["src"]);
  const [opened, setOpened] = useState("");
  return (
    <VBox label="🌲 Tree" style={{ padding: 1 }}>
      <Label style={{ color: "$dimmed" }}>
        Workspace explorer (virtualized) {opened && `· opened ${opened}`}
      </Label>
      <Tree
        data={tree}
        showGuides
        expanded={expanded}
        onExpandedChange={setExpanded}
        onActivate={(n) => setOpened(n.id)}
        style={{ border: "round", padding: 1, height: 18 }}
      />
    </VBox>
  );
}

function StatusTab() {
  return (
    <VBox label="🚦 Status & Glyphs" style={{ padding: 1 }}>
      <Label style={{ bold: true, color: "$secondary" }}>StatusBadge — glyph + label</Label>
      <VBox style={{ padding: 1 }}>
        {STATES.map((s) => (
          <StatusBadge key={s} state={s} />
        ))}
      </VBox>
      <Label style={{ bold: true, color: "$secondary" }}>
        StatusDot — one cell, three glyph sets
      </Label>
      <HBox style={{ height: 1, padding: { left: 1 } }}>
        {STATES.map((s) => (
          <HBox key={s} style={{ width: 4 }}>
            <StatusDot state={s} glyphSet="unicode" />
          </HBox>
        ))}
      </HBox>
      <View style={{ height: 1 }} />
      <Label style={{ bold: true, color: "$secondary" }}>Heroicons (fallback glyphs)</Label>
      <HBox style={{ height: 1, padding: { left: 1 } }}>
        {HERO_ICONS.map((n) => (
          <HBox key={n} style={{ width: 4 }}>
            <HeroIcon name={n} variant="solid" style={{ color: "$warning" }} />
          </HBox>
        ))}
      </HBox>
      <View style={{ height: 1 }} />
      <Label style={{ bold: true, color: "$secondary" }}>File icons</Label>
      <HBox style={{ height: 1, padding: { left: 1 } }}>
        {["ts", "json", "rs", "go", "md"].map((ext) => (
          <HBox key={ext} style={{ width: 9 }}>
            <FileIcon extension={ext} />
            <Label style={{ color: "$dimmed" }}>.{ext}</Label>
          </HBox>
        ))}
      </HBox>
    </VBox>
  );
}

function TextTab() {
  return (
    <VBox label="📖 Text" style={{ padding: 1 }}>
      <Box style={{ border: "round", padding: 1, height: 18 }}>
        <Markdown>{MARKDOWN}</Markdown>
      </Box>
    </VBox>
  );
}

export function WebDemoUI() {
  const [tab, setTab] = useState(0);
  return (
    <Dock style={{ background: "$surface" }}>
      <Header>ZTUI in the browser — same widgets, WebDriver backend</Header>
      <Footer>
        ←/→ switch tabs · Tab to focus · arrows navigate · Enter activates · resize the window
      </Footer>
      <TabContainer activeIndex={tab} onChange={setTab} style={{ padding: 1 }}>
        <ControlsTab />
        <FormTab />
        <DataTab />
        <TreeTab />
        <StatusTab />
        <TextTab />
      </TabContainer>
    </Dock>
  );
}
