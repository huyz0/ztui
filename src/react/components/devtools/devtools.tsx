import { type ReactElement, useEffect, useMemo, useState } from "react";
import type { DOMNode } from "../../../dom/dom.ts";
import type { Widget } from "../../../dom/widget.ts";
import {
  type DevToolsNode,
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
  full?: boolean;
  widgetsRendered?: number;
  bytes?: number;
  reasons?: string[];
}

export interface DevToolsProps extends ComponentProps {
  /** Root widget to inspect (e.g. the inspected app's container, or the screen). */
  root: Widget | null;
  /** Latest frame summary from `App.getLastFrame()` — drives the profiler strip. */
  frame?: DevToolsFrame | null;
  /** Re-read the live tree on this interval (ms). Default `400`. */
  refreshMs?: number;
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
export function DevTools({ root, frame, refreshMs = 400, ...rest }: DevToolsProps): ReactElement {
  const [, setTick] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  // `null` = "expand everything" until the user collapses something.
  const [expanded, setExpanded] = useState<string[] | null>(null);

  // The live tree mutates in place, so poll a re-serialize to reflect changes.
  useEffect(() => {
    const h = setInterval(() => setTick((n) => n + 1), refreshMs);
    return () => clearInterval(h);
  }, [refreshMs]);

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

  const profiler = frame
    ? `${frame.full ? "● full" : "○ scoped"}  ${frame.widgetsRendered ?? 0} rendered  ${
        frame.bytes ?? 0
      }B${frame.reasons?.length ? `  · ${frame.reasons.slice(0, 2).join(", ")}` : ""}`
    : "no frame yet";

  return (
    <VBox {...rest} style={{ width: "100%", height: "100%", ...rest.style }}>
      <Label style={{ bold: true, color: "$accent", height: 1 }}>🛠 DevTools</Label>
      <HBox style={{ width: "100%", height: "1fr" }}>
        <Tree
          data={tree}
          selectedId={selected}
          expanded={expanded ?? allIds}
          onExpandedChange={setExpanded}
          onSelect={(n) => setSelected(n.id)}
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
