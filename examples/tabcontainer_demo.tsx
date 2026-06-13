import { useState } from "react";
import { App } from "../src/core.ts";
import {
  Button,
  Checkbox,
  Dock,
  Footer,
  HBox,
  Header,
  Input,
  Label,
  Switch,
  TabContainer,
  VBox,
  View,
} from "../src/react.ts";

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
    <Dock style={{ background: "$surface" }}>
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
            <Label style={{ color: "$primary", bold: true }}>Welcome back, {username}!</Label>
            <View style={{ height: 1 }} />
            <Label style={{ color: "$success" }}>System Metrics:</Label>
            <VBox
              style={{ border: "dashed", borderColor: "gray", padding: 1, width: 45, height: 8 }}
            >
              <Label style={{ color: "$foreground" }}>• Framework: ZTUI v0.1.0</Label>
              <Label style={{ color: "$foreground" }}>• Environment: Bun Runtime</Label>
              <Label style={{ color: "$foreground" }}>• Active Tab Index: {activeTab}</Label>
              <Label style={{ color: "$foreground" }}>• Status: Operational 🟢</Label>
            </VBox>
          </VBox>

          {/* Tab 2: Settings Form */}
          <VBox label="⚙️ Preferences & Edit" style={{ padding: 1 }}>
            <Label style={{ color: "$warning", bold: true }}>Configure User Profile Settings</Label>
            <View style={{ height: 1 }} />

            <Label style={{ color: "$secondary" }}>Edit Username:</Label>
            <Input
              style={{ height: 3, background: "$panel", color: "$foreground", width: 40 }}
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
            <Label style={{ color: "$success", bold: true }}>About ZTUI TabContainer</Label>
            <View style={{ height: 1 }} />
            <Label style={{ color: "$foreground" }}>
              The TabContainer widget dynamically manages layout child rendering.
            </Label>
            <Label style={{ color: "$foreground" }}>
              Only the child matching the active tab index is measured and rendered.
            </Label>
            <View style={{ height: 1 }} />
            <Label style={{ color: "$error", bold: true }}>Keyboard shortcuts:</Label>
            <Label style={{ color: "$foreground" }}>• Arrow Left/Right: Navigate tabs</Label>
            <Label style={{ color: "$foreground" }}>• Space / Enter: Select highlighted tab</Label>
            <Label style={{ color: "$foreground" }}>• Tab: Cycle focus to other inputs</Label>
          </VBox>
        </TabContainer>

        <View style={{ height: 1 }} />
        <Button
          style={{ background: "$error", width: 20, height: 1, align: "center" }}
          onClick={handleExit}
        >
          Exit Dashboard
        </Button>
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const tabsDemo: Demo = {
  id: "tabs",
  title: "Tabs",
  group: "Layout",
  description: "Tabbed container.",
  Component: TabDemoApp,
};
