// Engine de molduras (borders) — centro transparente, vetorial (canvas + SVG).

export type BorderStyle = "frame" | "ticker" | "corners" | "wave";

export interface BorderParams {
  width: number;
  height: number;
  style: BorderStyle;
  accent: string;
  ink: string;
  dotColor: string;
  thickness: number; // largura da faixa da borda
  dotGap: number;
  dotSize: number;
  rings: number;
  speed: number; // velocidade da animação
  title: string;
  handle: string;
  showTitle: boolean;
}

export const ACCENT = "#E8143C";
export const INK = "#0D0D0D";

const FONT_SANS = "ui-sans-serif, system-ui, Arial, sans-serif";
const FONT_MONO = "ui-monospace, Menlo, monospace";

export const DEFAULT_BORDER: BorderParams = {
  width: 1080,
  height: 1920,
  style: "frame",
  accent: ACCENT,
  ink: INK,
  dotColor: ACCENT,
  thickness: 150,
  dotGap: 30,
  dotSize: 9,
  rings: 4,
  speed: 1,
  title: "MUDE",
  handle: "@mude.app",
  showTitle: true,
};

export interface BorderPreset {
  id: string;
  name: string;
  params: Partial<BorderParams>;
}

export const BORDER_PRESETS: BorderPreset[] = [
  { id: "frame", name: "Halftone Frame", params: { style: "frame", dotColor: ACCENT, dotGap: 30, dotSize: 9, rings: 4, thickness: 150 } },
  { id: "ticker", name: "Marquee Bars", params: { style: "ticker", accent: ACCENT, thickness: 150 } },
  { id: "corners", name: "Corner Brackets", params: { style: "corners", accent: ACCENT, thickness: 150 } },
  { id: "wave", name: "Flow Edge", params: { style: "wave", dotColor: ACCENT, dotGap: 26, dotSize: 10, thickness: 190 } },
];

// Presets de dimensão das redes sociais
export interface FormatPreset {
  id: string;
  name: string;
  width: number;
  height: number;
}

export const FORMAT_PRESETS: FormatPreset[] = [
  { id: "story", name: "Stories / Reels 9:16", width: 1080, height: 1920 },
  { id: "square", name: "Feed Quadrado 1:1", width: 1080, height: 1080 },
  { id: "portrait", name: "Feed Retrato 4:5", width: 1080, height: 1350 },
  { id: "landscape", name: "Paisagem / YT 16:9", width: 1920, height: 1080 },
  { id: "pin", name: "Pinterest 2:3", width: 1000, height: 1500 },
  { id: "wide", name: "Capa / Banner 3:1", width: 1500, height: 500 },
];

// ------------------------------------------------------------------
// Primitivas (renderizáveis em canvas e SVG)
// ------------------------------------------------------------------

type TextAnchor = "start" | "middle" | "end";
type Prim =
  | { t: "circle"; x: number; y: number; r: number; fill: string }
  | { t: "rect"; x: number; y: number; w: number; h: number; fill: string; rx?: number }
  | { t: "rectStroke"; x: number; y: number; w: number; h: number; rx: number; stroke: string; sw: number }
  | { t: "path"; d: string; stroke: string; sw: number; cap: "butt" | "round" | "square" }
  | { t: "text"; x: number; y: number; s: string; size: number; weight: number; fill: string; family: string; anchor: TextAnchor; middle: boolean }
  | { t: "clip"; x: number; y: number; w: number; h: number; children: Prim[] };

function ringPoints(x0: number, y0: number, x1: number, y1: number, gap: number) {
  const pts: { x: number; y: number }[] = [];
  for (let x = x0; x < x1; x += gap) pts.push({ x, y: y0 });
  for (let y = y0; y < y1; y += gap) pts.push({ x: x1, y });
  for (let x = x1; x > x0; x -= gap) pts.push({ x, y: y1 });
  for (let y = y1; y > y0; y -= gap) pts.push({ x: x0, y });
  return pts;
}

// canvas só para medir largura de texto
let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(s: string, weight: number, size: number, family: string): number {
  if (typeof document === "undefined") return s.length * size * 0.5;
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return s.length * size * 0.5;
  measureCtx.font = `${weight} ${size}px ${family}`;
  return measureCtx.measureText(s).width;
}

// ------------------------------------------------------------------
// Construção das primitivas por estilo
// ------------------------------------------------------------------

export function buildBorderPrimitives(p: BorderParams, t: number): Prim[] {
  const out: Prim[] = [];
  if (p.style === "frame") frameP(out, p, t);
  else if (p.style === "ticker") tickerP(out, p, t);
  else if (p.style === "corners") cornersP(out, p, t);
  else waveP(out, p, t);

  if (p.showTitle && p.style !== "ticker" && p.style !== "corners") titlePillP(out, p);
  return out;
}

