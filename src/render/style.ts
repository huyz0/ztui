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
