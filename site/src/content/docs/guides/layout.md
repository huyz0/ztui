---
title: Layout
description: How ztui sizes and positions widgets — flow direction, fractional/percent/auto sizing, docking, alignment, and overflow.
---

Every widget gets a rectangular **region** (x, y, width, height in terminal
cells) computed once per frame from its style and its parent's. There are no
floats or text reflow — just nested boxes, sized and stacked. If you know CSS
flexbox, most of this will feel familiar; the vocabulary is deliberately a
subset.

## Flow direction

A container lays its children out in one direction. Pick it with `layout` (or
the React shorthand components `<VBox>` / `<HBox>`):

```tsx
import { VBox, HBox, Label } from "@huyz0/ztui/react";

<VBox>            {/* layout: "vertical" — top to bottom (the default) */}
  <Label>top</Label>
  <Label>bottom</Label>
</VBox>

<HBox>            {/* layout: "horizontal" — left to right */}
  <Label>left</Label>
  <Label>right</Label>
</HBox>
```

`<VBox>` and `<HBox>` are just `<View>` with `layout` preset; you can always set
`style={{ layout: "vertical" | "horizontal" }}` yourself. (`display: "flex"` with
`flexDirection: "row" | "column"` is accepted as an alias.)

## Sizing

`width` and `height` each accept four forms:

| Form        | Example            | Meaning                                            |
|-------------|--------------------|----------------------------------------------------|
| cells       | `width: 20`        | a fixed number of terminal cells                   |
| percent     | `width: "50%"`     | a fraction of the parent's content box             |
| fractional  | `height: "1fr"`    | a share of the *leftover* space after fixed/auto   |
| auto        | `width: "auto"`    | shrink to fit the content (the default)            |

Fractional units split whatever space remains along the flow axis. Two siblings
at `"1fr"` and `"2fr"` take one-third and two-thirds of the leftover:

```tsx
<HBox style={{ height: 10 }}>
  <VBox style={{ width: "1fr", background: "$surface" }} />
  <VBox style={{ width: "2fr", background: "$panel" }} />
</HBox>
```

`flexGrow: n` is equivalent to `n fr` on the flow axis. Clamp any of these with
`minWidth` / `maxWidth` / `minHeight` / `maxHeight`.

Auto-sized content is always clamped to the space the parent offers — a long
label is truncated to the available width rather than overflowing.

## Spacing and borders

`padding` insets the content from the box edge; `margin` adds space outside it.
Both take a number (all sides), a `{ top, right, bottom, left }` object, or a
`Spacing` instance:

```tsx
<VBox style={{ padding: 1, margin: { top: 1, bottom: 1 }, border: "rounded" }}>
  …
</VBox>
```

A `border` draws a one-cell frame on all four sides and shrinks the content box
accordingly. Color it with `borderColor`. The weight is the box-drawing style:
`"rounded"` (default), `"thin"`, `"solid"`, `"heavy"`, `"double"`, `"dashed"`,
`"bar"` (half-block accent `▌`), `"block"` (full-cell solid `█`), or `"none"`.

### Per-side borders

`borderTop`, `borderRight`, `borderBottom`, and `borderLeft` set a single edge
(same weight values) and override `border` for that side. A lone side is a clean
**corner-less bar** that only insets layout on that side — handy for a chat
bubble whose colored bar says who a message is from and how important it is, the
same way `Toast` uses color for info/warn/error:

```tsx
// user: a thick teal bar; assistant: a thin muted bar; alert: a solid red bar
<VBox style={{ borderLeft: "heavy", borderColor: "$primary", padding: { left: 1 } }}>…</VBox>
<VBox style={{ borderLeft: "thin",  borderColor: "$dimmed",  padding: { left: 1 } }}>…</VBox>
<VBox style={{ borderLeft: "bar",   borderColor: "$error",   padding: { left: 1 } }}>…</VBox>
```

Set a side to `"none"` to drop just that edge of an all-sides `border`.

## Alignment

Within a container, align children on the cross axis:

- `align: "left" | "center" | "right"` — horizontal placement.
- `verticalAlign: "top" | "middle" | "bottom"` — vertical placement.

```tsx
<VBox style={{ height: 10, align: "center", verticalAlign: "middle" }}>
  <Label>centered both ways</Label>
</VBox>
```

## Docking

`<Dock>` (or `layout: "dock"`) pins children to an edge and lets the rest fill
what's left — the classic header/footer/body shell. Each child opts into an edge
with `dock`; an undocked child fills the remaining center:

```tsx
import { Dock, Header, Footer, VBox } from "@huyz0/ztui/react";

<Dock>
  <Header>title bar</Header>                        {/* docks top */}
  <VBox style={{ dock: "left", width: 24 }}>nav</VBox>
  <VBox>main content fills the rest</VBox>
  <Footer>status bar</Footer>                        {/* docks bottom */}
</Dock>
```

`<Header>` and `<Footer>` are pre-docked to the top and bottom edges.

## Grid

`<Grid>` (`display: "grid"`) tiles its children into equal cells — a quick way
to lay out a uniform gallery without sizing each child. For non-uniform splits,
prefer nested `HBox`/`VBox` with `fr` units, which give you full control.

## Absolute positioning

Set `position: "absolute"` to take a widget out of flow and place it with
`left` / `top` / `right` / `bottom` relative to its parent's content box. Use
`zIndex` to control stacking order among siblings. For modals, dropdowns, and
floating panels, prefer the [overlay components](/ztui/widgets/overlays/) — they
portal to a screen-level layer so they're never clipped by a parent.

## Overflow

A container **clips its children to its content box by default**, so an oversized
or mispositioned child can never paint over its own border or a sibling. Opt out
per axis with `overflow`:

- `overflowX` / `overflowY: "visible"` — let content spill (rarely needed).
- `"hidden"` — clip (the default behavior).
- `"scroll"` / `"auto"` — clip *and* make the box scrollable. `<ScrollableBox>`
  presets this; scrolling responds to the wheel and PageUp/PageDown.

## How it fits together

Each frame the engine walks the tree twice: a **measure** pass computes each
widget's intrinsic size bottom-up (so `auto` and `fr` know their content), then a
**layout** pass assigns regions top-down. You never call either directly — set
styles and let the engine resolve them. See [Architecture](/ztui/guides/architecture/)
for where layout sits in the full pipeline.