function titlePillP(out: Prim[], p: BorderParams) {
  const { width: W, height: H } = p;
  const label = `${p.title}  ·  ${p.handle}`;
  const size = 40;
  const tw = measureText(label, 700, size, FONT_SANS);
  const padX = 44;
  const pw = tw + padX * 2;
  const ph = 76;
  const y = H - 96;
  out.push({ t: "rect", x: W / 2 - pw / 2, y: y - ph / 2, w: pw, h: ph, rx: ph / 2, fill: p.accent });
  out.push({ t: "text", x: W / 2, y: y + 2, s: label, size, weight: 700, fill: "#ffffff", family: FONT_SANS, anchor: "middle", middle: true });
}

function frameP(out: Prim[], p: BorderParams, t: number) {
  const { width: W, height: H } = p;
  const margin = 36;
  out.push({ t: "rectStroke", x: margin, y: margin, w: W - margin * 2, h: H - margin * 2, rx: 28, stroke: p.accent, sw: 4 });
  for (let k = 0; k < p.rings; k++) {
    const inset = margin + 34 + k * p.dotGap;
    const pts = ringPoints(inset, inset, W - inset, H - inset, p.dotGap);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const phase = i / n;
      const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2 * 6 - t * p.speed * 2.2 + k * 0.7);
      const r = p.dotSize * (1 - k * 0.13) * (0.3 + 0.7 * pulse);
      if (r > 0.2) out.push({ t: "circle", x: pts[i].x, y: pts[i].y, r, fill: p.dotColor });
    }
  }
}

function tickerP(out: Prim[], p: BorderParams, t: number) {
  const { width: W, height: H } = p;
  const topH = p.thickness;
  const botH = p.thickness + 60;

  const marquee = (y: number, h: number, text: string, dir: number) => {
    out.push({ t: "rect", x: 0, y, w: W, h, fill: p.accent });
    const size = 56;
    const unit = `${text}    ●    `;
    const uw = measureText(unit, 800, size, FONT_SANS) || 1;
    const offset = ((t * p.speed * 90 * dir) % uw + uw) % uw;
    const children: Prim[] = [];
    for (let x = -uw - offset; x < W + uw; x += uw) {
      children.push({ t: "text", x, y: y + h / 2, s: unit, size, weight: 800, fill: p.ink, family: FONT_SANS, anchor: "start", middle: true });
    }
    out.push({ t: "clip", x: 0, y, w: W, h, children });
  };

  marquee(0, topH, `${p.title} • PROFESSORES`, 1);
  marquee(H - botH, botH, `${p.handle} • REPOSTE`, -1);

  const innerTop = topH + 20;
  const innerBot = H - botH - 20;
  for (let y = innerTop; y < innerBot; y += p.dotGap) {
    const pulse = 0.5 + 0.5 * Math.sin(y * 0.02 - t * p.speed * 2);
    const r = p.dotSize * (0.4 + 0.6 * pulse);
    if (r > 0.2) {
      out.push({ t: "circle", x: 30, y, r, fill: p.accent });
      out.push({ t: "circle", x: W - 30, y, r, fill: p.accent });
    }
  }
}

function cornersP(out: Prim[], p: BorderParams, t: number) {
  const { width: W, height: H } = p;
  const m = 50;
  const len = 300;
  const lw = 16;
  const bracket = (x: number, y: number, dx: number, dy: number) => {
    out.push({
      t: "path",
      d: `M ${x} ${y + dy * len} L ${x} ${y} L ${x + dx * len} ${y}`,
      stroke: p.accent,
      sw: lw,
      cap: "square",
    });
  };
  bracket(m, m, 1, 1);
  bracket(W - m, m, -1, 1);
  bracket(m, H - m, 1, -1);
  bracket(W - m, H - m, -1, -1);

  const cluster = (cx: number, cy: number, dx: number, dy: number) => {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if (i + j === 0) continue;
        const x = cx + dx * (m + i * p.dotGap);
        const y = cy + dy * (m + j * p.dotGap);
        const pulse = 0.5 + 0.5 * Math.sin((i + j) * 0.8 - t * p.speed * 2.5);
        const r = p.dotSize * (0.3 + 0.7 * pulse) * (1 - (i + j) / 12);
        if (r > 0.2) out.push({ t: "circle", x, y, r, fill: p.accent });
      }
    }
  };
  cluster(m, m, 1, 1);
  cluster(W - m, m, -1, 1);
  cluster(m, H - m, 1, -1);
  cluster(W - m, H - m, -1, -1);

  if (p.showTitle) {
    out.push({ t: "text", x: W / 2, y: H - 150, s: p.title.toUpperCase(), size: 76, weight: 800, fill: p.accent, family: FONT_SANS, anchor: "middle", middle: false });
    out.push({ t: "text", x: W / 2, y: H - 100, s: p.handle, size: 38, weight: 600, fill: "#ffffff", family: FONT_MONO, anchor: "middle", middle: false });
  }
}

