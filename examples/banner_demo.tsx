import { useState } from "react";
import { Banner, Header, Label, VBox, View } from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";

function BannerDemoApp() {
  const [showDismissable, setShowDismissable] = useState(true);

  return (
    <VBox style={{ padding: 1, height: "100%", background: "$background" }}>
      <Header>🔔 Banner — inline callouts</Header>
      <View style={{ height: 1 }} />

      <Banner
        variant="info"
        title="Heads up"
        message="Banners stretch to their container and size their own height — long messages wrap automatically across as many lines as they need."
        style={{ width: 56 }}
      />
      <View style={{ height: 1 }} />
      <Banner
        variant="success"
        message="Deployment finished — 3 services updated."
        style={{ width: 56 }}
      />
      <View style={{ height: 1 }} />
      <Banner
        variant="warning"
        title="Unsaved changes"
        message="Closing now will discard your edits."
        style={{ width: 56 }}
      />
      <View style={{ height: 1 }} />
      <Banner
        variant="error"
        title="Build failed"
        message="2 type errors in src/app.ts — see the log for details."
        style={{ width: 56 }}
      />

      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>Dismissible (click the ×):</Label>
      {showDismissable ? (
        <Banner
          variant="neutral"
          message="You can dismiss this one."
          dismissible
          onDismiss={() => setShowDismissable(false)}
          style={{ width: 56 }}
        />
      ) : (
        <Label style={{ color: "$dimmed" }}>(dismissed)</Label>
      )}

      <View style={{ height: 1 }} />
      <Label style={{ color: "$dimmed" }}>Space-constrained (width 18, no icon):</Label>
      <Banner
        variant="info"
        message="Wraps cleanly in a narrow column too."
        showIcon={false}
        style={{ width: 18 }}
      />

      <View style={{ height: "1fr" }} />
      <ExitButton style={{ margin: 0 }}>Exit</ExitButton>
    </VBox>
  );
}

import type { Demo } from "./gallery/types.ts";

export const bannerDemo: Demo = {
  id: "banner",
  title: "Banner",
  group: "Feedback",
  description:
    "Persistent inline callouts — info/success/warning/error/neutral, wrapping, dismissible.",
  Component: BannerDemoApp,
};
