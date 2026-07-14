import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import type { Widget } from "../../../dom/widget.ts";
import { HeroIcon } from "../media/heroic-icon.tsx";
import { useHotkey } from "../overlay/hotkey-palette.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";
import { Box } from "./box.tsx";
import { Dock } from "./dock.tsx";
import { Panel } from "./panel.tsx";
import { Splitter } from "./splitter.tsx";
import { VBox } from "./vbox.tsx";

/** Which dock region a {@link Workbench} panel lives in. */
export type WorkbenchAnchor = "left" | "right" | "bottom";

/** A dockable panel in a {@link Workbench}. */
export interface WorkbenchPanel {
  /** Stable id, unique across all panels. */
  id: string;
  /** Which dock region the panel lives in. */
  anchor: WorkbenchAnchor;
  /** Shown in the panel's border title and the bottom tab bar. */
  title: string;
  /** Heroicon name shown in the rail and panel header (e.g. "folder"). */
  icon?: string;
  /** Panel body. */
  content: ReactNode;
}

export interface WorkbenchProps extends ComponentProps {
  /** The dockable panels. */
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
  /**
   * Keys that toggle each region. Defaults to {@link DEFAULT_TOGGLE_KEYS}.
   * Note: `ctrl+j`/`ctrl+i`/`ctrl+m` can't be used — terminals deliver them as
   * Enter/Tab — and `alt`/`ctrl+alt` combos only reach apps under the Kitty
   * keyboard protocol. The default bottom key is `ctrl+\`` (a.k.a. ctrl+space),
   * which works on legacy terminals too.
   */
  toggleKeys?: Partial<Record<WorkbenchAnchor, string>>;
}

/** Region toggle keys chosen to work on legacy terminals, not just Kitty. */
export const DEFAULT_TOGGLE_KEYS: Record<WorkbenchAnchor, string> = {
  left: "ctrl+b",
  right: "ctrl+alt+b",
  bottom: "ctrl+space",
};

/** Per-region UI state for one anchor. JSON-serializable. */
export interface RegionState {
  /** Whether the region is expanded. */
  open: boolean;
  /** Region size in cells (width for left/right, height for bottom). */
  size: number;
  /** Id of the active panel in the region, or null. */
  active: string | null;
}

/**
 * A full, serializable workbench snapshot: per-region state plus the
 * drag-move re-dock overrides (panel id -> anchor), so a re-docked layout
 * round-trips through {@link WorkbenchProps.onLayoutChange} / `initialLayout`.
 */
