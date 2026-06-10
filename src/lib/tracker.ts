export interface TrackedPoint {
  name: string;
  x: number; // normalized 0–1
  y: number; // normalized 0–1
  score: number;
}

export type ImageFilter = "none" | "invert" | "ascii" | "duotone" | "posterize" | "glitch" | "pixelate";

export interface DrawOptions {
  color: string;
  showKeypoints: boolean;
  showSkeleton: boolean;
  showBoxes: boolean;
  showLabels: boolean;
  lineWidth: number;
  dotRadius: number;
  scanlines: boolean;
  grain: boolean;
  vignette: boolean;
  zoomInset: boolean;
  // Name of the keypoint to focus the zoom inset on — set by clicking a dot
  // on the canvas. Null means no focus point, so no inset is drawn.
  zoomFocus: string | null;
  // Editable label texts — parallel to REGIONS (by index) plus the zoom inset label
  regionLabels: string[];
  zoomLabel: string;
  // Font family used to render technical labels on the canvas
  labelFont: string;
  // Creative/editorial image filter applied to the source image
  filter: ImageFilter;
}

export interface LabelFontDef {
  id: string;
  label: string;
  family: string;
}

export const LABEL_FONTS: LabelFontDef[] = [
  { id: "geist-mono", label: "Geist Mono", family: '"Geist Mono", ui-monospace, monospace' },
  { id: "oswald", label: "Oswald", family: '"Oswald", sans-serif' },
  { id: "barlow", label: "Barlow Condensed", family: '"Barlow Condensed", sans-serif' },
  { id: "archivo", label: "Archivo Black", family: '"Archivo Black", sans-serif' },
  { id: "bebas", label: "Bebas Neue", family: '"Bebas Neue", sans-serif' },
  { id: "anton", label: "Anton", family: '"Anton", sans-serif' },
];

export const DEFAULT_LABEL_FONT = LABEL_FONTS[0].family;

export interface FilterDef {
  id: ImageFilter;
  label: string;
}

export const FILTERS: FilterDef[] = [
  { id: "none", label: "Nenhum" },
  { id: "invert", label: "Invertido" },
  { id: "duotone", label: "Duotone" },
  { id: "posterize", label: "Posterizado" },
  { id: "ascii", label: "ASCII" },
  { id: "glitch", label: "Glitch" },
  { id: "pixelate", label: "Pixelado" },
];

// ─── Skeleton connections ───────────────────────────────────────────────────

const SKELETON: [string, string][] = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
  ["nose", "left_eye"],
  ["nose", "right_eye"],
  ["left_eye", "left_ear"],
  ["right_eye", "right_ear"],
  ["left_shoulder", "nose"],
  ["right_shoulder", "nose"],
];

// ─── Region groups → auto-generate bounding boxes ────────────────────────

interface Region {
  label: string;
  keys: string[];
}

const REGIONS: Region[] = [
  { label: "Driving power chain", keys: ["right_shoulder", "right_elbow", "right_wrist"] },
  { label: "Kinetic arc vector", keys: ["left_shoulder", "left_elbow", "left_wrist"] },
  { label: "Core transfer chain", keys: ["left_shoulder", "right_shoulder", "left_hip", "right_hip"] },
  { label: "Hovering point", keys: ["nose", "left_shoulder", "right_shoulder"] },
  { label: "Ground contact", keys: ["right_knee", "right_ankle"] },
  { label: "Anchor node", keys: ["left_knee", "left_ankle"] },
];

export const DEFAULT_ZOOM_LABEL = "Strike zone";

// Default editable label texts, in REGIONS order — UI seeds its inputs from this
export const DEFAULT_REGION_LABELS: string[] = REGIONS.map((r) => r.label);

// ─── Model loader ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detector: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadPromise: Promise<any> | null = null;

export async function loadDetector(): Promise<boolean> {
  if (detector) return true;
  if (loadPromise) { await loadPromise; return !!detector; }

  loadPromise = (async () => {
    try {
      await import("@tensorflow/tfjs");
      const pd = await import("@tensorflow-models/pose-detection");
      detector = await pd.createDetector(pd.SupportedModels.MoveNet, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        modelType: (pd as any).movenet.modelType.SINGLEPOSE_LIGHTNING,
      });
    } catch (e) {
      console.error("Failed to load pose detector:", e);
      loadPromise = null;
    }
  })();

  await loadPromise;
  return !!detector;
}

export async function detectPoints(
  image: HTMLImageElement | HTMLCanvasElement
): Promise<TrackedPoint[]> {
  if (!detector) {
    const ok = await loadDetector();
    if (!ok) return [];
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const poses: any[] = await detector.estimatePoses(image);
    if (!poses.length) return [];

    const w = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const h = image instanceof HTMLImageElement ? image.naturalHeight : image.height;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return poses[0].keypoints
      .filter((kp: any) => (kp.score ?? 0) > 0.25)
      .map((kp: any) => ({
        name: kp.name as string,
        x: kp.x / w,
        y: kp.y / h,
        score: kp.score ?? 0,
      }));
  } catch (e) {
    console.error("Pose detection failed:", e);
    return [];
  }
}

