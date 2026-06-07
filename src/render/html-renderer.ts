import type { ScreenBuffer } from "./buffer.ts";

export function renderBufferToHTML(buffer: ScreenBuffer): string {
  let html = `<div style="font-family: 'Courier New', Courier, monospace; font-size: 14px; line-height: 1.25; background-color: #1e1e2e; color: #cdd6f4; padding: 10px; display: inline-block; white-space: pre; border-radius: 4px;">`;

  for (let y = 0; y < buffer.height; y++) {
    let rowHtml = "";
    let currentStyle: any = null;
    let currentText = "";

    const flushRun = () => {
      if (currentText) {
        const cssStyles: string[] = [];
        let fg = currentStyle.color;
        let bg = currentStyle.background;

        if (currentStyle.reverse) {
          const temp = fg;
          fg = bg;
          bg = temp;
        }

        if (fg && fg !== "default") {
          cssStyles.push(`color: ${normalizeColorForCSS(fg)}`);
        }
        if (bg && bg !== "default") {
          cssStyles.push(`background-color: ${normalizeColorForCSS(bg)}`);
        }
        if (currentStyle.bold) {
          cssStyles.push("font-weight: bold");
        }
        if (currentStyle.italic) {
          cssStyles.push("font-style: italic");
        }
        if (currentStyle.underline) {
          cssStyles.push("text-decoration: underline");
        }

        const styleAttr = cssStyles.length > 0 ? ` style="${cssStyles.join("; ")}"` : "";
        let runHtml = `<span${styleAttr}>${currentText}</span>`;
        if (currentStyle.link) {
          runHtml = `<a href="${currentStyle.link}" target="_blank" style="text-decoration: underline; color: inherit;">${runHtml}</a>`;
        }
        rowHtml += runHtml;
        currentText = "";
      }
    };

    for (let x = 0; x < buffer.width; x++) {
      const cell = buffer.cells[y][x];
      if (cell.wideContinuation) continue;

      let char = cell.char;
      if (char === " ") {
        char = " ";
      } else {
        char = char
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      const cellStyle = cell.style;
      const styleKey = {
        color: cellStyle.color,
        background: cellStyle.background,
        bold: cellStyle.bold,
        italic: cellStyle.italic,
        underline: cellStyle.underline,
        reverse: cellStyle.reverse,
        link: cellStyle.link,
      };

      if (!currentStyle || !stylesEqual(currentStyle, styleKey)) {
        flushRun();
        currentStyle = styleKey;
      }
      currentText += char;
    }
    flushRun();
    html += `${rowHtml}\n`;
  }

  html += "</div>";
  return html;
}

function stylesEqual(s1: any, s2: any): boolean {
  return (
    s1.color === s2.color &&
    s1.background === s2.background &&
    s1.bold === s2.bold &&
    s1.italic === s2.italic &&
    s1.underline === s2.underline &&
    s1.reverse === s2.reverse &&
    s1.link === s2.link
  );
}

function normalizeColorForCSS(color: string): string {
  const norm = color.trim().toLowerCase();

  const standardANSI: Record<string, string> = {
    black: "#000000",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    gray: "#6272a4",
    grey: "#6272a4",
    "bright-black": "#6272a4",
    "bright-red": "#ff6e6e",
    "bright-green": "#69ff94",
    "bright-yellow": "#ffffa5",
    "bright-blue": "#d6acff",
    "bright-magenta": "#ff92df",
    "bright-cyan": "#a4ffff",
    "bright-white": "#ffffff",
  };

  if (standardANSI[norm]) {
    return standardANSI[norm];
  }
  return color;
}
