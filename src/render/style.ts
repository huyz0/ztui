/**
 * Underline rendering style. `single` is the classic flat line; the rest map to
 * the colon sub-parameter forms standardised by Kitty and supported by Ghostty,
 * iTerm2, WezTerm, and our web/canvas backend. `curly` (undercurl) is the
 * conventional cue for spelling/diagnostic squiggles.
 */
export type UnderlineStyle = "single" | "double" | "curly" | "dotted" | "dashed";

export interface StyleProps {
  color?: string; // e.g., "red", "#ff0000", "rgb(255, 0, 0)"
  background?: string; // e.g., "blue", "#0000ff"
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Underline shape. Implies `underline`; defaults to `single` when underlined. */
  underlineStyle?: UnderlineStyle;
  /** Colour of the underline, independent of the foreground (SGR 58). */
  underlineColor?: string;
  reverse?: boolean;
  dim?: boolean;
  strikethrough?: boolean;
  link?: string;
}

export class Style {
  public readonly color?: string;
  public readonly background?: string;
  public readonly bold: boolean;
  public readonly italic: boolean;
  public readonly underline: boolean;
  public readonly underlineStyle?: UnderlineStyle;
  public readonly underlineColor?: string;
  public readonly reverse: boolean;
  public readonly dim: boolean;
  public readonly strikethrough: boolean;
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

  public static readonly DEFAULT = new Style();

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
