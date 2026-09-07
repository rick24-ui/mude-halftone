// Motor de "Fusão" — blobs orgânicos (metaballs) a partir de pontos que o
// usuário posiciona e interliga. Um único cálculo de contorno (marching
// squares + suavização) alimenta tanto o preview em canvas quanto a
// exportação SVG, garantindo que os dois sejam sempre idênticos.

export type LinkMode = "none" | "nearest" | "distance" | "manual";
export type RenderMode = "fill" | "stroke" | "both";
export type ColorMode = "solid" | "gradient";
export type Quality = "draft" | "medium" | "high";

export interface BlobNode {
  id: number;
  x: number; // normalizado 0..1
  y: number; // normalizado 0..1
  r: number; // normalizado, fração do menor lado do canvas
  seed: number; // fase estável para o movimento contínuo
}

export interface BlobLink {
  a: number; // id do nó
  b: number; // id do nó
}

export interface BlobParams {
  minRadiusN: number;    // normalizado, fração do menor lado do canvas
  maxRadiusN: number;    // normalizado, fração do menor lado do canvas
  fusion: number;        // 0..100 — intensidade da fusão (dividido <-> mesclado)
  sharpness: number;     // 0..100 — nitidez do corte (ajuste fino do limiar)
  quality: Quality;      // resolução da grade de amostragem
  linkMode: LinkMode;
  linkDistance: number;  // modo "distance" — × raio médio
  linkNearestK: number;  // modo "nearest" — vizinhos por ponto
  linkWidth: number;     // espessura do "pescoço" dos vínculos, fator
  curvature: number;     // 0..100 — suavização do contorno (facetado <-> orgânico)
  renderMode: RenderMode;
  strokeWidth: number;   // px, espaço lógico
  colorMode: ColorMode;
  color1: string;
  color2: string;
  gradientAngle: number; // graus
  background: "transparent" | "solid";
  bgColor: string;
  opacity: number;       // 0..1
  glow: boolean;
  glowAmount: number;    // 0..100
  grain: boolean;
  grainAmount: number;   // 0..100
  idleAmount: number;    // 0..100 — intensidade do movimento contínuo
  idleSpeed: number;     // 0..100
  showNodes: boolean;
}

export const DEFAULT_BLOB_PARAMS: BlobParams = {
  minRadiusN: 0.035,
  maxRadiusN: 0.09,
  fusion: 55,
  sharpness: 50,
  quality: "medium",
  linkMode: "none",
  linkDistance: 1.6,
  linkNearestK: 2,
  linkWidth: 55,
  curvature: 70,
  renderMode: "fill",
  strokeWidth: 3,
  colorMode: "solid",
  color1: "#d00000",
  color2: "#212121",
  gradientAngle: 45,
  background: "transparent",
  bgColor: "#0d0d0f",
  opacity: 1,
  glow: false,
  glowAmount: 40,
  grain: false,
  grainAmount: 35,
  idleAmount: 22,
  idleSpeed: 30,
  showNodes: true,
};

// ─── PRNG determinístico (mesma família usada no resto do app) ─────────────

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let uidCounter = 1;
export function nextNodeId(): number {
  return uidCounter++;
}

// ─── posições "renderizadas" — nó ancorado + leve balanço orgânico ─────────

export interface RenderNode { x: number; y: number; r: number; }

export function animatedNodes(nodes: BlobNode[], W: number, H: number, time: number, p: BlobParams): RenderNode[] {
  const amp = (p.idleAmount / 100) * 0.02 * Math.min(W, H);
  const ampR = (p.idleAmount / 100) * 0.12;
  const sp = (p.idleSpeed / 100) * 1.6 + 0.05;
  return nodes.map((n) => {
    const x = n.x * W;
    const y = n.y * H;
    const r = n.r * Math.min(W, H);
    if (p.idleAmount <= 0) return { x, y, r };
    const dx = Math.sin(time * sp + n.seed) * amp;
    const dy = Math.cos(time * sp * 0.82 + n.seed * 1.7) * amp;
    const dr = 1 + Math.sin(time * sp * 1.3 + n.seed * 2.3) * ampR;
    return { x: x + dx, y: y + dy, r: r * dr };
  });
}

// ─── campo escalar (metaball clássico, 1/d²) + vínculos como cápsulas ──────

function pointSegDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 1e-9 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + abx * t, cy = ay + aby * t;
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy;
}

interface FieldCtx {
  nodes: RenderNode[];
  links: [RenderNode, RenderNode][];
  reach: number;      // multiplicador de raio efetivo — controla a fusão
  linkReach: number;  // multiplicador do raio do "pescoço" dos vínculos
}

