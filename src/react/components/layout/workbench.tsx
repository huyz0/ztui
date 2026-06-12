import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import type { Widget } from "../../../dom/widget.ts";
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
  // Runtime re-dock overrides (panel id -> anchor) from drag-to-move. A panel's
  // declared `anchor` is its default; an override wins. Not persisted in the
  // layout snapshot (which is keyed by anchor), so moves reset on reload.
  const [overrides, setOverrides] = useState<Record<string, WorkbenchAnchor>>({});
  const anchorOf = (p: WorkbenchPanel) => overrides[p.id] ?? p.anchor;
  const byAnchor = (a: WorkbenchAnchor) => panels.filter((p) => anchorOf(p) === a);

  // Active drag-to-move gesture: the panel being dragged and the region the
  // pointer is currently over (the drop target), used to tint that rail/tab bar.
  const [drag, setDrag] = useState<{ id: string; over: WorkbenchAnchor | null } | null>(null);
  const rootRef = useRef<Widget | null>(null);

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

  // Re-dock a panel to another region: focus it in the target, and repair the
  // source region's active panel (point it at a remaining sibling, or close it
  // if the region is now empty).
  const move = (id: string, target: WorkbenchAnchor) => {
    const panel = panelOf(id);
    if (!panel) return;
    const source = anchorOf(panel);
    if (source === target) return;

    setOverrides((prev) => ({ ...prev, [id]: target }));
    setRegions((prev) => {
      const next = { ...prev, [target]: { ...prev[target], open: true, active: id } };
      const src = prev[source];
      if (src.active === id) {
        // Remaining panels on the source after this move (effective anchor).
        const sibling = panels.find((p) => p.id !== id && (overrides[p.id] ?? p.anchor) === source);
        next[source] = sibling
          ? { ...src, active: sibling.id }
          : { ...src, active: null, open: false };
      }
      return next;
    });
  };

  // Map an absolute pointer position to a drop region using thirds of the
  // workbench area: outer-left → left, outer-right → right, lower band → bottom.
  const zoneAt = (x: number, y: number): WorkbenchAnchor | null => {
    const r = rootRef.current?.region;
    if (!r || r.width === 0 || r.height === 0) return null;
    const relX = (x - r.x) / r.width;
    const relY = (y - r.y) / r.height;
    if (relY > 0.66) return "bottom";
    if (relX < 0.25) return "left";
    if (relX > 0.75) return "right";
    return null;
  };

  // Wire one drag source (a rail icon or a tab): a tap toggles/selects, a drag
  // that ends over a different region re-docks the panel there.
  const dragProps = (anchor: WorkbenchAnchor, id: string) => ({
    onDragStart: () => setDrag({ id, over: null }),
    onDragMove: (x: number, y: number) => setDrag({ id, over: zoneAt(x, y) }),
    onDragEnd: (x: number, y: number, moved: boolean) => {
      const target = zoneAt(x, y);
      setDrag(null);
      if (!moved) {
        select(anchor, id);
      } else if (target && target !== anchorOf(panelOf(id) ?? ({} as WorkbenchPanel))) {
        move(id, target);
      }
    },
  });

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
        dragProps={dragProps}
        dropTarget={drag?.over ?? null}
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
        dragProps={dragProps}
        dropTarget={drag?.over ?? null}
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
        dragProps={dragProps}
        dropTarget={drag?.over ?? null}
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
    <Dock {...rest} ref={rootRef} style={{ width: "100%", height: "100%", ...rest.style }}>
      {dockChildren}
    </Dock>
  );
}

type DragPropsFactory = (
  anchor: WorkbenchAnchor,
  id: string,
) => {
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number, moved: boolean) => void;
};

function ActivityRail({
  anchor,
  panels,
  region,
  dragProps,
  dropTarget,
}: {
  anchor: "left" | "right";
  panels: WorkbenchPanel[];
  region: RegionState;
  dragProps: DragPropsFactory;
  dropTarget: WorkbenchAnchor | null;
}): ReactElement {
  // Tint the whole rail while it's the active drop target for a drag-to-move.
  const railBg = dropTarget === anchor ? "$primary" : "$panel";
  return (
    <VBox style={{ dock: anchor, width: RAIL_WIDTH, height: "100%", background: railBg }}>
      {panels.map((p) => {
        const active = region.open && region.active === p.id;
        // Drag handlers go on the icon itself: clicks/drags resolve to the
        // deepest hit widget with no bubbling. A tap toggles; a drag re-docks.
        return (
          <HeroIcon
            key={p.id}
            name={p.icon ?? "square-3-stack-3d"}
            variant="mini"
            {...dragProps(anchor, p.id)}
            style={{ width: RAIL_WIDTH, height: 1, background: active ? "$selectionBg" : railBg }}
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
  dragProps,
  dropTarget,
  onToggle,
}: {
  panels: WorkbenchPanel[];
  region: RegionState;
  dragProps: DragPropsFactory;
  dropTarget: WorkbenchAnchor | null;
  onToggle: () => void;
}): ReactElement {
  // Handlers live on the Labels (the hit targets) since clicks don't bubble.
  const barBg = dropTarget === "bottom" ? "$primary" : "$panel";
  return (
    <Box
      style={{
        dock: "bottom",
        width: "100%",
        height: 1,
        background: barBg,
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
            {...dragProps("bottom", p.id)}
            style={{
              height: 1,
              padding: { left: 1, right: 1 },
              bold: active,
              background: active ? "$selectionBg" : barBg,
            }}
          >
            {p.title}
          </Label>
        );
      })}
    </Box>
  );
}
