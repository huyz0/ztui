import { renderMermaidASCII, renderMermaidSVG } from "beautiful-mermaid";
import { App } from "../../core/app.ts";
import { isThemeLight } from "../../core/theme.ts";
import type { DOMNode } from "../../dom/dom.ts";
import { TextNode } from "../../dom/text-node.ts";
import { Widget } from "../../dom/widget.ts";
import { Spacing } from "../../geometry/spacing.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Syntax } from "../../render/rich/syntax.ts";
import { stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { renderSvgSync } from "../../utils/sharp-sync.ts";
import { ButtonWidget } from "../controls/button.ts";

export class MermaidWidget extends Widget {
  public code = "";
  public showDiagram = true;

  private _mermaidTheme?: string = "theme";
  public override get theme(): string | undefined {
    return this._mermaidTheme;
  }
  public override set theme(val: string | undefined) {
    if (this._mermaidTheme !== val) {
      this._mermaidTheme = val;
      this.updateButtonState();
      this.cachedPixels = null;
    }
  }

  private lastWidth = 0;
  private lastHeight = 0;
  private lastBgHex = "";
  private lastCode = "";
  private cachedPngBase64 = "";
  private cachedPixels: Uint8Array | null = null;
  private cachedError: string | null = null;
  private toggleButton: ButtonWidget;

  constructor() {
    super("mermaid");
    this.focusable = true;
    this.defaultStyle = { margin: new Spacing(0, 0, 1, 0) };

    // Create child button widget for overlay toggle
    this.toggleButton = new ButtonWidget();
    this.toggleButton.id = "mermaid-toggle";
    this.toggleButton.style = {
      position: "absolute",
      right: 0,
      top: 0,
      width: 6,
      height: 1,
    };
    this.toggleButton.appendChild(new TextNode("[Code]"));
    this.toggleButton.onClick = () => {
      this.showDiagram = !this.showDiagram;
      this.updateButtonState();
      App.instance?.queueRender();
    };

    this.appendChild(this.toggleButton);
    this.updateButtonState();

    this.onKey = (ev) => {
      if (ev.key === "enter" || ev.key === " ") {
        this.showDiagram = !this.showDiagram;
        this.updateButtonState();
      }
    };
  }

  private updateButtonState(): void {
    this.toggleButton.children = [new TextNode(this.showDiagram ? "[Code]" : "[Diag]")];
    this.toggleButton.style.color = this.showDiagram ? "$warning" : "$primary";
    this.toggleButton.style.background = "$surface";
  }

  public override appendChild(child: DOMNode): void {
    if (child instanceof TextNode) {
      this.code = child.text;
    }
    super.appendChild(child);
  }

  public override measure(maxW: number, _maxH: number): void {
    if (this.showDiagram) {
      this.measuredWidth = 40 + this.borderSize.width + this.padding.width;
      this.measuredHeight = 12 + this.borderSize.height + this.padding.height;
    } else {
      const lines = this.code ? this.code.trim().split(/\r?\n/) : [];
      const lineCount = lines.length;
      let maxLineLen = 0;
      for (const line of lines) {
        maxLineLen = Math.max(maxLineLen, stringWidth(line));
      }
      this.measuredWidth =
        Math.max(40, maxLineLen + 6) + this.borderSize.width + this.padding.width;
      this.measuredHeight = lineCount + this.borderSize.height + this.padding.height;
    }

    // Measure children (which includes the absolute toggleButton)
    for (const child of this.children) {
      if (child instanceof Widget && child.visible) {
        child.measure(maxW, _maxH);
      }
    }
  }

  public override renderChildren(_buffer: ScreenBuffer): void {
    // No-op here so children aren't drawn first during super.render()
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;

    super.render(buffer);
    const client = this.getClientRect();
    if (client.width <= 0 || client.height <= 0) return;

    const bgHex = this.findResolvedBackground();
    const style = new Style({
      color: "default",
      background: bgHex,
    });

    if (!this.showDiagram) {
      const syntaxLines = Syntax.renderToLines(
        this.code.trim(),
        "mermaid",
        false,
        this.theme || "theme",
      );
      let currentY = client.y;
      for (const line of syntaxLines) {
        if (currentY >= client.bottom) break;
        const segments = line.toSegments(style);
        let currentX = client.x;
        for (const segment of segments) {
          if (currentX >= client.right) break;
          buffer.drawSegment(currentX, currentY, segment, client);
          currentX += stringWidth(segment.text);
        }
        currentY++;
      }

      // Render children on top
      super.renderChildren(buffer);
      return;
    }

    const app = App.instance;
    const capabilities = app?.driver.capabilities;
    const isGraphicsSupported = capabilities && capabilities.graphicsProtocol !== "none";

    if (!isGraphicsSupported) {
      try {
        const ascii = renderMermaidASCII(this.code.trim());
        const lines = ascii.split("\n");
        let currentY = client.y;
        for (const line of lines) {
          if (currentY >= client.bottom) break;
          for (let x = 0; x < Math.min(line.length, client.width); x++) {
            buffer.setCell(client.x + x, currentY, line[x], style);
          }
          currentY++;
        }
      } catch (err: any) {
        this.renderError(buffer, `Mermaid ASCII error: ${err.message}`, style);
      }

      // Render children on top
      super.renderChildren(buffer);
      return;
    }

    const cellSize = capabilities?.cellSize || { width: 8, height: 16 };
    const pixelWidth = client.width * cellSize.width;
    const pixelHeight = client.height * cellSize.height;

    const isCacheValid =
      this.cachedPixels !== null &&
      this.lastWidth === client.width &&
      this.lastHeight === client.height &&
      this.lastBgHex === bgHex &&
      this.lastCode === this.code;

    if (isCacheValid) {
      if (this.cachedError) {
        this.renderError(buffer, this.cachedError, style);
        return;
      }
    } else {
      try {
        const resolver = App.instance?.cssResolver;
        const activeTheme = resolver?.getActiveThemeForWidget(this);
        const isLight = activeTheme ? isThemeLight(activeTheme) : false;

        const mermaidBg =
          bgHex === "default" ? activeTheme?.colors?.background || "#121212" : bgHex;
        const mermaidFg = activeTheme?.colors?.foreground || "#ffffff";
        const mermaidLine =
          activeTheme?.colors?.panel ||
          activeTheme?.colors?.surface ||
          (isLight ? "#e2e8f0" : "#45475a");
        const mermaidAccent =
          activeTheme?.colors?.accent ||
          activeTheme?.colors?.primary ||
          (isLight ? "#2563eb" : "#89b4fa");
        const mermaidMuted =
          activeTheme?.colors?.comment ||
          activeTheme?.colors?.dimmed ||
          (isLight ? "#64748b" : "#7f849c");

        const mermaidTheme = {
          bg: mermaidBg,
          fg: mermaidFg,
          line: mermaidLine,
          accent: mermaidAccent,
          muted: mermaidMuted,
        };

        let svgContent = renderMermaidSVG(this.code.trim(), mermaidTheme);

        svgContent = svgContent.replaceAll("var(--_text)", mermaidFg);
        svgContent = svgContent.replaceAll("var(--_text-sec)", mermaidMuted);
        svgContent = svgContent.replaceAll("var(--_text-muted)", mermaidMuted);
        svgContent = svgContent.replaceAll("var(--_line)", mermaidLine);
        svgContent = svgContent.replaceAll("var(--_arrow)", mermaidAccent);
        svgContent = svgContent.replaceAll(
          "var(--_node-fill)",
          this.theme === "ansi_dark" ? "#212234" : "#f1f5f9",
        );
        svgContent = svgContent.replaceAll("var(--_node-stroke)", mermaidLine);
        svgContent = svgContent.replaceAll("var(--_group-fill)", mermaidBg);
        svgContent = svgContent.replaceAll("var(--_inner-stroke)", mermaidLine);
        svgContent = svgContent.replaceAll("var(--bg)", mermaidBg);
        svgContent = svgContent.replaceAll("var(--fg)", mermaidFg);

        const rendered = renderSvgSync({
          svg: svgContent,
          width: pixelWidth,
          height: pixelHeight,
          isIcon: false,
          bgHex: mermaidBg,
          fit: "contain",
        });

        this.cachedPixels = rendered.pixels;
        this.cachedPngBase64 = rendered.pngBase64;
        this.cachedError = null;
      } catch (err: any) {
        this.cachedError = `Mermaid Render Error: ${err.message}`;
        this.cachedPixels = null;
        this.renderError(buffer, this.cachedError, style);
        return;
      }

      this.lastWidth = client.width;
      this.lastHeight = client.height;
      this.lastBgHex = bgHex;
      this.lastCode = this.code;
    }

    if (this.cachedPixels) {
      buffer.cells[client.y][client.x] = {
        char: " ",
        style,
        wideContinuation: false,
        graphic: {
          type: "image",
          pixelBuffer: this.cachedPixels,
          pixelWidth,
          pixelHeight,
          cellWidth: client.width,
          cellHeight: client.height,
          pngBase64: this.cachedPngBase64,
          zIndex: this.computedStyle.zIndex,
        },
      };

      for (let dy = 0; dy < client.height; dy++) {
        for (let dx = 0; dx < client.width; dx++) {
          if (dy === 0 && dx === 0) continue;
          buffer.cells[client.y + dy][client.x + dx] = {
            char: "",
            style,
            wideContinuation: true,
          };
        }
      }
    }

    // Render children on top of the graphics cell buffer
    super.renderChildren(buffer);
  }

  private renderError(buffer: ScreenBuffer, msg: string, style: Style): void {
    const client = this.getClientRect();
    let charsWritten = 0;
    for (let dy = 0; dy < client.height; dy++) {
      for (let dx = 0; dx < client.width; dx++) {
        if (dy === 0 && charsWritten < msg.length) {
          const remainingWidth = client.width - dx;
          const chunk = msg.substring(charsWritten, charsWritten + remainingWidth);
          for (let i = 0; i < chunk.length; i++) {
            buffer.cells[client.y + dy][client.x + dx + i] = {
              char: chunk[i],
              style,
              wideContinuation: false,
            };
          }
          charsWritten += chunk.length;
          dx += chunk.length - 1;
          continue;
        }
        buffer.cells[client.y + dy][client.x + dx] = {
          char: " ",
          style,
          wideContinuation: false,
        };
      }
    }
  }
}
