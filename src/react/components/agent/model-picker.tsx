import { type ReactElement, type ReactNode, useEffect, useMemo, useState } from "react";
import type { TableColumn } from "../../../widgets/data/table.ts";
import { Input } from "../controls/input.tsx";
import { Table } from "../data/table.tsx";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { HeroIcon } from "../media/heroic-icon.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";

/** Where a model runs. Rendered as an icon, not text. */
export type ModelLocation = "local" | "remote";

/** One selectable model in a {@link ModelPicker}. */
export interface ModelEntry {
  /** Stable id (the committed selection is matched on this). */
  id: string;
  /** Display name, e.g. `"Claude Opus 4.8"`. */
  name: string;
  /** Provider/vendor, e.g. `"Anthropic"`. */
  provider?: string;
  /**
   * Relative cost. A number renders as a multiplier badge (`1` → `1×`, `2` →
   * `2×`, coloured by magnitude); a string renders verbatim (`"5×"`,
   * `"$3/Mtok"`) for custom pricing.
   */
  cost?: number | string;
  /** Whether the model does extended reasoning — shows a reasoning icon. */
  reasoning?: boolean;
  /** Where the model runs — shows a local/remote icon instead of text. */
  location?: ModelLocation;
}

/** Heroicon names for the icon columns; override any to re-theme. */
export interface ModelPickerIcons {
  /** `location: "local"`. Default `"computer-desktop"`. */
  local?: string;
  /** `location: "remote"`. Default `"cloud"`. */
  remote?: string;
  /** `reasoning: true`. Default `"sparkles"`. */
  reasoning?: string;
}

export interface ModelPickerProps extends ComponentProps {
  /** The models to choose from. */
  models: ModelEntry[];
  /** Currently selected model id — marked with a ✓. */
  value?: string;
  /** A model was chosen (Enter / double-click on a row). */
  onSelect?: (model: ModelEntry) => void;
  /** Show the text filter box above the list. Default `true`. */
  filterable?: boolean;
  /** Placeholder for the filter box. */
  filterPlaceholder?: string;
  /** Match the filter against these fields. Default: name + provider. */
  filterFields?: (keyof ModelEntry)[];
  /**
   * Group rows by provider — contiguous same-provider rows, with the provider
   * name shown once (bold) at the head of each group. Default `true`.
   */
  groupByProvider?: boolean;
  /** Override the icon-column glyphs. */
  icons?: ModelPickerIcons;
  /** Extra columns appended after the built-ins (kept fully composable). */
  extraColumns?: TableColumn<ModelEntry>[];
}

const DEFAULT_ICONS: Required<ModelPickerIcons> = {
  local: "computer-desktop",
  remote: "cloud",
  reasoning: "sparkles",
};

/** Cost → coloured multiplier/label cell. */
function costCell(cost: ModelEntry["cost"]): ReactNode {
  if (cost == null) return <Label> </Label>;
  if (typeof cost === "number") {
    const color = cost <= 1 ? "$success" : cost === 2 ? "$warning" : "$error";
    return <Label style={{ color }}>{cost}×</Label>;
  }
  return <Label style={{ color: "$foreground" }}>{cost}</Label>;
}

/**
 * A filterable model picker rendered as a table list: one row per model with
 * its provider, name, a cost multiplier badge, a reasoning icon, and a
 * local/remote icon (icons, not text). Type in the filter to narrow the rows;
 * arrow-navigate and press Enter (or double-click) to choose. Columns appear
 * only when at least one model supplies that field, and `extraColumns` appends
 * your own — so it stays a composable primitive.
 *
 * ```tsx
 * <ModelPicker
 *   value={modelId}
 *   onSelect={(m) => setModelId(m.id)}
 *   models={[
 *     { id: "opus", provider: "Anthropic", name: "Opus 4.8", cost: 2, reasoning: true, location: "remote" },
 *     { id: "ollama", provider: "Ollama", name: "Llama 3.1", cost: 1, location: "local" },
 *   ]}
 * />
 * ```
 */