export interface WorkbenchLayout {
  /** Per-anchor region state. */
  regions: Record<WorkbenchAnchor, RegionState>;
  /** Drag-move re-dock overrides: panel id → anchor. */
  overrides: Record<string, WorkbenchAnchor>;
}

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
  toggleKeys,
  ...rest
}: WorkbenchProps): ReactElement {
  const keys = { ...DEFAULT_TOGGLE_KEYS, ...toggleKeys };
  // Runtime re-dock overrides (panel id -> anchor) from drag-to-move. A panel's
  // declared `anchor` is its default; an override wins. Restored from and
  // persisted into the layout snapshot, so moves survive a reload.
  const [overrides, setOverrides] = useState<Record<string, WorkbenchAnchor>>(
    () => initialLayout?.overrides ?? {},
  );
  const anchorOf = (p: WorkbenchPanel) => overrides[p.id] ?? p.anchor;
  const byAnchor = (a: WorkbenchAnchor) => panels.filter((p) => anchorOf(p) === a);

  // Active drag-to-move gesture: the panel being dragged and the region the
  // pointer is currently over (the drop target), used to tint that rail/tab bar.
  const [drag, setDrag] = useState<{ id: string; over: WorkbenchAnchor | null } | null>(null);
  const rootRef = useRef<Widget | null>(null);

  const init = (a: WorkbenchAnchor, defSize: number): RegionState => {
    if (initialLayout?.regions?.[a]) return initialLayout.regions[a];
    const list = byAnchor(a);
    return {
      open: initialOpen.includes(a) && list.length > 0,
      size: initialSizes?.[a] ?? defSize,
      active: list[0]?.id ?? null,
    };
  };

  const [regions, setRegions] = useState<Record<WorkbenchAnchor, RegionState>>(() => ({
    left: init("left", 26),
    right: init("right", 26),
    bottom: init("bottom", 8),
  }));

  // Surface every layout change for persistence. Kept in a ref so the effect
  // doesn't re-fire when only the callback identity changes.
  const onChangeRef = useRef(onLayoutChange);
  onChangeRef.current = onLayoutChange;
  useEffect(() => {
    onChangeRef.current?.({ regions, overrides });
  }, [regions, overrides]);

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

    // The sibling lookup below must see *this* move's own override applied,
    // not the render-closure's `overrides` snapshot — otherwise a second
    // move() call landing before React flushes the first (e.g. a fast
    // double drag-end in the same tick) would repair the source region
    // using a sibling list that doesn't yet reflect the first move, and
    // could point `active` at a panel that itself was just re-docked away.
    // Nesting the setRegions update inside setOverrides's updater guarantees
    // it always sees the up-to-date pending override.
    setOverrides((prev) => {
      const nextOverrides = { ...prev, [id]: target };
      setRegions((prevRegions) => {
        const next = {
          ...prevRegions,
          [target]: { ...prevRegions[target], open: true, active: id },
        };
        const src = prevRegions[source];
        if (src.active === id) {
          // Remaining panels on the source after this move (effective anchor).
          const sibling = panels.find(
            (p) => p.id !== id && (nextOverrides[p.id] ?? p.anchor) === source,
          );
          next[source] = sibling
            ? { ...src, active: sibling.id }
            : { ...src, active: null, open: false };
        }
        return next;
      });
      return nextOverrides;
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
    key: keys.left,
    name: "Toggle left panel",
    group: "View",
    enabled: () => byAnchor("left").length > 0,
    handler: () => toggle("left"),
  });
  useHotkey({
    key: keys.right,
    name: "Toggle right panel",
    group: "View",
    enabled: () => byAnchor("right").length > 0,
    handler: () => toggle("right"),
  });
  useHotkey({
    key: keys.bottom,
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
  // The rail is tinted `$surface` — a shade darker than the panels' `$panel` —
  // so it reads as a separate region by colour alone (no divider line needed).
  // While it's the active drop target for a drag-to-move it flips to `$primary`.
  const railBg = dropTarget === anchor ? "$primary" : "$surface";

  return (
    <VBox style={{ dock: anchor, width: RAIL_WIDTH, height: "100%", background: railBg }}>
      {panels.map((p) => {
        const active = region.open && region.active === p.id;
        // A 2-cell rasterized heroicon, centered in the rail (no horizontal pad).
        // The `solid` variant fills the cell (the `mini` variant is scaled to
        // ~83%, leaving a visible gap). A 1-row top margin spaces it from the
        // icon above. Drag handlers go on the icon (clicks resolve to the hit
        // widget): a tap toggles, a drag re-docks. `id` lets tests target it.
        return (
          <HeroIcon
            key={p.id}
            id={`rail-${p.id}`}
            name={p.icon ?? "square-3-stack-3d"}
            variant="solid"
            {...dragProps(anchor, p.id)}
            style={{
              width: RAIL_WIDTH,
              height: 1,
              margin: { top: 1 },
              background: active ? "$selectionBg" : railBg,
            }}
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
  // Flat panel: a colored header (icon + title) instead of a border, so chrome
  // is one row and nothing can overflow a box edge. The body is padded + clips.
  const icon = panel.icon ? <HeroIcon name={panel.icon} variant="solid" /> : undefined;
  return (
    <Panel icon={icon} title={panel.title} style={{ ...dockStyle, background: "$panel" }}>
      <Box
        style={{ width: "100%", height: "100%", padding: { left: 1, top: 1 }, overflowY: "hidden" }}
      >
        {panel.content}
      </Box>
    </Panel>
  );
}

function BottomTabBar({
  panels,
  region,
  dragProps,
  dropTarget,
}: {
  panels: WorkbenchPanel[];
  region: RegionState;
  dragProps: DragPropsFactory;
  dropTarget: WorkbenchAnchor | null;
}): ReactElement {
  // Handlers live on the Labels (the hit targets) since clicks don't bubble.
  // No chevron toggle: clicking a tab name opens it, and clicking the active
  // tab collapses the region (see `select`), so the names are the toggle.
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
