import { useState } from "react";
import {
  App,
  Button,
  Checkbox,
  Dock,
  Footer,
  HBox,
  Header,
  Input,
  Label,
  render,
  Switch,
  TabContainer,
  VBox,
  View,
} from "../src/index.ts";

function TabDemoApp() {
  const [activeTab, setActiveTab] = useState(0);

  // Settings Form States
  const [username, setUsername] = useState("ZTUI Developer");
  const [notifications, setNotifications] = useState(true);
  const [analytics, setAnalytics] = useState(false);

  const handleExit = () => {
    App.instance?.stop();
    process.exit(0);
  };

  return (
    <Dock style={{ background: "#11111b" }}>
      <Header>✨ ZTUI Dynamic TabContainer Dashboard</Header>

      <Footer>
        Left/Right or Up/Down Arrow: Move Highlight │ Enter/Space: Switch Tab │ Tab: Cycle Focus
      </Footer>

      <VBox style={{ padding: 1, height: "fr" }}>
        {/* TabContainer layout */}
        <TabContainer
          style={{ height: 18 }}
          activeIndex={activeTab}
          onChange={(idx) => setActiveTab(idx)}
        >
          {/* Tab 1: Profile Overview */}
          <VBox label="👤 Profile Overview" style={{ padding: 1 }}>
            <Label style={{ color: "#cba6f7", bold: true }}>Welcome back, {username}!</Label>
            <View style={{ height: 1 }} />
            <Label style={{ color: "#a6e3a1" }}>System Metrics:</Label>
            <VBox
              style={{ border: "dashed", borderColor: "gray", padding: 1, width: 45, height: 6 }}
            >
              <Label style={{ color: "#cdd6f4" }}>• Framework: ZTUI v0.1.0</Label>
              <Label style={{ color: "#cdd6f4" }}>• Environment: Bun Runtime</Label>
              <Label style={{ color: "#cdd6f4" }}>• Active Tab Index: {activeTab}</Label>
              <Label style={{ color: "#cdd6f4" }}>• Status: Operational 🟢</Label>
            </VBox>
          </VBox>

          {/* Tab 2: Settings Form */}
          <VBox label="⚙️ Preferences & Edit" style={{ padding: 1 }}>
            <Label style={{ color: "#f9e2af", bold: true }}>Configure User Profile Settings</Label>
            <View style={{ height: 1 }} />

            <Label style={{ color: "#89b4fa" }}>Edit Username:</Label>
            <Input
              style={{ height: 3, background: "#313244", color: "#cdd6f4", width: 40 }}
              value={username}
              onChange={(val) => setUsername(val)}
              placeholder="Username..."
            />

            <View style={{ height: 1 }} />
            <HBox style={{ height: 1 }}>
              <Switch
                active={notifications}
                label="Enable Notifications"
                onChange={(val) => setNotifications(val)}
              />
              <View style={{ width: 4 }} />
              <Checkbox
                checked={analytics}
                label="Send Diagnostic Reports"
                onChange={(val) => setAnalytics(val)}
              />
            </HBox>
          </VBox>

          {/* Tab 3: Help & Info */}
          <VBox label="ℹ️ About & Help" style={{ padding: 1 }}>
            <Label style={{ color: "#a6e3a1", bold: true }}>About ZTUI TabContainer</Label>
            <View style={{ height: 1 }} />
            <Label style={{ color: "#cdd6f4" }}>
              The TabContainer widget dynamically manages layout child rendering.
            </Label>
            <Label style={{ color: "#cdd6f4" }}>
              Only the child matching the active tab index is measured and rendered.
            </Label>
            <View style={{ height: 1 }} />
            <Label style={{ color: "#f38ba8", bold: true }}>Keyboard shortcuts:</Label>
            <Label style={{ color: "#cdd6f4" }}>• Arrow Left/Right: Navigate tabs</Label>
            <Label style={{ color: "#cdd6f4" }}>• Space / Enter: Select highlighted tab</Label>
            <Label style={{ color: "#cdd6f4" }}>• Tab: Cycle focus to other inputs</Label>
          </VBox>
        </TabContainer>

        <View style={{ height: 1 }} />
        <Button
          style={{ background: "#f38ba8", color: "black", width: 20, height: 1, align: "center" }}
          onClick={handleExit}
        >
          Exit Dashboard
        </Button>
      </VBox>
    </Dock>
  );
}

const app = new App();
render(<TabDemoApp />, app.activeScreen);
app.run();