// ─── Drawing ──────────────────────────────────────────────────────────────

function uid() {
  return String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
}

export function drawOverlay(
  canvas: HTMLCanvasElement,
  src: HTMLImageElement | HTMLCanvasElement,
  points: TrackedPoint[],
  opts: DrawOptions
): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, w, h);
  drawFilteredImage(ctx, src, w, h, opts.filter, opts.color);

  if (!points.length) return;

  const map = new Map(points.map((p) => [p.name, p]));
  const px = (p: TrackedPoint) => p.x * w;
  const py = (p: TrackedPoint) => p.y * h;

  ctx.save();
  ctx.strokeStyle = opts.color;
  ctx.fillStyle = opts.color;
  ctx.lineWidth = opts.lineWidth;
  ctx.lineCap = "round";

  // ── Skeleton ────────────────────────────────────────────────────────────
  if (opts.showSkeleton) {
    ctx.beginPath();
    ctx.globalAlpha = 0.55;
    SKELETON.forEach(([a, b]) => {
      const pa = map.get(a);
      const pb = map.get(b);
      if (!pa || !pb) return;
      ctx.moveTo(px(pa), py(pa));
      ctx.lineTo(px(pb), py(pb));
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── Keypoint dots ───────────────────────────────────────────────────────
  if (opts.showKeypoints) {
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(px(p), py(p), opts.dotRadius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ── Zoom-focus ring — highlights the keypoint clicked by the user ───────
  const focusPoint = opts.zoomFocus ? map.get(opts.zoomFocus) : undefined;
  if (focusPoint) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = opts.lineWidth * 1.6;
    ctx.beginPath();
    ctx.arc(px(focusPoint), py(focusPoint), opts.dotRadius * 2.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── Region boxes + labels ───────────────────────────────────────────────
  const pad = w * 0.038;
  const fontSize = Math.max(10, w * 0.012);
  ctx.font = `${fontSize}px ${opts.labelFont}`;
  ctx.textBaseline = "top";

  interface ValidRegion extends Region { pts: TrackedPoint[]; avgScore: number; id: string; }

  const validRegions: ValidRegion[] = REGIONS.map((rg, i) => {
    const pts = rg.keys
      .map((k) => map.get(k))
      .filter((p): p is TrackedPoint => p !== undefined);
    if (pts.length < Math.min(2, rg.keys.length)) return null;
    const avgScore = pts.reduce((s, p) => s + p.score, 0) / pts.length;
    const label = opts.regionLabels[i]?.trim() || rg.label;
    return { ...rg, label, pts, avgScore, id: uid() } as ValidRegion;
  })
    .filter((r): r is ValidRegion => r !== null)
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 4);

  validRegions.forEach((rg) => {
    const xs = rg.pts.map((p) => px(p));
    const ys = rg.pts.map((p) => py(p));
    const bx = Math.min(...xs) - pad;
    const by = Math.min(...ys) - pad;
    const bw = Math.max(...xs) - Math.min(...xs) + pad * 2;
    const bh = Math.max(...ys) - Math.min(...ys) + pad * 2;

    if (opts.showBoxes) {
      ctx.globalAlpha = 0.8;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.globalAlpha = 1;
    }

    if (opts.showLabels) {
      const label = `${rg.label} ${rg.id}`;
      ctx.globalAlpha = 0.9;
      // Small background strip for readability
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(bx, by + bh + 2, tw + 8, fontSize + 4);
      ctx.fillStyle = opts.color;
      ctx.fillText(label, bx + 4, by + bh + 4);
      ctx.globalAlpha = 1;
    }
  });

  // ── Zoom inset — crops in around the user-clicked focus keypoint ────────
  if (opts.zoomInset && focusPoint) {
    const size = Math.min(w, h) * 0.16;
    const bx = px(focusPoint) - size / 2;
    const by = py(focusPoint) - size / 2;
    const bw = size;
    const bh = size;
    const insetW = Math.min(bw * 2.5, w * 0.35);
    const insetH = Math.min(bh * 2.5, h * 0.35);
    const insetX = w - insetW - pad * 1.5;
    const insetY = h - insetH - pad * 1.5;

    // Source crop in canvas space → map back to source image coords
    const scaleX = (src instanceof HTMLImageElement ? src.naturalWidth : src.width) / w;
    const scaleY = (src instanceof HTMLImageElement ? src.naturalHeight : src.height) / h;
    const cropX = Math.max(0, bx * scaleX);
    const cropY = Math.max(0, by * scaleY);
    const cropW = Math.max(1, bw * scaleX);
    const cropH = Math.max(1, bh * scaleY);

    ctx.save();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = opts.lineWidth;
    ctx.globalAlpha = 0.85;
    ctx.strokeRect(insetX, insetY, insetW, insetH);

    ctx.beginPath();
    ctx.rect(insetX, insetY, insetW, insetH);
    ctx.clip();
    ctx.drawImage(src, cropX, cropY, cropW, cropH, insetX, insetY, insetW, insetH);
    ctx.restore();

    // Connecting line from source box to inset
    ctx.save();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = opts.lineWidth * 0.7;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(bx + bw, by + bh);
    ctx.lineTo(insetX, insetY + insetH);
    ctx.stroke();
    ctx.restore();

    // Label below inset
    if (opts.showLabels) {
      const lbl = `${opts.zoomLabel.trim() || DEFAULT_ZOOM_LABEL} ${uid()}`;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = opts.color;
      ctx.fillText(lbl, insetX, insetY + insetH + 4);
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();

  // ── Post-processing effects ─────────────────────────────────────────────
  if (opts.scanlines) applyScanlines(ctx, w, h);
  if (opts.grain) applyGrain(ctx, w, h);
  if (opts.vignette) applyVignette(ctx, w, h);
}

function applyScanlines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = "#000";
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}

function applyGrain(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 38;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
  }
  ctx.putImageData(id, 0, 0);
}

function applyVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.85);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ─── Creative / editorial image filters ────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function drawFilteredImage(
  ctx: CanvasRenderingContext2D,
  src: HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number,
  filter: ImageFilter,
  accentColor: string
): void {
  switch (filter) {
    case "invert":
      ctx.save();
      ctx.filter = "invert(1)";
      ctx.drawImage(src, 0, 0, w, h);
      ctx.restore();
      return;
    case "duotone":
      ctx.drawImage(src, 0, 0, w, h);
      applyDuotone(ctx, w, h, accentColor);
      return;
    case "posterize":
      ctx.drawImage(src, 0, 0, w, h);
      applyPosterize(ctx, w, h, 4);
      return;
    case "glitch":
      ctx.drawImage(src, 0, 0, w, h);
      applyGlitch(ctx, w, h);
      return;
    case "pixelate":
      applyPixelate(ctx, src, w, h);
      return;
    case "ascii":
      applyAscii(ctx, src, w, h, accentColor);
      return;
    case "none":
    default:
      ctx.drawImage(src, 0, 0, w, h);
  }
}

// Maps luminance onto a gradient between black and the selected accent color
function applyDuotone(ctx: CanvasRenderingContext2D, w: number, h: number, accentHex: string) {
  const accent = hexToRgb(accentHex);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    d[i] = accent.r * lum;
    d[i + 1] = accent.g * lum;
    d[i + 2] = accent.b * lum;
  }
  ctx.putImageData(id, 0, 0);
}

// Quantizes each color channel into a fixed number of levels — poster-print look
function applyPosterize(ctx: CanvasRenderingContext2D, w: number, h: number, levels: number) {
  const step = 255 / (levels - 1);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(Math.round(d[i] / step) * step);
    d[i + 1] = Math.round(Math.round(d[i + 1] / step) * step);
    d[i + 2] = Math.round(Math.round(d[i + 2] / step) * step);
  }
  ctx.putImageData(id, 0, 0);
}

// Splits red/blue channels horizontally for a chromatic-aberration "glitch" look
function applyGlitch(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const shift = Math.max(2, Math.round(w * 0.01));
  const id = ctx.getImageData(0, 0, w, h);
  const original = new Uint8ClampedArray(id.data);
  const d = id.data;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4;
      const rX = Math.min(w - 1, x + shift);
      const bX = Math.max(0, x - shift);
      d[i] = original[(row + rX) * 4];
      d[i + 2] = original[(row + bX) * 4 + 2];
    }
  }
  ctx.putImageData(id, 0, 0);
}

