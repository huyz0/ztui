---
title: Animation & graphics
description: The clock-driven tween engine, easing, focus/attention motion, and how images and icons render across terminal graphics protocols.
---

Two visual systems sit underneath the widgets: a **tween engine** that drives all
motion from the wall clock, and a **graphics layer** that renders images and
icons through whatever the terminal supports. Both degrade gracefully — motion can
be switched off, and graphics fall back to Unicode.

## Animation

Animation in ztui is **clock-driven, not timer-driven**. A tween maps the current
time through an easing curve, so reading its value always returns the right number
for "now" — frame jitter never accumulates drift, and the value lands exactly on
target at the end of the duration.

### In a widget

Every `Widget` owns named tweens. Call `animate(key, target, opts)` from `render`;
while the value is still moving it books the next frame on the widget, so the
motion continues on its own:

```ts
override render(buffer: ScreenBuffer): void {
  const width = this.animate("bar", this.value, { duration: 200, easing: "out-cubic" });
  // …paint using `width`
}
```

`animateColor(key, target, opts)` is the color counterpart (returns an `rgb(…)`
string). Because the engine lives on the widget — not in a framework hook — any
binding (React, Solid, none) gets smooth motion from the same call.

### In React

`useAnimatedValue` / `useAnimatedColor` tween toward a target whenever it changes
and return the current value to render:

```tsx
import { useAnimatedValue } from "@huyz0/ztui/react";

const w = useAnimatedValue(open ? 40 : 0, { duration: 200, easing: "out-cubic" });
<VBox style={{ width: w }} />;
```

### Easing

`opts.easing` is a curve name (`Easing`) — `"out-cubic"` (the default),
`"in-out-quad"`, `"out-back"`, `"out-bounce"`, and friends; the full set is the
`EASINGS` map. Pass `duration: 0` to snap with no motion.

### Turning motion off

A global `motion` toggle silences all ambient animation to a static look —
honored automatically under the test runner and reduced-motion / `NO_MOTION`
environments, and settable at runtime for an app preference:

```ts
import { motion } from "@huyz0/ztui";
motion.set(false); // tweens snap to their target; breathing accents go static
```

### Focus & attention motion

Two built-in "breathing" accents pull the eye without being noisy, and you get
them for free on built-in widgets:

- **Focus** — a focused control gently pulses its border with the `$focus` theme
  accent (barely-there; `FOCUS_BREATH`). This is *the* signal that a widget holds
  keyboard focus (see [Focus & keys](/ztui/guides/input/)).
- **Attention** — the [`<Attention>`](/ztui/widgets/) panel breathes its border
  with the louder `$attention` accent (`ATTENTION_BREATH`) to flag something that
  needs the user. Set `active={false}` to hold it steady.

Both resolve their color per frame from the theme and collapse to a static accent
when `motion` is off. In a custom widget you can do the same by reading `$focus` /
`$attention` (they resolve to the live breathing color) or by driving your own
`animate(...)`.

## Graphics

Widgets describe *what* to draw — an image, an SVG, an icon — and the **driver**
encodes it for the active terminal. Widgets never emit escape codes themselves, so
the same tree renders correctly everywhere.

### Protocols & fallback

The active backend reports a `graphicsProtocol` capability, probed at startup:

| Protocol            | How images render                                  |
|---------------------|----------------------------------------------------|
| `kitty` / `iterm2` / `sixel` | native inline pixels (the terminal's protocol) |
| `web`               | drawn natively on the browser `<canvas>` (vector SVG stays crisp) |
| `none`              | Unicode half-block art — works on any terminal     |

The right one is chosen automatically from the probe, so an image "just works" and
simply looks better on a capable terminal. You can force `ansi` (half-block) on the
`<Image>` / `<SvgImage>` widgets when you want consistency over fidelity.

### Images and icons

- **[`<Image>`](/ztui/widgets/image/)** — raster images from a path or bytes.
- **[`<SvgImage>`](/ztui/widgets/image/)** — inline SVG; `$theme` tokens in the
  markup are resolved before drawing, and on the canvas it's rasterized crisply at
  the device pixel ratio.
- **Icons** — [`<HeroIcon>`](/ztui/widgets/heroicon/) and
  [`<FileIcon>`](/ztui/widgets/file-icon/) draw as vectors via the terminal Glyph
  Protocol (or the graphics protocol / canvas), tinted to a theme color, and fall
  back to a Unicode/emoji glyph where neither is available.

This is the same "describe, don't encode" rule custom widgets follow — paint cells
(and, for graphics, attach vector/raster source), and let the backend match the
device. See [Architecture](/ztui/guides/architecture/) and
[Extending ztui](/ztui/guides/extending/).