function waveP(out: Prim[], p: BorderParams, t: number) {
  const { width: W, height: H } = p;
  const band = p.thickness;
  const gap = p.dotGap;
  for (let y = gap / 2; y < H; y += gap) {
    for (let x = gap / 2; x < W; x += gap) {
      const d = Math.min(x, y, W - x, H - y);
      if (d > band) continue;
      const edge = 1 - d / band;
      const wave = 0.5 + 0.5 * Math.sin(x * 0.02 + y * 0.02 - t * p.speed * 2.4);
      const r = p.dotSize * edge * (0.35 + 0.75 * wave);
      if (r > 0.2) out.push({ t: "circle", x, y, r, fill: p.dotColor });
    }
  }
  if (p.showTitle) {
    out.push({ t: "text", x: 60, y: 110, s: p.title.toUpperCase(), size: 48, weight: 800, fill: p.accent, family: FONT_SANS, anchor: "start", middle: false });
  }
}

// ------------------------------------------------------------------
// Render para CANVAS
// ------------------------------------------------------------------

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function renderPrim(ctx: CanvasRenderingContext2D, pr: Prim) {
  switch (pr.t) {
    case "circle":
      ctx.fillStyle = pr.fill;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "rect":
      ctx.fillStyle = pr.fill;
      if (pr.rx) {
        roundRectPath(ctx, pr.x, pr.y, pr.w, pr.h, pr.rx);
        ctx.fill();
      } else ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
      break;
    case "rectStroke":
      ctx.strokeStyle = pr.stroke;
      ctx.lineWidth = pr.sw;
      roundRectPath(ctx, pr.x, pr.y, pr.w, pr.h, pr.rx);
      ctx.stroke();
      break;
    case "path":
      ctx.strokeStyle = pr.stroke;
      ctx.lineWidth = pr.sw;
      ctx.lineCap = pr.cap;
      ctx.stroke(new Path2D(pr.d));
      break;
    case "text":
      ctx.fillStyle = pr.fill;
      ctx.font = `${pr.weight} ${pr.size}px ${pr.family}`;
      ctx.textAlign = pr.anchor === "middle" ? "center" : pr.anchor === "end" ? "right" : "left";
      ctx.textBaseline = pr.middle ? "middle" : "alphabetic";
      ctx.fillText(pr.s, pr.x, pr.y);
      break;
    case "clip":
      ctx.save();
      ctx.beginPath();
      ctx.rect(pr.x, pr.y, pr.w, pr.h);
      ctx.clip();
      for (const c of pr.children) renderPrim(ctx, c);
      ctx.restore();
      break;
  }
}

export function drawBorder(ctx: CanvasRenderingContext2D, p: BorderParams, t: number) {
  ctx.clearRect(0, 0, p.width, p.height);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const prims = buildBorderPrimitives(p, t);
  for (const pr of prims) renderPrim(ctx, pr);
}

// ------------------------------------------------------------------
// Render para SVG (vetorial)
// ------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function primSVG(pr: Prim, clipId: { n: number }, defs: string[]): string {
  switch (pr.t) {
    case "circle":
      return `<circle cx="${pr.x.toFixed(2)}" cy="${pr.y.toFixed(2)}" r="${pr.r.toFixed(2)}" fill="${pr.fill}"/>`;
    case "rect":
      return `<rect x="${pr.x.toFixed(2)}" y="${pr.y.toFixed(2)}" width="${pr.w.toFixed(2)}" height="${pr.h.toFixed(2)}"${pr.rx ? ` rx="${pr.rx.toFixed(2)}"` : ""} fill="${pr.fill}"/>`;
    case "rectStroke":
      return `<rect x="${pr.x.toFixed(2)}" y="${pr.y.toFixed(2)}" width="${pr.w.toFixed(2)}" height="${pr.h.toFixed(2)}" rx="${pr.rx.toFixed(2)}" fill="none" stroke="${pr.stroke}" stroke-width="${pr.sw}"/>`;
    case "path":
      return `<path d="${pr.d}" fill="none" stroke="${pr.stroke}" stroke-width="${pr.sw}" stroke-linecap="${pr.cap}"/>`;
    case "text": {
      const baseline = pr.middle ? ` dominant-baseline="central"` : "";
      return `<text x="${pr.x.toFixed(2)}" y="${pr.y.toFixed(2)}" font-family="${pr.family}" font-size="${pr.size}" font-weight="${pr.weight}" fill="${pr.fill}" text-anchor="${pr.anchor}"${baseline}>${esc(pr.s)}</text>`;
    }
    case "clip": {
      const id = `clip${clipId.n++}`;
      defs.push(`<clipPath id="${id}"><rect x="${pr.x.toFixed(2)}" y="${pr.y.toFixed(2)}" width="${pr.w.toFixed(2)}" height="${pr.h.toFixed(2)}"/></clipPath>`);
      const inner = pr.children.map((c) => primSVG(c, clipId, defs)).join("");
      return `<g clip-path="url(#${id})">${inner}</g>`;
    }
  }
}

export function buildBorderSVG(p: BorderParams, t: number): string {
  const prims = buildBorderPrimitives(p, t);
  const defs: string[] = [];
  const clipId = { n: 0 };
  const body = prims.map((pr) => primSVG(pr, clipId, defs)).join("");
  const defsBlock = defs.length ? `<defs>${defs.join("")}</defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}">${defsBlock}${body}</svg>`;
}