export function ModelPicker({
  models,
  value,
  onSelect,
  filterable = true,
  filterPlaceholder = "Filter models…",
  filterFields = ["name", "provider"],
  groupByProvider = true,
  icons,
  extraColumns,
  ...rest
}: ModelPickerProps): ReactElement {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const glyphs = { ...DEFAULT_ICONS, ...icons };

  // Only show a column when some model actually carries that field.
  const has = {
    provider: models.some((m) => m.provider != null),
    cost: models.some((m) => m.cost != null),
    reasoning: models.some((m) => m.reasoning != null),
    location: models.some((m) => m.location != null),
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) =>
      filterFields.some((f) =>
        String(m[f] ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [models, query, filterFields]);

  // Group by provider: bucket in first-appearance order so same-provider rows
  // are contiguous (stable within a group). Navigation/marker index into this.
  const rowsView = useMemo(() => {
    if (!groupByProvider || !has.provider) return filtered;
    const groups = new Map<string, ModelEntry[]>();
    for (const m of filtered) {
      const key = m.provider ?? "";
      const bucket = groups.get(key);
      if (bucket) bucket.push(m);
      else groups.set(key, [m]);
    }
    return Array.from(groups.values()).flat();
  }, [filtered, groupByProvider, has.provider]);

  // Keep the cursor in range as the visible set shrinks.
  const cursor = Math.min(index, Math.max(0, rowsView.length - 1));

  // The cursor otherwise only ever initializes to 0, regardless of which
  // model `value` marks as current — opening the picker always highlighted
  // the first row instead of the actual selection, so arrowing immediately
  // moved off it and Enter could activate the wrong model. Sync to `value`'s
  // row on mount and whenever the prop itself changes, without fighting the
  // user's own arrow-key navigation the rest of the time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to `value` changing, not every rowsView recompute from filtering
  useEffect(() => {
    if (value == null) return;
    const idx = rowsView.findIndex((m) => m.id === value);
    if (idx >= 0) setIndex(idx);
  }, [value]);

  const columns: TableColumn<ModelEntry>[] = [
    {
      key: "marker",
      header: "",
      width: 2,
      align: "center",
      render: (row) =>
        row.id === value ? (
          <Label style={{ color: "$success", bold: true }}>✓</Label>
        ) : (
          <Label> </Label>
        ),
    },
    ...(has.provider
      ? [
          {
            key: "provider",
            header: "Provider",
            width: 12,
            render: (row: ModelEntry, dataIndex: number) => {
              // With grouping, show the provider once at the head of each run.
              const head =
                !groupByProvider ||
                dataIndex === 0 ||
                rowsView[dataIndex - 1]?.provider !== row.provider;
              return head ? (
                <Label style={{ color: "$dimmed", bold: groupByProvider }}>
                  {row.provider ?? ""}
                </Label>
              ) : (
                <Label> </Label>
              );
            },
          } as TableColumn<ModelEntry>,
        ]
      : []),
    { key: "name", header: "Model", width: "1fr", minWidth: 14 },
    ...(has.cost
      ? [
          {
            key: "cost",
            header: "Cost",
            width: 6,
            align: "right" as const,
            render: (row: ModelEntry) => costCell(row.cost),
          } as TableColumn<ModelEntry>,
        ]
      : []),
    ...(has.reasoning
      ? [
          {
            key: "reasoning",
            header: "Reason",
            width: 7,
            align: "center" as const,
            render: (row: ModelEntry) =>
              row.reasoning ? (
                <HeroIcon name={glyphs.reasoning} style={{ color: "$accent" }} />
              ) : (
                <Label> </Label>
              ),
          } as TableColumn<ModelEntry>,
        ]
      : []),
    ...(has.location
      ? [
          {
            key: "location",
            header: "Where",
            width: 6,
            align: "center" as const,
            render: (row: ModelEntry) =>
              row.location === "local" ? (
                <HeroIcon name={glyphs.local} style={{ color: "$success" }} />
              ) : row.location === "remote" ? (
                <HeroIcon name={glyphs.remote} style={{ color: "$secondary" }} />
              ) : (
                <Label> </Label>
              ),
          } as TableColumn<ModelEntry>,
        ]
      : []),
    ...(extraColumns ?? []),
  ];

  return (
    <VBox {...rest} style={{ width: "100%", ...rest.style }}>
      {filterable ? (
        <HBox style={{ height: 1 }}>
          <Label style={{ color: "$dimmed", width: 3 }}>🔍</Label>
          <Input
            value={query}
            placeholder={filterPlaceholder}
            onChange={(v) => {
              setQuery(v);
              setIndex(0);
            }}
            style={{ width: "1fr", height: 1, border: "none" }}
          />
        </HBox>
      ) : undefined}
      {/* A blank line separates the search box from the list. */}
      {filterable ? <VBox style={{ height: 1 }} /> : undefined}
      <Table<ModelEntry>
        data={rowsView}
        columns={columns}
        selectedIndex={cursor}
        onSelect={(_row, i) => setIndex(i)}
        onActivate={(row) => onSelect?.(row)}
        style={{ width: "100%", height: "1fr" }}
      />
    </VBox>
  );
}
ModelPicker.displayName = "ModelPicker";
