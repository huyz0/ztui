import {
  createElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { App } from "../../../core/app.ts";
import { Offset } from "../../../geometry/offset.ts";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import type { ComponentProps } from "../types.ts";

/** Context handed to {@link GalleryViewProps.renderItem} for each cell. */
export interface GalleryItemContext {
  /** The item's flat index in `items`. */
  index: number;
  /** Whether this item is the current cursor selection. */
  selected: boolean;
}

/** Props for {@link GalleryView}. */
export interface GalleryViewProps<T> extends Omit<ComponentProps, "children"> {
  /** The items to lay out as a grid. */
  items: T[];
  /** Renders one item into a fixed `itemWidth` × `itemHeight` cell. */
  renderItem: (item: T, ctx: GalleryItemContext) => ReactNode;
  /** Cell width in cells — also the basis for the auto column count. */
  itemWidth: number;
  /** Cell height in cells. */
  itemHeight: number;
  /** Gap between cells on both axes (default 1). */
  gap?: number;
  /** Fixed column count; omit to derive it from the container width. */
  columns?: number;
  /** Controlled cursor index. Omit for uncontrolled (`defaultSelectedIndex`). */
  selectedIndex?: number;
  /** Initial cursor index when uncontrolled (default 0). */
  defaultSelectedIndex?: number;
  /** Cursor moved (arrow keys or click). */
  onSelect?: (index: number) => void;
  /** Item activated — Enter/Space or double-click. */
  onActivate?: (index: number) => void;
}

const DOUBLE_CLICK_MS = 400;

/**
 * A responsive, scrollable grid of arbitrary items with 2D keyboard navigation.
 *
 * - **Columns** flow automatically from the container width (`itemWidth` is the
 *   basis); pass `columns` to fix them.
 * - **Arrows** move the cursor (←→ within a row, ↑↓ across rows; Page/Home/End
 *   jump); the selected cell is scrolled into view.
 * - **Mouse** wheel and the scrollbar scroll the grid; clicking a cell selects
 *   it (double-click activates).
 *
 * Highlighting is the caller's job via `renderItem(item, { selected })`. The body
 * is a {@link ScrollableBox}, so it scales to large galleries by scrolling (not
 * virtualized — every item mounts).
 */
export function GalleryView<T>(props: GalleryViewProps<T>): ReactElement {
  const {
    items,
    renderItem,
    itemWidth,
    itemHeight,
    gap = 1,
    columns: columnsProp,
    selectedIndex,
    defaultSelectedIndex = 0,
    onSelect,
    onActivate,
    style,
    focusable,
    ...rest
  } = props;

  const boxRef = useRef<{
    getContentRect?: () => { width: number; height: number };
    scrollOffset?: Offset;
  } | null>(null);
  const [autoColumns, setAutoColumns] = useState(1);
  const [, setResizeTick] = useState(0);
  const [internalSel, setInternalSel] = useState(defaultSelectedIndex);
  const lastClick = useRef({ index: -1, at: 0 });
  const measureRetries = useRef(0);

  const sel = selectedIndex ?? internalSel;
  const columns = Math.max(1, columnsProp ?? autoColumns);
  const rowStride = itemHeight + gap;

  // Re-measure when the terminal resizes. The App debounces its own resize /
  // re-layout by 30ms, so wait past that to read the new width, not the stale
  // one. (Initial measurement is handled by the retry in the next effect.)
  useEffect(() => {
    const driver = App.instance?.driver;
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setResizeTick((t) => t + 1), 45);
    };
    driver?.on("resize", onResize);
    return () => {
      driver?.off("resize", onResize);
      clearTimeout(timer);
    };
  }, []);

  // Derive the column count from the laid-out content width (auto mode only).
  // Runs after every render: the box has no size on the first render(s), so when
  // the width isn't available yet, retry on a short timer until layout settles —
  // otherwise the grid would stay stuck at the 1-column fallback until a resize.
  useEffect(() => {
    if (columnsProp != null) return;
    const w = boxRef.current?.getContentRect?.().width ?? 0;
    if (w <= 0) {
      if (measureRetries.current < 30) {
        measureRetries.current += 1;
        const id = setTimeout(() => setResizeTick((t) => t + 1), 16);
        return () => clearTimeout(id);
      }
      return;
    }
    measureRetries.current = 0;
    const cols = Math.max(1, Math.floor((w + gap) / (itemWidth + gap)));
    setAutoColumns((prev) => (prev === cols ? prev : cols));
  });

  const select = (index: number, fire = true): number => {
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    if (selectedIndex == null) setInternalSel(clamped);
    if (fire) onSelect?.(clamped);
    return clamped;
  };

  // Keep the selected cell's row in view (the box scrolls freely for the wheel).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const viewH = box.getContentRect?.().height ?? 0;
    const rowTop = Math.floor(Math.max(0, sel) / columns) * rowStride;
    const cur = box.scrollOffset?.y ?? 0;
    let y = cur;
    if (rowTop < y) y = rowTop;
    else if (rowTop + itemHeight > y + viewH) y = rowTop + itemHeight - viewH;
    y = Math.max(0, y);
    if (y !== cur) {
      box.scrollOffset = new Offset(box.scrollOffset?.x ?? 0, y);
      App.instance?.queueRender("gallery:ensure-visible");
    }
  }, [sel, columns, rowStride, itemHeight]);

  const pageStep = (): number => {
    const viewH = boxRef.current?.getContentRect?.().height ?? rowStride;
    return Math.max(1, Math.floor(viewH / rowStride)) * columns;
  };

  const onKey = (ev: any): void => {
    const name = ev.name || ev.key;
    let next: number | null = null;
    switch (name) {
      case "left":
        next = sel - 1;
        break;
      case "right":
        next = sel + 1;
        break;
      case "up":
        next = sel - columns;
        break;
      case "down":
        next = sel + columns;
        break;
      case "pageup":
        next = sel - pageStep();
        break;
      case "pagedown":
        next = sel + pageStep();
        break;
      case "home":
        next = 0;
        break;
      case "end":
        next = items.length - 1;
        break;
      case "enter":
      case "space":
        if (items.length > 0) onActivate?.(sel);
        ev.handled = true;
        return;
      default:
        return;
    }
    select(next);
    ev.handled = true;
  };

  const clickCell = (index: number): void => {
    const now = Date.now();
    const isDouble =
      index === lastClick.current.index && now - lastClick.current.at < DOUBLE_CLICK_MS;
    lastClick.current = { index, at: now };
    select(index);
    if (isDouble) {
      lastClick.current = { index: -1, at: 0 };
      onActivate?.(index);
    }
  };

  // Chunk items into rows of `columns`; rows are direct column children of the
  // box so their stacked height is the scroll content.
  const rows: ReactNode[] = [];
  for (let r = 0; r < items.length; r += columns) {
    const cells: ReactNode[] = [];
    for (let c = 0; c < columns && r + c < items.length; c++) {
      const i = r + c;
      cells.push(
        <VBox
          key={i}
          onClick={() => clickCell(i)}
          style={{ width: itemWidth, height: itemHeight, margin: { right: gap } }}
        >
          {renderItem(items[i], { index: i, selected: i === sel })}
        </VBox>,
      );
    }
    rows.push(
      <HBox key={`row-${r}`} style={{ margin: { bottom: gap } }}>
        {cells}
      </HBox>,
    );
  }

  return (
    <VBox focusable={focusable ?? true} onKey={onKey} style={style} {...rest}>
      {createElement(
        "ztui-scrollable-box",
        {
          ref: boxRef,
          focusable: false,
          // flexGrow (not height:100%) so the box fills — and is bounded by — the
          // wrapper's height; a bounded viewport is what makes overflow scroll.
          style: { width: "100%", flexGrow: 1, overflowY: "auto", flexDirection: "column" },
        },
        rows,
      )}
    </VBox>
  );
}
GalleryView.displayName = "GalleryView";
