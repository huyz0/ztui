import { createElement, type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { App } from "../../../core/app.ts";
import type { DOMNode } from "../../../dom/dom.ts";
import type { Widget } from "../../../dom/widget.ts";
import {
  type DevToolsNode,
  findDevId,
  resolveDevNode,
  serializeDevTree,
  widgetDetail,
} from "../../../tools/devtools.ts";
import { DescriptionList } from "../data/description-list.tsx";
import { Tree } from "../data/tree.tsx";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";

/** A frame summary (subset of `App.getLastFrame()`), shown in the profiler strip. */
export interface DevToolsFrame {
  /** Pipeline-run index, used to dedupe history; from `App.getLastFrame()`. */
  seq?: number;
  full?: boolean;
  widgetsRendered?: number;
  bytes?: number;
  reasons?: string[];
}

const SPARK = "▁▂▃▄▅▆▇█";

/** A unicode sparkline of recent values, scaled to the max. */
function sparkline(vals: number[]): string {
  if (vals.length === 0) return "";
  const max = Math.max(1, ...vals);
  return vals.map((v) => SPARK[Math.min(7, Math.round((v / max) * 7))]).join("");
}

/** Screen rect of an inspected widget, reported to {@link DevToolsProps.onInspect}. */
export interface DevToolsRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DevToolsProps extends ComponentProps {
  /** Root widget to inspect (e.g. the inspected app's container, or the screen). */
  root: Widget | null;
  /** Latest frame summary from `App.getLastFrame()` — drives the profiler strip. */
  frame?: DevToolsFrame | null;
  /** Re-read the live tree on this interval (ms). Default `400`. */
  refreshMs?: number;
  /**
   * Pick mode: track the widget under the pointer (`App.instance.hoveredWidget`)
   * and select it in the tree — "point at the UI to inspect it". Off by default.
   */
  pick?: boolean;
  /**
   * Fired when the selected node changes, with its screen region — render a
   * {@link DevToolsHighlight} at it (under a full-screen root) to box the widget.
   */
  onInspect?: (region: DevToolsRegion | null) => void;
}

/**
 * A block highlight over an inspected widget's screen rect — it tints the
 * widget's cells (keeping their glyphs), not a character border. Pass the region
 * from {@link DevToolsProps.onInspect} and mount it under a full-screen root
 * (e.g. the app's `Dock`); it's a pointer-transparent, full-screen overlay that
 * paints at absolute screen coordinates, so clicks fall through and it never
 * lands in the wrong place.
 */
export function DevToolsHighlight({
  region,
}: {
  region: DevToolsRegion | null;
}): ReactElement | null {
  if (!region || region.width < 1 || region.height < 1) return null;
  return createElement("ztui-devtools-highlight", {
    target: region,
    style: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", zIndex: 9999 },
  });
}

/**
 * An in-app DevTools panel — a React-DevTools-style inspector for the live widget
 * tree. The left pane is the tree (`tag #id .class`); selecting a node shows its
 * geometry, flags, and resolved style on the right; the footer is a one-line
 * render-profiler readout (scoped vs full frame, widgets rendered, bytes, and the
 * reasons the last frame ran). Read-only.
 *
 * Point it at a **different** subtree than itself (pass the inspected app's root
 * via a ref) so it doesn't inspect its own widgets.
 *
 * ```tsx
 * <DevTools root={appRootRef.current} frame={app.getLastFrame()} />
 * ```
 */
export function DevTools({
  root,
  frame,
  refreshMs = 400,
  pick = false,
  onInspect,
  ...rest
}: DevToolsProps): ReactElement {
  const [, setTick] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  // `null` = "expand everything" until the user collapses something.
  const [expanded, setExpanded] = useState<string[] | null>(null);
  // Rolling history of widgets-rendered per frame, for the profiler sparkline.
  const histRef = useRef<number[]>([]);
  const lastSeqRef = useRef<number>(-1);
  if (frame && frame.seq !== lastSeqRef.current) {
    lastSeqRef.current = frame.seq ?? lastSeqRef.current + 1;
    histRef.current = [...histRef.current, frame.widgetsRendered ?? 0].slice(-40);
  }

  // Select a node id and report its screen region for the highlight overlay.
  const select = (id: string | null) => {
    setSelected(id);
    const node = id && root ? resolveDevNode(root as DOMNode, id) : null;
    const r = node && "region" in node ? (node as Widget).region : null;
    onInspect?.(r && r.width > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null);
  };

  // The live tree mutates in place, so poll a re-serialize to reflect changes.
  // In pick mode the same poll tracks the hovered widget into the selection.
  // biome-ignore lint/correctness/useExhaustiveDependencies: poll re-reads live tree + hover; select/onInspect are stable enough
  useEffect(() => {
    const h = setInterval(() => {
      setTick((n) => n + 1);
      if (!pick || !root) return;
      const hovered = App.instance?.hoveredWidget ?? null;
      if (!hovered) return;
      const id = findDevId(root as DOMNode, hovered as DOMNode);
      if (id && id !== selected) select(id);
    }, refreshMs);
    return () => clearInterval(h);
  }, [refreshMs, pick, root, selected]);

  // `setTick` forces this to recompute against the current live tree each poll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read the mutable tree every tick
  const tree = useMemo(() => (root ? [serializeDevTree(root)] : []), [root, selected]);
  const detail = useMemo(() => {
    if (!root || !selected) return [];
    return widgetDetail(resolveDevNode(root as DOMNode, selected));
  }, [root, selected]);

  // Default to fully expanded so the tree is browsable at a glance.
  const allIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (ns: DevToolsNode[]) => {
      for (const n of ns) {
        ids.push(n.id);
        walk(n.children);
      }
    };
    walk(tree);
    return ids;
  }, [tree]);

  const spark = sparkline(histRef.current);
  const profiler = frame
    ? `${frame.full ? "● full" : "○ scoped"}  ${frame.widgetsRendered ?? 0} rendered  ${
        frame.bytes ?? 0
      }B${spark ? `  ${spark}` : ""}${
        frame.reasons?.length ? `  · ${frame.reasons.slice(0, 2).join(", ")}` : ""
      }`
    : "no frame yet";

  return (
    <VBox {...rest} style={{ width: "100%", height: "100%", ...rest.style }}>
      <Label style={{ bold: true, color: "$accent", height: 1 }}>
        🛠 DevTools{pick ? "  ◎ pick" : ""}
      </Label>
      <HBox style={{ width: "100%", height: "1fr" }}>
        <Tree
          data={tree}
          selectedId={selected}
          expanded={expanded ?? allIds}
          onExpandedChange={setExpanded}
          onSelect={(n) => select(n.id)}
          showGuides
          style={{ width: "1fr", height: "100%" }}
        />
        <VBox style={{ width: "1fr", height: "100%", padding: { left: 1 } }}>
          {detail.length ? (
            <DescriptionList items={detail} termWidth={10} />
          ) : (
            <Label style={{ color: "$dimmed" }}>Select a node…</Label>
          )}
        </VBox>
      </HBox>
      <Label markup style={{ height: 1, color: "$dimmed", background: "$panel" }}>
        {profiler}
      </Label>
    </VBox>
  );
}
DevTools.displayName = "DevTools";
