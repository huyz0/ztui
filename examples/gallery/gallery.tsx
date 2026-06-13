import { useEffect, useState } from "react";
import { App } from "../../src/core.ts";
import { Dock, Footer, HBox, Header, Label, ListView, VBox, View } from "../../src/react.ts";
import { autoFocus } from "./auto-focus.ts";
import { demos } from "./registry.ts";
import type { Demo, DemoCapability } from "./types.ts";

interface ListItem {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
}

/**
 * Flatten the registry into sidebar rows with a non-selectable header before
 * each group. Header rows are `disabled`, so arrow-key navigation skips them
 * and only real demos are selectable. Group order follows the registry.
 */
function buildItems(): ListItem[] {
  const byGroup = new Map<string, Demo[]>();
  for (const d of demos) {
    const list = byGroup.get(d.group);
    if (list) list.push(d);
    else byGroup.set(d.group, [d]);
  }
  const items: ListItem[] = [];
  for (const [group, list] of byGroup) {
    items.push({ id: `__group:${group}`, label: group.toUpperCase(), disabled: true });
    for (const d of list) {
      items.push({
        id: d.id,
        label: `  ${d.title}`,
        detail: d.requires?.length ? `needs ${d.requires.join("+")}` : undefined,
      });
    }
  }
  return items;
}

/**
 * Whether the *current* backend provides a capability. Read from the live
 * driver (resolved asynchronously at startup; a `capabilities_resolved` event
 * re-renders the app), so the same gallery correctly gates graphics-only demos
 * on a plain terminal, a Kitty/iTerm2 terminal, and the web canvas alike.
 */
function hasCapability(cap: DemoCapability): boolean {
  const caps = App.instance?.driver?.capabilities;
  if (!caps) return true; // not probed yet — don't pre-emptively warn
  return cap === "graphics" ? caps.graphicsProtocol !== "none" : caps.glyphProtocol;
}

function unmetCapabilities(demo: Demo): DemoCapability[] {
  return (demo.requires ?? []).filter((c) => !hasCapability(c));
}

export function Gallery() {
  const [selectedId, setSelectedId] = useState(demos[0]?.id ?? "");
  const demo = demos.find((d) => d.id === selectedId) ?? demos[0];

  // When the selected demo mounts, hand it keyboard focus (its primary widget),
  // so arrows/typing work without a Tab — the gallery's job, not each demo's.
  useEffect(() => {
    if (demo?.autoFocusTag && App.instance) autoFocus(App.instance, demo.autoFocusTag);
  }, [demo]);

  const items = buildItems();
  const unmet = demo ? unmetCapabilities(demo) : [];

  return (
    <Dock style={{ background: "$background" }}>
      <Header>ztui · demo gallery ({demos.length})</Header>
      <Footer>↑↓ choose · Tab into the demo · Ctrl+C quit</Footer>
      <HBox>
        <VBox style={{ width: 26, border: "rounded", borderColor: "$border" }}>
          <ListView
            items={items}
            selectedId={selectedId}
            onSelect={(item) => setSelectedId(item.id)}
            style={{ flexGrow: 1 }}
          />
        </VBox>
        <VBox style={{ flexGrow: 1, border: "rounded", borderColor: "$border" }}>
          {/* Selected-demo header: title + one-line description. */}
          <HBox style={{ height: 1, padding: { left: 1, right: 1 } }}>
            <Label style={{ bold: true, color: "$primary" }}>{demo?.title ?? ""}</Label>
            {demo?.description ? <Label style={{ dim: true }}> — {demo.description}</Label> : null}
          </HBox>
          {unmet.length > 0 ? (
            <Label style={{ color: "$warning", padding: { left: 1, right: 1 } }}>
              ⚠ needs {unmet.join(", ")} — this backend lacks it; showing anyway.
            </Label>
          ) : null}
          {/* `key` forces React to unmount the previous demo (running effect
              cleanups — timers, subscriptions) and mount the next one cleanly. */}
          <View key={demo?.id} style={{ flexGrow: 1 }}>
            {demo ? <demo.Component /> : null}
          </View>
        </VBox>
      </HBox>
    </Dock>
  );
}
