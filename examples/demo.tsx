import { useState } from "react";
import {
  App,
  Button,
  Checkbox,
  Dock,
  EmailInput,
  Footer,
  HBox,
  Header,
  Input,
  Label,
  PasswordInput,
  RadioGroup,
  Select,
  Slider,
  Switch,
  ThemePalette,
  ToggleButton,
  VBox,
  View,
} from "../src/index.ts";

function DemoApp() {
  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Developer");
  const [skills, setSkills] = useState<string[]>(["TypeScript"]);
  const [pref, setPref] = useState("Tabs");
  const [marketing, setMarketing] = useState(true);
  const [agree, setAgree] = useState(false);
  const [volume, setVolume] = useState(70);
  const [darkTheme, setDarkTheme] = useState(true);

  const handleExit = () => {
    App.instance?.stop();
    process.exit(0);
  };

  const isEmailInvalid = email.length > 0 && !email.includes("@");

  return (
    <Dock style={{ background: "$background" }}>
      {/* Header with sensible defaults */}
      <Header>🚀 ZTUI Premium Form Elements Dashboard</Header>

      {/* Ctrl+Alt+T — visual theme picker with live preview */}
      <ThemePalette />

      {/* Footer with sensible defaults */}
      <Footer>
        Tab: Cycle Focus │ Space/Enter: Select/Toggle │ Arrows: Navigate │ ESC: Close Select │
        Ctrl+Alt+T: Themes
      </Footer>

      {/* Main Split Layout */}
      <HBox style={{ padding: 1 }}>
        {/* Left Column: Form Controls */}
        <VBox style={{ width: "55%", border: "rounded", borderColor: "$border", padding: 1 }}>
          <Label style={{ color: "$primary", bold: true }}>📋 Interactive Form Controls</Label>
          <View style={{ height: 1 }} />

          {/* Standard Input & Icon inputs */}
          <Label style={{ color: "$secondary" }}>Name:</Label>
          <Input
            style={{ height: 3, background: "$panel", color: "$foreground" }}
            value={name}
            placeholder="Enter your name"
            onChange={(val) => setName(val)}
          />

          <Label style={{ color: "$secondary" }}>Email Address:</Label>
          <EmailInput
            style={{ height: 3, background: "$panel", color: "$foreground" }}
            value={email}
            placeholder="name@domain.com"
            invalid={isEmailInvalid}
            onChange={(val) => setEmail(val)}
          />

          <Label style={{ color: "$secondary" }}>Password:</Label>
          <PasswordInput
            style={{ height: 3, background: "$panel", color: "$foreground" }}
            value={password}
            placeholder="Enter secure password"
            onChange={(val) => setPassword(val)}
          />

          {/* Switch & Checkbox */}
          <HBox style={{ height: 1, margin: { top: 1, bottom: 1 } }}>
            <Switch
              active={marketing}
              label="Subscribe to News"
              onChange={(val) => setMarketing(val)}
            />
            <View style={{ width: 4 }} />
            <Checkbox checked={agree} label="Agree to Terms" onChange={(val) => setAgree(val)} />
          </HBox>

          {/* Slider */}
          <Label style={{ color: "$secondary" }}>Notification Volume:</Label>
          <Slider value={volume} min={0} max={100} step={5} onChange={(val) => setVolume(val)} />

          {/* Radio Group */}
          <Label style={{ color: "$secondary", margin: { top: 1 } }}>Indentation Preference:</Label>
          <RadioGroup
            options={["Tabs", "Spaces (2)", "Spaces (4)"]}
            value={pref}
            orientation="horizontal"
            onChange={(val) => setPref(val)}
          />

          {/* Toggle Button */}
          <Label style={{ color: "$secondary", margin: { top: 1 } }}>Theme Preference:</Label>
          <ToggleButton
            active={darkTheme}
            label={darkTheme ? "Dark Theme Activated" : "Light Theme Activated"}
            onChange={(val) => setDarkTheme(val)}
          />

          {/* Disabled state — inert + muted, skipped by Tab */}
          <Label style={{ color: "$secondary", margin: { top: 1 } }}>Disabled (read-only):</Label>
          <Input style={{ height: 3 }} value="Can't edit this" disabled />
          <HBox style={{ height: 1, margin: { top: 1 } }}>
            <Checkbox checked={true} label="Locked option" disabled />
            <View style={{ width: 4 }} />
            <Button disabled>Unavailable</Button>
          </HBox>
        </VBox>

        {/* Right Column: Dropdowns and Realtime State output */}
        <VBox style={{ width: "45%", border: "rounded", borderColor: "$border", padding: 1 }}>
          <Label style={{ color: "$warning", bold: true }}>⚙️ Select Dropdowns</Label>
          <View style={{ height: 1 }} />

          {/* Single Select Dropdown */}
          <Label style={{ color: "$secondary" }}>Assign Role (Single-Select):</Label>
          <Select
            options={["Admin", "Developer", "Designer", "Tester"]}
            value={role}
            onChange={(val) => setRole(val)}
          />

          {/* Multi Select Dropdown */}
          <Label style={{ color: "$secondary", margin: { top: 1 } }}>
            Core Skills (Multi-Select):
          </Label>
          <Select
            multiple={true}
            options={["TypeScript", "React", "Rust", "Go", "Python", "Mermaid"]}
            value={skills}
            placeholder="Select skills..."
            onChange={(val) => setSkills(val)}
          />

          <View style={{ height: 1 }} />
          <Label style={{ color: "$success", bold: true }}>📊 Live Form State Output</Label>
          <VBox style={{ border: "dashed", borderColor: "$border", padding: 1, height: 13 }}>
            <Label style={{ color: "$foreground" }}>Name: {name || "(empty)"}</Label>
            <Label style={{ color: isEmailInvalid ? "$error" : "$success" }}>
              Email: {email || "(empty)"} {isEmailInvalid ? "⚠️ Invalid" : ""}
            </Label>
            <Label style={{ color: "$foreground" }}>
              Password: {"•".repeat(password.length) || "(empty)"}
            </Label>
            <Label style={{ color: "$foreground" }}>Role: {role}</Label>
            <Label style={{ color: "$foreground" }}>Skills: {skills.join(", ") || "none"}</Label>
            <Label style={{ color: "$foreground" }}>Indentation: {pref}</Label>
            <Label style={{ color: "$foreground" }}>
              Subscribe: {marketing ? "ON 🟢" : "OFF 🔴"}
            </Label>
            <Label style={{ color: "$foreground" }}>
              Terms Accepted: {agree ? "YES ✅" : "NO ❌"}
            </Label>
            <Label style={{ color: "$foreground" }}>Volume: {volume}%</Label>
            <Label style={{ color: "$foreground" }}>
              Theme Mode: {darkTheme ? "DARK 🌙" : "LIGHT ☀️"}
            </Label>
          </VBox>

          <Button
            style={{ background: "$error", margin: { top: 1 }, height: 1 }}
            onClick={handleExit}
          >
            Exit Application
          </Button>
        </VBox>
      </HBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const kitchenSinkDemo: Demo = {
  id: "kitchen-sink",
  title: "Kitchen Sink",
  group: "Overview",
  description: "The original all-in-one showcase.",
  Component: DemoApp,
};