function fieldAt(x: number, y: number, f: FieldCtx): number {
  let sum = 0;
  for (const n of f.nodes) {
    const rr = (n.r * f.reach) ** 2;
    const dx = x - n.x, dy = y - n.y;
    const d2 = dx * dx + dy * dy;
    sum += rr / Math.max(1, d2);
  }
  for (const [a, b] of f.links) {
    const rr = (((a.r + b.r) / 2) * f.linkReach) ** 2;
    const d2 = pointSegDist2(x, y, a.x, a.y, b.x, b.y);
    sum += rr / Math.max(1, d2);
  }
  return sum;
}

// ─── marching squares — extrai o(s) contorno(s) no nível de corte 1.0 ──────

interface Pt { x: number; y: number; }

function crossing(v0: number, v1: number, p0: Pt, p1: Pt): Pt | null {
  const s0 = v0 > 0, s1 = v1 > 0;
  if (s0 === s1) return null;
  const t = v0 / (v0 - v1);
  return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
}

const QUALITY_CELL: Record<Quality, number> = { draft: 10, medium: 6, high: 3.5 };

export function computeContours(
  nodes: BlobNode[],
  links: BlobLink[],
  W: number,
  H: number,
  time: number,
  p: BlobParams
): Pt[][] {
  if (nodes.length === 0) return [];
  const rn = animatedNodes(nodes, W, H, time, p);
  const byId = new Map<number, number>();
  nodes.forEach((n, i) => byId.set(n.id, i));
  const linkPairs: [RenderNode, RenderNode][] = [];
  for (const l of links) {
    const ia = byId.get(l.a), ib = byId.get(l.b);
    if (ia === undefined || ib === undefined) continue;
    linkPairs.push([rn[ia], rn[ib]]);
  }

  // fusão → alcance efetivo dos raios; nitidez → limiar em torno de 1.0
  const reach = 0.55 + (p.fusion / 100) * 2.6;
  const linkReach = (p.linkWidth / 100) * 1.4 + 0.08;
  const threshold = 1.6 - (p.sharpness / 100) * 1.15;
  const field: FieldCtx = { nodes: rn, links: linkPairs, reach, linkReach };

  // caixa delimitadora com folga suficiente pra fechar todos os contornos
  let maxR = 0;
  for (const n of rn) maxR = Math.max(maxR, n.r * reach, n.r * linkReach);
  const pad = Math.max(maxR * 2.2, 24);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of rn) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  minX = Math.max(-pad, minX - pad);
  minY = Math.max(-pad, minY - pad);
  maxX = Math.min(W + pad, maxX + pad);
  maxY = Math.min(H + pad, maxY + pad);

  const cell = QUALITY_CELL[p.quality];
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell));
  const rows = Math.max(1, Math.ceil((maxY - minY) / cell));
  const cw = (maxX - minX) / cols;
  const ch = (maxY - minY) / rows;

  // valores da grade (com sinal: field - threshold), calculados uma vez
  const gw = cols + 1, gh = rows + 1;
  const grid = new Float64Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    const y = minY + j * ch;
    for (let i = 0; i < gw; i++) {
      const x = minX + i * cw;
      grid[j * gw + i] = fieldAt(x, y, field) - threshold;
    }
  }
  const val = (i: number, j: number) => grid[j * gw + i];

  const segments: [Pt, Pt][] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x0 = minX + i * cw, x1 = x0 + cw;
      const y0 = minY + j * ch, y1 = y0 + ch;
      const tl = val(i, j), tr = val(i + 1, j), br = val(i + 1, j + 1), bl = val(i, j + 1);
      const eTop = crossing(tl, tr, { x: x0, y: y0 }, { x: x1, y: y0 });
      const eRight = crossing(tr, br, { x: x1, y: y0 }, { x: x1, y: y1 });
      const eBottom = crossing(bl, br, { x: x0, y: y1 }, { x: x1, y: y1 });
      const eLeft = crossing(tl, bl, { x: x0, y: y0 }, { x: x0, y: y1 });
      const n = (eTop ? 1 : 0) + (eRight ? 1 : 0) + (eBottom ? 1 : 0) + (eLeft ? 1 : 0);
      if (n === 2) {
        const pts = [eTop, eRight, eBottom, eLeft].filter(Boolean) as Pt[];
        segments.push([pts[0], pts[1]]);
      } else if (n === 4) {
        // caso ambíguo (sela) — resolve pela amostra do centro da célula
        const center = fieldAt((x0 + x1) / 2, (y0 + y1) / 2, field) - threshold;
        if (center > 0) {
          segments.push([eTop!, eLeft!]);
          segments.push([eBottom!, eRight!]);
        } else {
          segments.push([eTop!, eRight!]);
          segments.push([eLeft!, eBottom!]);
        }
      }
    }
  }

  return stitchSegments(segments);
}

