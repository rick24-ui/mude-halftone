// ─── Suíte de Exportação Profissional de ASCII & Braille — UPGM Lab ─────────

import { AsciiRenderResult } from "./ascii";

export interface ExportCanvasOptions {
  scale?: number; // 1, 2, 4
  fontSize?: number;
  lineHeight?: number;
  bgColor?: string;
  fontFamily?: string;
  padding?: number;
}

// ─── Renderizador Canvas de Alta Resolução (PNG 1-4x) ───────────────────────
export function renderAsciiToCanvas(
  result: AsciiRenderResult,
  options: ExportCanvasOptions = {}
): HTMLCanvasElement {
  const scale = options.scale ?? 1;
  const baseFontSize = options.fontSize ?? 10;
  const actualFontSize = baseFontSize * scale;
  const lineHeightRatio = options.lineHeight ?? 1.0;
  const padding = (options.padding ?? 16) * scale;
  const bgColor = options.bgColor ?? "#0d0d0f";
  const fontFamily = options.fontFamily ?? "'JetBrains Mono', 'SF Mono', Menlo, monospace";

  const rows = result.grid.length;
  const cols = rows > 0 ? result.grid[0].length : 0;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Medição precisa do caractere monospace
  ctx.font = `${actualFontSize}px ${fontFamily}`;
  const charWidth = ctx.measureText("M").width;
  const charHeight = actualFontSize * lineHeightRatio;

  canvas.width = Math.ceil(cols * charWidth + padding * 2);
  canvas.height = Math.ceil(rows * charHeight + padding * 2);

  // Fundo
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = `${actualFontSize}px ${fontFamily}`;
  ctx.textBaseline = "top";

  // Desenho dos caracteres
  for (let y = 0; y < rows; y++) {
    const row = result.grid[y];
    for (let x = 0; x < cols; x++) {
      const item = row[x];
      if (!item || item.char === " ") continue;

      ctx.fillStyle = `rgb(${item.r},${item.g},${item.b})`;
      ctx.fillText(item.char, padding + x * charWidth, padding + y * charHeight);
    }
  }

  return canvas;
}

// ─── Download de Arquivo Auxiliar ───────────────────────────────────────────
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Exportar PNG ───────────────────────────────────────────────────────────
export async function downloadPng(
  result: AsciiRenderResult,
  scale: 1 | 2 | 4 = 1,
  options: ExportCanvasOptions = {}
): Promise<void> {
  const canvas = renderAsciiToCanvas(result, { ...options, scale });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Falha ao gerar PNG"));
        return;
      }
      triggerDownload(blob, `upgm-ascii-${result.cols}x${result.rows}-${scale}x.png`);
      resolve();
    }, "image/png");
  });
}

// ─── Copiar PNG para Área de Transferência ──────────────────────────────────
export async function copyPngToClipboard(
  result: AsciiRenderResult,
  options: ExportCanvasOptions = {}
): Promise<boolean> {
  try {
    const canvas = renderAsciiToCanvas(result, { ...options, scale: 2 });
    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          resolve(false);
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          resolve(true);
        } catch {
          // Fallback: faz download se clipboard item image/png não for suportado
          triggerDownload(blob, "upgm-ascii-clipboard.png");
          resolve(true);
        }
      }, "image/png");
    });
  } catch {
    return false;
  }
}

// ─── Exportar SVG Vetorial ──────────────────────────────────────────────────
export function generateSvg(
  result: AsciiRenderResult,
  options: ExportCanvasOptions = {}
): string {
  const fontSize = options.fontSize ?? 10;
  const lineHeight = fontSize * (options.lineHeight ?? 1.0);
  const charWidth = fontSize * 0.6; // métrica padrão monospace
  const padding = options.padding ?? 16;
  const bgColor = options.bgColor ?? "#0d0d0f";

  const rows = result.grid.length;
  const cols = rows > 0 ? result.grid[0].length : 0;
  const width = Math.ceil(cols * charWidth + padding * 2);
  const height = Math.ceil(rows * lineHeight + padding * 2);

  const texts: string[] = [];

  for (let y = 0; y < rows; y++) {
    const row = result.grid[y];
    const posY = padding + y * lineHeight + fontSize * 0.85;

    for (let x = 0; x < cols; x++) {
      const item = row[x];
      if (!item || item.char === " ") continue;

      const posX = padding + x * charWidth;
      const safeChar =
        item.char === "<"
          ? "&lt;"
          : item.char === ">"
          ? "&gt;"
          : item.char === "&"
          ? "&amp;"
          : item.char;

      texts.push(
        `<text x="${posX.toFixed(1)}" y="${posY.toFixed(1)}" fill="rgb(${item.r},${item.g},${item.b})">${safeChar}</text>`
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <style>
    text { font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace; font-size: ${fontSize}px; }
  </style>
  <rect width="100%" height="100%" fill="${bgColor}"/>
  ${texts.join("\n  ")}
</svg>`;
}

export function downloadSvg(result: AsciiRenderResult, options: ExportCanvasOptions = {}): void {
  const svg = generateSvg(result, options);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(blob, `upgm-ascii-${result.cols}x${result.rows}.svg`);
}

// ─── Exportar TXT Puro ──────────────────────────────────────────────────────
export function downloadTxt(result: AsciiRenderResult): void {
  const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `upgm-ascii-${result.cols}x${result.rows}.txt`);
}

// ─── Copiar Texto Puro ──────────────────────────────────────────────────────
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  }
}

// ─── Copiar Markdown para Discord ───────────────────────────────────────────
export async function copyDiscord(text: string): Promise<boolean> {
  const wrapped = "```text\n" + text + "\n```";
  return copyText(wrapped);
}

// ─── Copiar Social Safe (Full-width Unicode para Twitch / YouTube) ───────────
export function toFullWidthUnicode(text: string): string {
  let res = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (char === " ") {
      res += "　"; // Espaço ideográfico largo
    } else if (char === "\n") {
      res += "\n";
    } else if (code >= 33 && code <= 126) {
      res += String.fromCharCode(code + 65248);
    } else {
      res += char;
    }
  }
  return res;
}

export async function copySocialSafe(text: string): Promise<boolean> {
  const fullWidth = toFullWidthUnicode(text);
  return copyText(fullWidth);
}

// ─── Copiar HTML com Estilos Inline ─────────────────────────────────────────
export async function copyHtmlFormatted(
  result: AsciiRenderResult,
  bgColor = "#0d0d0f"
): Promise<boolean> {
  const htmlDoc = `<pre style="font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.0;white-space:pre;background:${bgColor};padding:16px;border-radius:8px;display:inline-block;">${result.html}</pre>`;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([result.text], { type: "text/plain" }),
        "text/html": new Blob([htmlDoc], { type: "text/html" }),
      }),
    ]);
    return true;
  } catch {
    return copyText(result.text);
  }
}

// ─── Exportar Dados em JSON Estruturado ─────────────────────────────────────
export function downloadJson(result: AsciiRenderResult): void {
  const data = {
    generator: "UPGM — LAB ASCII Studio",
    dimensions: { cols: result.cols, rows: result.rows },
    timeMs: result.timeMs,
    grid: result.grid.map((row, y) =>
      row.map((cell, x) => ({
        x,
        y,
        char: cell.char,
        color: `rgb(${cell.r},${cell.g},${cell.b})`,
      }))
    ),
  };
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  triggerDownload(blob, `upgm-ascii-${result.cols}x${result.rows}.json`);
}
