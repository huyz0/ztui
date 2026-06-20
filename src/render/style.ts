/**
 * Underline rendering style. `single` is the classic flat line; the rest map to
 * the colon sub-parameter forms standardised by Kitty and supported by Ghostty,
 * iTerm2, WezTerm, and our web/canvas backend. `curly` (undercurl) is the
 * conventional cue for spelling/diagnostic squiggles.
 */
export type UnderlineStyle = "single" | "double" | "curly" | "dotted" | "dashed";

/** The attributes used to build a {@link Style} (concrete colors — resolve `$tokens` first). */
export interface StyleProps {
  /** Foreground color, e.g. `"red"`, `"#ff0000"`, `"rgb(255,0,0)"`. */
  color?: string;
  /** Background color. */
  background?: string;
  /** Bold/bright. */
  bold?: boolean;
  /** Italic. */
  italic?: boolean;
  /** Underline. */
  underline?: boolean;
  /** Underline shape. Implies `underline`; defaults to `single` when underlined. */
  underlineStyle?: UnderlineStyle;
  /** Colour of the underline, independent of the foreground (SGR 58). */
  underlineColor?: string;
  /** Swap foreground and background. */
  reverse?: boolean;
  /** Reduced intensity. */
  dim?: boolean;
  /** Struck-through. */
  strikethrough?: boolean;
  /** Hyperlink target (OSC 8). */
  link?: string;
}

/** An immutable per-cell visual style. Build one and pass it to {@link ScreenBuffer.setCell}. */
export class Style {
  /** Foreground color. */
  public readonly color?: string;
  /** Background color. */
  public readonly background?: string;
  /** Bold/bright. */
  public readonly bold: boolean;
  /** Italic. */
  public readonly italic: boolean;
  /** Underlined. */
  public readonly underline: boolean;
  /** Underline shape. */
  public readonly underlineStyle?: UnderlineStyle;
  /** Underline color (independent of foreground). */
  public readonly underlineColor?: string;
  /** Foreground/background swapped. */
  public readonly reverse: boolean;
  /** Reduced intensity. */
  public readonly dim: boolean;
  /** Struck-through. */
  public readonly strikethrough: boolean;
  /** Hyperlink target. */
  public readonly link?: string;

  constructor(props: StyleProps = {}) {
    this.color = props.color;
    this.background = props.background;
    this.bold = !!props.bold;
    this.italic = !!props.italic;
    this.underline = !!props.underline || props.underlineStyle !== undefined;
    this.underlineStyle = props.underlineStyle;
    this.underlineColor = props.underlineColor;
    this.reverse = !!props.reverse;
    this.dim = !!props.dim;
    this.strikethrough = !!props.strikethrough;
    this.link = props.link;
  }

  /** The empty style (terminal defaults). */
  public static readonly DEFAULT = new Style();

  /** True if every attribute matches. */
  public equals(other: Style): boolean {
    // Identity fast path: callers that reuse a cached Style instance (e.g. an
    // animated panel painting the same colour) hit this and skip the field-by-
    // field compare — the dominant cost in the render diff for such frames.
    if (this === other) return true;
    return (
      this.color === other.color &&
      this.background === other.background &&
      this.bold === other.bold &&
      this.italic === other.italic &&
      this.underline === other.underline &&
      this.underlineStyle === other.underlineStyle &&
      this.underlineColor === other.underlineColor &&
      this.reverse === other.reverse &&
      this.dim === other.dim &&
      this.strikethrough === other.strikethrough &&
      this.link === other.link
    );
  }

  /**
   * Whether this style's resolved fields equal `props` *as the constructor would
   * normalise them* — booleans coerced (`!!`), `underline` implied by
   * `underlineStyle`. Lets {@link StyleCache} match a request against a cached
   * instance without allocating a throwaway `Style` to compare.
   */
  public matchesProps(props: StyleProps): boolean {
    return (
      this.color === props.color &&
      this.background === props.background &&
      this.bold === !!props.bold &&
      this.italic === !!props.italic &&
      this.underline === (!!props.underline || props.underlineStyle !== undefined) &&
      this.underlineStyle === props.underlineStyle &&
      this.underlineColor === props.underlineColor &&
      this.reverse === !!props.reverse &&
      this.dim === !!props.dim &&
      this.strikethrough === !!props.strikethrough &&
      this.link === props.link
    );
  }

  /** Return a new Style with `other`'s defined attributes layered over this one. */
  public merge(other: StyleProps | Style): Style {
    return new Style({
      color: other.color !== undefined ? other.color : this.color,
      background: other.background !== undefined ? other.background : this.background,
      bold: other.bold !== undefined ? other.bold : this.bold,
      italic: other.italic !== undefined ? other.italic : this.italic,
      underline: other.underline !== undefined ? other.underline : this.underline,
      underlineStyle:
        other.underlineStyle !== undefined ? other.underlineStyle : this.underlineStyle,
      underlineColor:
        other.underlineColor !== undefined ? other.underlineColor : this.underlineColor,
      reverse: other.reverse !== undefined ? other.reverse : this.reverse,
      dim: other.dim !== undefined ? other.dim : this.dim,
      strikethrough: other.strikethrough !== undefined ? other.strikethrough : this.strikethrough,
      link: other.link !== undefined ? other.link : this.link,
    });
  }
}

/**
 * A small, bounded {@link Style} memo for a producer that builds its paint styles
 * fresh every frame (a widget's fill/border/text styles). Backs
 * `Widget.cachedStyle`, the general mechanism — see that method for the rationale.
 *
 * The render diff has an identity fast path (`a === b`) and `ScreenBuffer.copyTo`
 * carries a cell's Style *reference* into the prev-frame buffer — so the diff
 * only short-circuits when the *same* Style instance reappears in the same cell
 * next frame. A producer that does `new Style({…})` each frame defeats that:
 * structurally-identical styles compare unequal by reference, forcing a full
 * field compare on every cell, every frame (the `table` demo sat at ~8% identity
 * for exactly this reason).
 *
 * It caches the last few *distinct* styles and returns the cached instance when
 * the requested fields match one (a `Table` cycles through a small fixed set —
 * normal, selected, header-bold, group-bold — so a handful of slots covers a
 * whole frame). Matching is a field comparison ({@link Style.matchesProps}) with
 * **no allocation on a hit** and **no per-call string key** — the string-keyed
 * global intern tried earlier was break-even (its key cost matched the diff it
 * saved) and a keyless *global* intern measurably regressed syntax-heavy text
 * (hashing hundreds of distinct styles per frame in the hot render phase). The
 * bound is what makes it safe to apply everywhere: a high-variety producer simply
 * overflows and falls back to fresh styles — same as before, never worse.
 */
export class StyleCache {
  private slots: Style[] = [];

  /** @param max Distinct styles to retain (oldest evicted past this; default 8). */
  constructor(private readonly max = 8) {}

  /** The cached Style matching `props`, or a freshly built one cached for reuse. */
  public get(props: StyleProps): Style {
    const slots = this.slots;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].matchesProps(props)) return slots[i];
    }
    const style = new Style(props);
    slots.push(style);
    if (slots.length > this.max) slots.shift();
    return style;
  }
}