// junta os segmentos (que compartilham pontos idênticos nas bordas da grade)
// em polilinhas fechadas
function stitchSegments(segments: [Pt, Pt][]): Pt[][] {
  const key = (p: Pt) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
  const adj = new Map<string, { pt: Pt; to: string[] }>();
  const ensure = (p: Pt) => {
    const k = key(p);
    if (!adj.has(k)) adj.set(k, { pt: p, to: [] });
    return k;
  };
  for (const [a, b] of segments) {
    const ka = ensure(a), kb = ensure(b);
    adj.get(ka)!.to.push(kb);
    adj.get(kb)!.to.push(ka);
  }

  const visited = new Set<string>();
  const loops: Pt[][] = [];
  for (const startKey of adj.keys()) {
    if (visited.has(startKey)) continue;
    const loop: Pt[] = [];
    let prevKey: string | null = null;
    let curKey = startKey;
    let guard = 0;
    while (guard++ < adj.size + 5) {
      const node = adj.get(curKey);
      if (!node) break;
      visited.add(curKey);
      loop.push(node.pt);
      const next = node.to.find((k) => k !== prevKey && !visited.has(k)) ??
        node.to.find((k) => k === startKey && loop.length > 2);
      if (!next) break;
      prevKey = curKey;
      curKey = next;
      if (curKey === startKey) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// ─── suavização (Chaikin) — alimenta o controle de "curvatura" ─────────────

export function chaikinSmooth(pts: Pt[], iterations: number): Pt[] {
  if (iterations <= 0 || pts.length < 3) return pts;
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const next: Pt[] = [];
    const n = cur.length;
    for (let i = 0; i < n; i++) {
      const p0 = cur[i], p1 = cur[(i + 1) % n];
      next.push({ x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 });
      next.push({ x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 });
    }
    cur = next;
  }
  return cur;
}

export function smoothContours(contours: Pt[][], curvature: number): Pt[][] {
  // cada iteração de Chaikin DOBRA a contagem de pontos — 2 já deixa o
  // contorno bem orgânico; mais que isso só infla o arquivo sem ganho visual
  const iterations = Math.round((curvature / 100) * 2);
  return contours.map((c) => chaikinSmooth(c, iterations));
}

// ─── construção do path — quadráticas passando pelos pontos médios, usado
// igualmente pelo canvas (preview) e pelo SVG (export) ─────────────────────

export function contourToPathCommands(pts: Pt[], straight: boolean): string {
  if (pts.length < 3) return "";
  if (straight) {
    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} `;
    for (let i = 1; i < pts.length; i++) d += `L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)} `;
    return d + "Z";
  }
  const n = pts.length;
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[n - 1], pts[0]);
  let d = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} `;
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const m = mid(cur, next);
    d += `Q ${cur.x.toFixed(2)} ${cur.y.toFixed(2)} ${m.x.toFixed(2)} ${m.y.toFixed(2)} `;
  }
  return d + "Z";
}

export function drawContourPath(ctx: CanvasRenderingContext2D, pts: Pt[], straight: boolean) {
  if (pts.length < 3) return;
  const n = pts.length;
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  if (straight) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    return;
  }
  const start = mid(pts[n - 1], pts[0]);
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const m = mid(cur, next);
    ctx.quadraticCurveTo(cur.x, cur.y, m.x, m.y);
  }
  ctx.closePath();
}

// ─── util de cor / gradiente compartilhado entre canvas e SVG ──────────────

export function makeCanvasFillStyle(
  ctx: CanvasRenderingContext2D,
  p: BlobParams,
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
): string | CanvasGradient {
  if (p.colorMode === "solid") return p.color1;
  const rad = (p.gradientAngle * Math.PI) / 180;
  const cx = (bbox.minX + bbox.maxX) / 2, cy = (bbox.minY + bbox.maxY) / 2;
  const halfDiag = Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) / 2 || 1;
  const dx = Math.cos(rad) * halfDiag, dy = Math.sin(rad) * halfDiag;
  const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  grad.addColorStop(0, p.color1);
  grad.addColorStop(1, p.color2);
  return grad;
}

export function contoursBBox(contours: Pt[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours) for (const p of c) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}
