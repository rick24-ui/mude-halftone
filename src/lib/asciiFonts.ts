// ─── Motor de Tipografia FIGlet (ASCII Text) — UPGM Lab ─────────────────────

import figlet from "figlet";

// Importação direta de fontes populares para renderização instantânea offline
import standardFont from "figlet/importable-fonts/Standard.js";
import slantFont from "figlet/importable-fonts/Slant.js";
import doomFont from "figlet/importable-fonts/Doom.js";
import ansiShadowFont from "figlet/importable-fonts/ANSI Shadow.js";
import bigFont from "figlet/importable-fonts/Big.js";
import smallFont from "figlet/importable-fonts/Small.js";
import bannerFont from "figlet/importable-fonts/Banner.js";
import isometric1Font from "figlet/importable-fonts/Isometric1.js";
import digitalFont from "figlet/importable-fonts/Digital.js";
import cybermediumFont from "figlet/importable-fonts/Cybermedium.js";
import blockFont from "figlet/importable-fonts/Block.js";
import electronicFont from "figlet/importable-fonts/Electronic.js";

// Carregamento de fontes no registro interno do figlet
const REGISTERED_FONTS: Record<string, string> = {
  Standard: (standardFont as unknown as { default: string }).default || (standardFont as unknown as string),
  Slant: (slantFont as unknown as { default: string }).default || (slantFont as unknown as string),
  Doom: (doomFont as unknown as { default: string }).default || (doomFont as unknown as string),
  "ANSI Shadow": (ansiShadowFont as unknown as { default: string }).default || (ansiShadowFont as unknown as string),
  Big: (bigFont as unknown as { default: string }).default || (bigFont as unknown as string),
  Small: (smallFont as unknown as { default: string }).default || (smallFont as unknown as string),
  Banner: (bannerFont as unknown as { default: string }).default || (bannerFont as unknown as string),
  Isometric: (isometric1Font as unknown as { default: string }).default || (isometric1Font as unknown as string),
  Digital: (digitalFont as unknown as { default: string }).default || (digitalFont as unknown as string),
  Cybermedium: (cybermediumFont as unknown as { default: string }).default || (cybermediumFont as unknown as string),
  Block: (blockFont as unknown as { default: string }).default || (blockFont as unknown as string),
  Electronic: (electronicFont as unknown as { default: string }).default || (electronicFont as unknown as string),
};

// Pré-registra as fontes
for (const [name, data] of Object.entries(REGISTERED_FONTS)) {
  try {
    figlet.parseFont(name as figlet.Fonts, data);
  } catch {
    // já carregada ou erro silencioso
  }
}

export const AVAILABLE_FIGLET_FONTS = Object.keys(REGISTERED_FONTS);

export interface FigletRenderOptions {
  font?: string;
  width?: number;
  horizontalLayout?: "default" | "full" | "fitted" | "controlled smushing" | "universal smushing";
  verticalLayout?: "default" | "full" | "fitted" | "controlled smushing" | "universal smushing";
  whitespaceBreak?: boolean;
}

export function renderFiglet(text: string, options: FigletRenderOptions = {}): string {
  if (!text || !text.trim()) return "";
  const fontName = (options.font && REGISTERED_FONTS[options.font]) ? options.font : "Standard";

  try {
    const rendered = figlet.textSync(text, {
      font: fontName as figlet.Fonts,
      width: options.width ?? 120,
      horizontalLayout: options.horizontalLayout ?? "default",
      verticalLayout: options.verticalLayout ?? "default",
      whitespaceBreak: options.whitespaceBreak ?? true,
    });

    // Remove linhas vazias no final
    const lines = rendered.split("\n").map((l) => l.trimEnd());
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines.join("\n");
  } catch {
    return text;
  }
}

// ─── Gradiente Linear para Texto ASCII ──────────────────────────────────────

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RgbColor {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function applyColorGradient(
  asciiText: string,
  colorFrom: string,
  colorTo: string,
  direction: "horizontal" | "vertical" | "diagonal" = "horizontal"
): string {
  const c1 = hexToRgb(colorFrom);
  const c2 = hexToRgb(colorTo);
  const lines = asciiText.split("\n");
  const totalRows = lines.length;
  const totalCols = lines.reduce((max, l) => Math.max(max, l.length), 0);

  if (totalRows === 0 || totalCols === 0) return asciiText;

  return lines
    .map((line, r) => {
      return [...line]
        .map((char, c) => {
          if (char === " ") return " ";
          let factor = 0;
          if (direction === "horizontal") {
            factor = totalCols > 1 ? c / (totalCols - 1) : 0;
          } else if (direction === "vertical") {
            factor = totalRows > 1 ? r / (totalRows - 1) : 0;
          } else {
            factor =
              totalCols + totalRows > 2
                ? (c + r) / (totalCols + totalRows - 2)
                : 0;
          }

          const red = Math.round(c1.r + (c2.r - c1.r) * factor);
          const green = Math.round(c1.g + (c2.g - c1.g) * factor);
          const blue = Math.round(c1.b + (c2.b - c1.b) * factor);

          const safeChar =
            char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === "&" ? "&amp;" : char;

          return `<span style="color:rgb(${red},${green},${blue})">${safeChar}</span>`;
        })
        .join("");
    })
    .join("\n");
}
