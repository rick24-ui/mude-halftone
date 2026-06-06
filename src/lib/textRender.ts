import { SourceData } from "./engine";

export type TextAlign = "left" | "center" | "right";

export interface TextOptions {
  text: string;
  fontFamily: string; // família CSS real (ex.: "Barlow Condensed")
  weight: number;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  align: TextAlign;
  uppercase: boolean;
}

const MAX_DIM = 1800;

/**
 * Renderiza o texto (preto sobre branco) num canvas e devolve o ImageData
 * como SourceData, pronto para o motor de pontilhismo.
 */
export async function renderTextToSource(o: TextOptions): Promise<SourceData> {
  const family = o.fontFamily;
  const size = Math.max(8, o.fontSize);
  const ls = o.letterSpacing;
  const lh = Math.max(0.6, o.lineHeight);
  const fontStr = `${o.weight} ${size}px ${family}, system-ui, sans-serif`;

  // garante a fonte carregada antes de medir/desenhar
  try {
    if (document.fonts) {
      await document.fonts.load(`${o.weight} ${size}px ${family}`);
      await document.fonts.ready;
    }
  } catch {
    /* segue com fallback */
  }

  const lines = (o.text.length ? o.text : " ")
    .split("\n")
    .map((l) => (o.uppercase ? l.toUpperCase() : l));

  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = fontStr;
  const hasLS = "letterSpacing" in measure;
  if (hasLS) (measure as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${ls}px`;

  let maxW = 1;
  for (const l of lines) {
    const w = measure.measureText(l).width + Math.max(0, l.length - 1) * (hasLS ? 0 : ls);
    if (w > maxW) maxW = w;
  }

  const pad = Math.round(size * 0.28) + 24;
  const lineH = size * lh;
  let W = Math.ceil(maxW) + pad * 2;
  let H = Math.ceil(lines.length * lineH) + pad * 2;

  let scale = 1;
  if (Math.max(W, H) > MAX_DIM) scale = MAX_DIM / Math.max(W, H);
  const cw = Math.max(2, Math.round(W * scale));
  const ch = Math.max(2, Math.round(H * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#000000";
  ctx.font = fontStr;
  if (hasLS) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${ls}px`;
  ctx.textBaseline = "middle";
  ctx.textAlign = o.align;

  const x = o.align === "left" ? pad : o.align === "right" ? W - pad : W / 2;
  let y = pad + lineH / 2;
  for (const l of lines) {
    ctx.fillText(l, x, y);
    y += lineH;
  }

  const data = ctx.getImageData(0, 0, cw, ch).data;
  return { data, width: cw, height: ch };
}
