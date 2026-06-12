import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { HeroIcon } from "../media/heroic-icon.tsx";
import { useHotkey } from "../overlay/hotkey-palette.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";
import { Box } from "./box.tsx";
import { Dock } from "./dock.tsx";
import { Splitter } from "./splitter.tsx";
import { VBox } from "./vbox.tsx";

export type WorkbenchAnchor = "left" | "right" | "bottom";

export interface WorkbenchPanel {
  /** Stable id, unique across all panels. */
  id: string;
  /** Which dock region the panel lives in. */
  anchor: WorkbenchAnchor;
  /** Shown in the panel's border title and the bottom tab bar. */
  title: string;
  /** Heroicon name for the activity rail (left/right panels). */
  icon?: string;
  /** Panel body. */
  content: ReactNode;
}

export interface WorkbenchProps extends ComponentProps {
  panels: WorkbenchPanel[];
  /** Center/editor content. */
  children?: ReactNode;
  /** Regions that start expanded (with their first panel active). */
  initialOpen?: WorkbenchAnchor[];
  /** Starting sizes per region (cells). Defaults: side 26, bottom 8. */
  initialSizes?: Partial<Record<WorkbenchAnchor, number>>;
  /**
   * Serializable layout snapshot to restore on mount (open/size/active per
   * region). Takes precedence over `initialOpen`/`initialSizes`. Pair with
   * {@link WorkbenchProps.onLayoutChange} to persist and reload layout.
   */
  initialLayout?: WorkbenchLayout;
  /** Fired with a fresh snapshot whenever the layout changes (for persistence). */
  onLayoutChange?: (layout: WorkbenchLayout) => void;
}

/** Per-region UI state for one anchor. JSON-serializable. */
export interface RegionState {
  open: boolean;
  size: number;
  active: string | null;
}

/** A full, serializable workbench layout snapshot keyed by anchor. */
export type WorkbenchLayout = Record<WorkbenchAnchor, RegionState>;

const RAIL_WIDTH = 2;
const MIN_SIDE = 12;
const MIN_BOTTOM = 3;

/**
 * VSCode/JetBrains-style dockable workbench: hideable side panels driven by an
 * always-visible activity rail, a bottom panel toggled from a footer tab bar,
 * and draggable splitters for resizing. Layout lives in state, so show/hide and
 * tab switches are pure mutations the reconciler renders.
 *
 * Clicking a rail icon opens its panel (or collapses the region if that panel
 * is already active — matching VSCode). The rail is the only persistent chrome
 * cost (2 columns per used side); the bottom panel rides entirely in its
 * 1-row tab bar.
 */
