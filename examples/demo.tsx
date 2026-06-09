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
  render,
  Select,
  Slider,
  Switch,
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
    <Dock style={{ background: "#1e1e2e" }}>
      {/* Header with sensible defaults */}
      <Header>🚀 ZTUI Premium Form Elements Dashboard</Header>

      {/* Footer with sensible defaults */}
      <Footer>
        Tab: Cycle Focus │ Space/Enter: Select/Toggle │ Arrows: Navigate │ ESC: Close Select
      </Footer>

      {/* Main Split Layout */}
      <HBox style={{ padding: 1 }}>
        {/* Left Column: Form Controls */}
        <VBox style={{ width: "55%", border: "rounded", borderColor: "#a6e3a1", padding: 1 }}>
          <Label style={{ color: "#cba6f7", bold: true }}>📋 Interactive Form Controls</Label>
          <View style={{ height: 1 }} />

          {/* Standard Input & Icon inputs */}
          <Label style={{ color: "#89b4fa" }}>Name:</Label>
          <Input
            style={{ height: 3, background: "#313244", color: "#cdd6f4" }}
            value={name}
            placeholder="Enter your name"
            onChange={(val) => setName(val)}
          />

          <Label style={{ color: "#89b4fa" }}>Email Address:</Label>
          <EmailInput
            style={{ height: 3, background: "#313244", color: "#cdd6f4" }}
            value={email}
            placeholder="name@domain.com"
            invalid={isEmailInvalid}
            onChange={(val) => setEmail(val)}
          />

          <Label style={{ color: "#89b4fa" }}>Password:</Label>
          <PasswordInput
            style={{ height: 3, background: "#313244", color: "#cdd6f4" }}
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
          <Label style={{ color: "#89b4fa" }}>Notification Volume:</Label>
          <Slider value={volume} min={0} max={100} step={5} onChange={(val) => setVolume(val)} />

          {/* Radio Group */}
          <Label style={{ color: "#89b4fa", margin: { top: 1 } }}>Indentation Preference:</Label>
          <RadioGroup
            options={["Tabs", "Spaces (2)", "Spaces (4)"]}
            value={pref}
            orientation="horizontal"
            onChange={(val) => setPref(val)}
          />

          {/* Toggle Button */}
          <Label style={{ color: "#89b4fa", margin: { top: 1 } }}>Theme Preference:</Label>
          <ToggleButton
            active={darkTheme}
            label={darkTheme ? "Dark Theme Activated" : "Light Theme Activated"}
            onChange={(val) => setDarkTheme(val)}
          />
        </VBox>

        {/* Right Column: Dropdowns and Realtime State output */}
        <VBox style={{ width: "45%", border: "rounded", borderColor: "#f9e2af", padding: 1 }}>
          <Label style={{ color: "#f9e2af", bold: true }}>⚙️ Select Dropdowns</Label>
          <View style={{ height: 1 }} />

          {/* Single Select Dropdown */}
          <Label style={{ color: "#89b4fa" }}>Assign Role (Single-Select):</Label>
          <Select
            options={["Admin", "Developer", "Designer", "Tester"]}
            value={role}
            onChange={(val) => setRole(val)}
          />

          {/* Multi Select Dropdown */}
          <Label style={{ color: "#89b4fa", margin: { top: 1 } }}>
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
          <Label style={{ color: "#a6e3a1", bold: true }}>📊 Live Form State Output</Label>
          <VBox style={{ border: "dashed", borderColor: "gray", padding: 1, height: 13 }}>
            <Label style={{ color: "#f5e0dc" }}>Name: {name || "(empty)"}</Label>
            <Label style={{ color: isEmailInvalid ? "#f38ba8" : "#a6e3a1" }}>
              Email: {email || "(empty)"} {isEmailInvalid ? "⚠️ Invalid" : ""}
            </Label>
            <Label style={{ color: "#f5e0dc" }}>
              Password: {"•".repeat(password.length) || "(empty)"}
            </Label>
            <Label style={{ color: "#f5e0dc" }}>Role: {role}</Label>
            <Label style={{ color: "#f5e0dc" }}>Skills: {skills.join(", ") || "none"}</Label>
            <Label style={{ color: "#f5e0dc" }}>Indentation: {pref}</Label>
            <Label style={{ color: "#f5e0dc" }}>Subscribe: {marketing ? "ON 🟢" : "OFF 🔴"}</Label>
            <Label style={{ color: "#f5e0dc" }}>Terms Accepted: {agree ? "YES ✅" : "NO ❌"}</Label>
            <Label style={{ color: "#f5e0dc" }}>Volume: {volume}%</Label>
            <Label style={{ color: "#f5e0dc" }}>
              Theme Mode: {darkTheme ? "DARK 🌙" : "LIGHT ☀️"}
            </Label>
          </VBox>

          <Button
            style={{ background: "#f38ba8", color: "black", margin: { top: 1 }, height: 1 }}
            onClick={handleExit}
          >
            Exit Application
          </Button>
        </VBox>
      </HBox>
    </Dock>
  );
}

// Instantiate and run the App
const app = new App();
render(<DemoApp />, app.activeScreen);
app.run({ inspectorPort: 8000 });