// Downscales then upscales with no smoothing — mosaic / censor-block look
function applyPixelate(
  ctx: CanvasRenderingContext2D,
  src: HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number
) {
  const blockSize = Math.max(4, Math.round(w * 0.018));
  const sw = Math.max(1, Math.floor(w / blockSize));
  const sh = Math.max(1, Math.floor(h / blockSize));
  const off = document.createElement("canvas");
  off.width = sw;
  off.height = sh;
  const octx = off.getContext("2d")!;
  octx.drawImage(src, 0, 0, sw, sh);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, sw, sh, 0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
}

// Samples luminance on a coarse grid and renders it as monospace ASCII glyphs
function applyAscii(
  ctx: CanvasRenderingContext2D,
  src: HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number,
  accentColor: string
) {
  const cell = Math.max(5, Math.round(w / 110));
  const cols = Math.max(1, Math.floor(w / cell));
  const rows = Math.max(1, Math.floor(h / cell));

  const off = document.createElement("canvas");
  off.width = cols;
  off.height = rows;
  const octx = off.getContext("2d")!;
  octx.drawImage(src, 0, 0, cols, rows);
  const sample = octx.getImageData(0, 0, cols, rows).data;

  const ramp = " .:-=+*#%@";
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accentColor;
  ctx.font = `${cell}px ui-monospace, Menlo, monospace`;
  ctx.textBaseline = "top";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const lum = (sample[i] * 0.299 + sample[i + 1] * 0.587 + sample[i + 2] * 0.114) / 255;
      const ch = ramp[Math.min(ramp.length - 1, Math.floor(lum * ramp.length))];
      ctx.fillText(ch, x * cell, y * cell);
    }
  }
  ctx.restore();
}