export function Workbench({
  panels,
  children,
  initialOpen = [],
  initialSizes,
  initialLayout,
  onLayoutChange,
  ...rest
}: WorkbenchProps): ReactElement {
  const byAnchor = (a: WorkbenchAnchor) => panels.filter((p) => p.anchor === a);

  const init = (a: WorkbenchAnchor, defSize: number): RegionState => {
    if (initialLayout?.[a]) return initialLayout[a];
    const list = byAnchor(a);
    return {
      open: initialOpen.includes(a) && list.length > 0,
      size: initialSizes?.[a] ?? defSize,
      active: list[0]?.id ?? null,
    };
  };

  const [regions, setRegions] = useState<WorkbenchLayout>(() => ({
    left: init("left", 26),
    right: init("right", 26),
    bottom: init("bottom", 8),
  }));

  // Surface every layout change for persistence. Kept in a ref so the effect
  // doesn't re-fire when only the callback identity changes.
  const onChangeRef = useRef(onLayoutChange);
  onChangeRef.current = onLayoutChange;
  useEffect(() => {
    onChangeRef.current?.(regions);
  }, [regions]);

  // Select a panel: open the region on it, switch to it, or collapse when it's
  // the already-active panel of an open region.
  const select = (anchor: WorkbenchAnchor, id: string) => {
    setRegions((prev) => {
      const r = prev[anchor];
      const next: RegionState =
        r.open && r.active === id ? { ...r, open: false } : { ...r, open: true, active: id };
      return { ...prev, [anchor]: next };
    });
  };

  const toggle = (anchor: WorkbenchAnchor) => {
    setRegions((prev) => {
      const r = prev[anchor];
      const active = r.active ?? byAnchor(anchor)[0]?.id ?? null;
      return { ...prev, [anchor]: { ...r, open: !r.open, active } };
    });
  };

  const resize = (anchor: WorkbenchAnchor, delta: number) => {
    setRegions((prev) => {
      const r = prev[anchor];
      // Left grows rightward (+dx); right grows leftward (-dx); bottom grows
      // upward (-dy).
      const signed = anchor === "left" ? delta : -delta;
      const min = anchor === "bottom" ? MIN_BOTTOM : MIN_SIDE;
      return { ...prev, [anchor]: { ...r, size: Math.max(min, r.size + signed) } };
    });
  };

  // Keyboard parity with the rail/footer clicks (VSCode muscle memory).
  useHotkey({
    key: "ctrl+b",
    name: "Toggle left panel",
    group: "View",
    enabled: () => byAnchor("left").length > 0,
    handler: () => toggle("left"),
  });
  useHotkey({
    key: "ctrl+alt+b",
    name: "Toggle right panel",
    group: "View",
    enabled: () => byAnchor("right").length > 0,
    handler: () => toggle("right"),
  });
  useHotkey({
    key: "ctrl+j",
    name: "Toggle bottom panel",
    group: "View",
    enabled: () => byAnchor("bottom").length > 0,
    handler: () => toggle("bottom"),
  });

  const left = byAnchor("left");
  const right = byAnchor("right");
  const bottom = byAnchor("bottom");

  const panelOf = (id: string | null) => panels.find((p) => p.id === id);

  const dockChildren: ReactNode[] = [];

  // --- Left side: rail, panel, splitter ---
  if (left.length > 0) {
    dockChildren.push(
      <ActivityRail
        key="left-rail"
        anchor="left"
        panels={left}
        region={regions.left}
        onSelect={select}
      />,
    );
    if (regions.left.open && panelOf(regions.left.active)) {
      dockChildren.push(
        <PanelRegion
          key="left-panel"
          anchor="left"
          size={regions.left.size}
          panel={panelOf(regions.left.active)!}
        />,
        <Splitter
          key="left-split"
          orientation="vertical"
          style={{ dock: "left", width: 1 }}
          onResize={(d) => resize("left", d)}
        />,
      );
    }
  }

  // --- Right side: rail, panel, splitter ---
  if (right.length > 0) {
    dockChildren.push(
      <ActivityRail
        key="right-rail"
        anchor="right"
        panels={right}
        region={regions.right}
        onSelect={select}
      />,
    );
    if (regions.right.open && panelOf(regions.right.active)) {
      dockChildren.push(
        <PanelRegion
          key="right-panel"
          anchor="right"
          size={regions.right.size}
          panel={panelOf(regions.right.active)!}
        />,
        <Splitter
          key="right-split"
          orientation="vertical"
          style={{ dock: "right", width: 1 }}
          onResize={(d) => resize("right", d)}
        />,
      );
    }
  }

  // --- Center column: editor fills, bottom panel docked below it ---
  const centerChildren: ReactNode[] = [];
  if (bottom.length > 0) {
    // Tab bar sits at the very bottom (added first so it docks bottom-most).
    centerChildren.push(
      <BottomTabBar
        key="bottom-tabs"
        panels={bottom}
        region={regions.bottom}
        onSelect={select}
        onToggle={() => toggle("bottom")}
      />,
    );
    if (regions.bottom.open && panelOf(regions.bottom.active)) {
      centerChildren.push(
        <PanelRegion
          key="bottom-panel"
          anchor="bottom"
          size={regions.bottom.size}
          panel={panelOf(regions.bottom.active)!}
        />,
        <Splitter
          key="bottom-split"
          orientation="horizontal"
          style={{ dock: "bottom", width: "100%", height: 1 }}
          onResize={(d) => resize("bottom", d)}
        />,
      );
    }
  }
  centerChildren.push(
    <Box key="center" style={{ width: "100%", height: "100%" }}>
      {children}
    </Box>,
  );

  dockChildren.push(
    <Dock key="center-col" style={{ width: "100%", height: "100%" }}>
      {centerChildren}
    </Dock>,
  );

  return (
    <Dock {...rest} style={{ width: "100%", height: "100%", ...rest.style }}>
      {dockChildren}
    </Dock>
  );
}

function ActivityRail({
  anchor,
  panels,
  region,
  onSelect,
}: {
  anchor: "left" | "right";
  panels: WorkbenchPanel[];
  region: RegionState;
  onSelect: (anchor: WorkbenchAnchor, id: string) => void;
}): ReactElement {
  return (
    <VBox style={{ dock: anchor, width: RAIL_WIDTH, height: "100%", background: "$panel" }}>
      {panels.map((p) => {
        const active = region.open && region.active === p.id;
        // onClick goes on the icon itself: clicks resolve to the deepest hit
        // widget with no bubbling, so a wrapper Box's handler would never fire.
        return (
          <HeroIcon
            key={p.id}
            name={p.icon ?? "square-3-stack-3d"}
            variant="mini"
            onClick={() => onSelect(anchor, p.id)}
            style={{ width: RAIL_WIDTH, height: 1, background: active ? "$selectionBg" : "$panel" }}
          />
        );
      })}
    </VBox>
  );
}

function PanelRegion({
  anchor,
  size,
  panel,
}: {
  anchor: WorkbenchAnchor;
  size: number;
  panel: WorkbenchPanel;
}): ReactElement {
  const dockStyle =
    anchor === "bottom"
      ? { dock: "bottom" as const, width: "100%", height: size }
      : { dock: anchor, width: size, height: "100%" };
  return (
    <Box title={panel.title} style={{ ...dockStyle, border: "rounded", padding: 1 }}>
      {panel.content}
    </Box>
  );
}

function BottomTabBar({
  panels,
  region,
  onSelect,
  onToggle,
}: {
  panels: WorkbenchPanel[];
  region: RegionState;
  onSelect: (anchor: WorkbenchAnchor, id: string) => void;
  onToggle: () => void;
}): ReactElement {
  // Handlers live on the Labels (the hit targets) since clicks don't bubble.
  return (
    <Box
      style={{
        dock: "bottom",
        width: "100%",
        height: 1,
        background: "$panel",
        layout: "horizontal",
      }}
    >
      <Label onClick={onToggle} style={{ width: 2, height: 1 }}>
        {region.open ? "⌄ " : "⌃ "}
      </Label>
      {panels.map((p) => {
        const active = region.open && region.active === p.id;
        return (
          <Label
            key={p.id}
            onClick={() => onSelect("bottom", p.id)}
            style={{
              height: 1,
              padding: { left: 1, right: 1 },
              bold: active,
              background: active ? "$selectionBg" : "$panel",
            }}
          >
            {p.title}
          </Label>
        );
      })}
    </Box>
  );
}
