export interface TrackedPoint {
  name: string;
  x: number; // normalized 0–1
  y: number; // normalized 0–1
  score: number;
}

export type ImageFilter = "none" | "invert" | "ascii" | "duotone" | "posterize" | "glitch" | "pixelate" | "thermal";

// What the tracker should lock onto: the main subject (pose detection) or
// high-contrast points in the surrounding environment
export type TrackMode = "person" | "environment";

// Hard cap on how much of an uploaded video is tracked/exported — keeps
// per-frame pose detection and recording within a reasonable time budget
export const MAX_VIDEO_DURATION = 12;

export type MarkerStyle = "dot" | "cross" | "ring" | "square" | "triangle";
export type BoxStyle = "rect" | "corners";

// A user-placed zoom inset — tied to a keypoint, but freely draggable and
// resizable on the canvas. Coordinates/size are normalized 0–1.
export interface ZoomInsetState {
  point: string;
  x: number;
  y: number;
  size: number;
}

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
  // Zoom insets created by clicking keypoints — each one is independently
  // draggable and resizable by the user.
  zoomInsets: ZoomInsetState[];
  // Editable label texts — parallel to REGIONS (by index) plus the zoom inset label
  regionLabels: string[];
  zoomLabel: string;
  // Font family used to render technical labels on the canvas
  labelFont: string;
  // Creative/editorial image filter applied to the source image
  filter: ImageFilter;
  // 0–1: how much the region bounding boxes randomly drift in position,
  // size and rotation on every redraw — for a dynamic, glitchy feel
  boxJitter: number;
  // Adds a soft glow halo around keypoint markers
  dotGlow: boolean;
  // Shape used to render keypoint markers
  markerStyle: MarkerStyle;
  // Style used to render region bounding boxes
  boxStyle: BoxStyle;
  // Draws a constellation network connecting nearby keypoints, plus a
  // connector line from each zoom inset to its source keypoint
  connections: boolean;
  // 0–1: how many neighbor connections each keypoint gets in the network
  connectionDensity: number;
  // Adds a soft glow halo around connection lines
  connectionGlow: boolean;
  // Floating monospace coordinate readouts near each keypoint — motion-capture feel
  showCoords: boolean;
  // Per-region effect override — parallel to REGIONS (by index). "none" = no override
  regionFilters: ImageFilter[];
  // Effect applied inside zoom insets — "none" = raw crop of the source image
  insetFilter: ImageFilter;
}

export interface MarkerStyleDef {
  id: MarkerStyle;
  label: string;
}

export const MARKER_STYLES: MarkerStyleDef[] = [
  { id: "dot", label: "Ponto" },
  { id: "cross", label: "Cruz" },
  { id: "ring", label: "Anel" },
  { id: "square", label: "Quadrado" },
  { id: "triangle", label: "Triângulo" },
];

export interface BoxStyleDef {
  id: BoxStyle;
  label: string;
}

export const BOX_STYLES: BoxStyleDef[] = [
  { id: "rect", label: "Retângulo" },
  { id: "corners", label: "Cantos" },
];

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
  { id: "thermal", label: "Térmico" },
  { id: "ascii", label: "ASCII" },
  { id: "glitch", label: "Glitch" },
  { id: "pixelate", label: "Pixelado" },
];

// Filter options for per-region / per-inset effect pickers — includes
// "none" as a no-op meaning "use the global filter / raw crop"
export const REGION_FILTERS: FilterDef[] = FILTERS;

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

// "Ambiente" track mode — instead of a pose model, picks the highest-contrast
// points in the frame (simple gradient-magnitude feature detection) and
// spreads them out so they read as tracked environment features rather than
// a body. Re-run per frame, these drift and resettle with the scene —
// useful for backgrounds, objects, textures, anything that isn't a person.
export function detectEnvironmentPoints(
  src: HTMLCanvasElement,
  count = 6
): TrackedPoint[] {
  const sw = 80;
  const sh = Math.max(1, Math.round((sw * src.height) / src.width));
  const off = document.createElement("canvas");
  off.width = sw;
  off.height = sh;
  const octx = off.getContext("2d")!;
  octx.drawImage(src, 0, 0, sw, sh);
  const data = octx.getImageData(0, 0, sw, sh).data;

  const lum = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    lum[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  }

  const candidates: { x: number; y: number; score: number }[] = [];
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const i = y * sw + x;
      const gx = lum[i + 1] - lum[i - 1];
      const gy = lum[i + sw] - lum[i - sw];
      candidates.push({ x: x / sw, y: y / sh, score: Math.hypot(gx, gy) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const picked: TrackedPoint[] = [];
  const minDist = 0.1;
  for (const c of candidates) {
    if (picked.length >= count) break;
    if (picked.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < minDist)) continue;
    picked.push({ name: `feat-${picked.length}`, x: c.x, y: c.y, score: 1 });
  }
  return picked;
}

// ─── Drawing ──────────────────────────────────────────────────────────────

function uid() {
  return String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
}

// Draws a single keypoint marker in the chosen shape, optionally with a glow halo
function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  style: MarkerStyle,
  glow: boolean,
  color: string
) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = r * 3.5;
  }
  switch (style) {
    case "cross":
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.stroke();
      break;
    case "ring":
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "square":
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      break;
    case "triangle":
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.866, y + r * 0.5);
      ctx.lineTo(x - r * 0.866, y + r * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    case "dot":
    default:
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore();
}

// Strokes a region box either as a full rectangle or as camera-style corner
// brackets — drawn around the (possibly rotated) local origin
function strokeBox(ctx: CanvasRenderingContext2D, w: number, h: number, style: BoxStyle) {
  if (style === "corners") {
    const len = Math.min(w, h) * 0.22;
    ctx.beginPath();
    ctx.moveTo(0, len); ctx.lineTo(0, 0); ctx.lineTo(len, 0);
    ctx.moveTo(w - len, 0); ctx.lineTo(w, 0); ctx.lineTo(w, len);
    ctx.moveTo(w, h - len); ctx.lineTo(w, h); ctx.lineTo(w - len, h);
    ctx.moveTo(len, h); ctx.lineTo(0, h); ctx.lineTo(0, h - len);
    ctx.stroke();
  } else {
    ctx.strokeRect(0, 0, w, h);
  }
}

// Picks a default position (normalized 0–1, top-left) for a new zoom inset
// so it doesn't land on top of the tracked area it's zooming into. Tries a
// few random spots, then falls back to the opposite corner of the canvas.
export function placeZoomInset(
  pointX: number,
  pointY: number,
  canvasW: number,
  canvasH: number,
  size: number
): { x: number; y: number } {
  const insetPx = size * Math.min(canvasW, canvasH);
  const minDim = Math.min(canvasW, canvasH);
  // Exclusion zone around the tracked point — roughly the crop area plus margin
  const exclude = minDim * 0.16 * 1.5;
  const targetX = pointX * canvasW;
  const targetY = pointY * canvasH;
  const exLeft = targetX - exclude / 2;
  const exTop = targetY - exclude / 2;

  for (let i = 0; i < 24; i++) {
    const x = Math.random() * Math.max(1, canvasW - insetPx);
    const y = Math.random() * Math.max(1, canvasH - insetPx);
    const overlaps = x < exLeft + exclude && x + insetPx > exLeft && y < exTop + exclude && y + insetPx > exTop;
    if (!overlaps) return { x: x / canvasW, y: y / canvasH };
  }
  const x = pointX < 0.5 ? canvasW - insetPx : 0;
  const y = pointY < 0.5 ? canvasH - insetPx : 0;
  return { x: x / canvasW, y: y / canvasH };
}

// Lazily renders the source image through a given filter onto an offscreen
// canvas the same size as the main canvas — used to give region boxes and
// zoom insets their own effect "windows" into the image. Cached per filter
// so repeated regions with the same effect don't redo the work.
function getFilteredCanvas(
  cache: Map<ImageFilter, HTMLCanvasElement>,
  src: HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number,
  filter: ImageFilter,
  accentColor: string
): HTMLCanvasElement {
  const cached = cache.get(filter);
  if (cached) return cached;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  drawFilteredImage(off.getContext("2d")!, src, w, h, filter, accentColor);
  cache.set(filter, off);
  return off;
}

export function drawOverlay(
  canvas: HTMLCanvasElement,
  src: HTMLImageElement | HTMLCanvasElement,
  points: TrackedPoint[],
  opts: DrawOptions,
  renderOpts: { interactive?: boolean } = {}
): void {
  const interactive = renderOpts.interactive ?? false;
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, w, h);
  drawFilteredImage(ctx, src, w, h, opts.filter, opts.color);

  if (!points.length) return;

  // Lazily-rendered per-filter copies of the source — used by per-region
  // and per-inset effect windows below
  const filterCache = new Map<ImageFilter, HTMLCanvasElement>();

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
      drawMarker(ctx, px(p), py(p), opts.dotRadius, opts.markerStyle, opts.dotGlow, opts.color);
    });
  }

  // ── Zoom-focus rings — highlight the keypoints the user attached insets to
  const focusPoints = opts.zoomInsets
    .map((inset) => map.get(inset.point))
    .filter((p): p is TrackedPoint => p !== undefined);

  focusPoints.forEach((focusPoint) => {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = opts.lineWidth * 1.6;
    ctx.beginPath();
    ctx.arc(px(focusPoint), py(focusPoint), opts.dotRadius * 2.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  // ── Connections network — TouchDesigner-style constellation linking each
  // keypoint to its nearest neighbors, density controlled by the slider
  if (opts.connections) {
    ctx.save();
    ctx.lineWidth = Math.max(0.5, opts.lineWidth * 0.5);
    ctx.globalAlpha = 0.45;
    if (opts.connectionGlow) {
      ctx.shadowColor = opts.color;
      ctx.shadowBlur = 8;
    }

    const k = Math.max(1, Math.round(1 + opts.connectionDensity * 2));
    const validPoints = points.filter((p) => p.score > 0.3);
    const drawn = new Set<string>();

    validPoints.forEach((p) => {
      const neighbors = validPoints
        .filter((q) => q !== p)
        .map((q) => ({ q, d: Math.hypot(px(p) - px(q), py(p) - py(q)) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, k);

      neighbors.forEach(({ q }) => {
        const key = [p.name, q.name].sort().join("|");
        if (drawn.has(key)) return;
        drawn.add(key);
        ctx.beginPath();
        ctx.moveTo(px(p), py(p));
        ctx.lineTo(px(q), py(q));
        ctx.stroke();
      });
    });

    ctx.restore();
  }

  // ── Floating coordinate readouts — motion-capture style normalized
  // coordinates hovering near each tracked point
  if (opts.showCoords) {
    ctx.save();
    ctx.font = `${Math.max(9, w * 0.0095)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = opts.color;
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.55;
    points.forEach((p) => {
      if (p.score < 0.3) return;
      const label = `${(p.x * 100).toFixed(1)} ${(p.y * 100).toFixed(1)}`;
      ctx.fillText(label, px(p) + opts.dotRadius * 2.2, py(p));
    });
    ctx.restore();
  }

  // ── Region boxes + labels ───────────────────────────────────────────────
  const pad = w * 0.038;
  const fontSize = Math.max(10, w * 0.012);
  ctx.font = `${fontSize}px ${opts.labelFont}`;
  ctx.textBaseline = "top";

  interface ValidRegion extends Region { pts: TrackedPoint[]; avgScore: number; id: string; regionIndex: number; }

  const validRegions: ValidRegion[] = REGIONS.map((rg, i) => {
    const pts = rg.keys
      .map((k) => map.get(k))
      .filter((p): p is TrackedPoint => p !== undefined);
    if (pts.length < Math.min(2, rg.keys.length)) return null;
    const avgScore = pts.reduce((s, p) => s + p.score, 0) / pts.length;
    const label = opts.regionLabels[i]?.trim() || rg.label;
    return { ...rg, label, pts, avgScore, id: uid(), regionIndex: i } as ValidRegion;
  })
    .filter((r): r is ValidRegion => r !== null)
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 4);

  validRegions.forEach((rg) => {
    const xs = rg.pts.map((p) => px(p));
    const ys = rg.pts.map((p) => py(p));
    let bx = Math.min(...xs) - pad;
    let by = Math.min(...ys) - pad;
    let bw = Math.max(...xs) - Math.min(...xs) + pad * 2;
    let bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
    let angle = 0;

    // Random drift in position, size and rotation — keeps the boxes feeling
    // alive and editorial instead of rigidly tracking the body. Pushed hard
    // so the effect reads clearly even at moderate slider values.
    if (opts.boxJitter > 0) {
      const j = opts.boxJitter;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      bw *= 1 + (Math.random() - 0.5) * 1.6 * j;
      bh *= 1 + (Math.random() - 0.5) * 1.6 * j;
      const drift = Math.min(w, h) * 0.35 * j;
      bx = cx - bw / 2 + (Math.random() - 0.5) * 2 * drift;
      by = cy - bh / 2 + (Math.random() - 0.5) * 2 * drift;
      angle = (Math.random() - 0.5) * 0.7 * j;
    }

    // Per-region effect window — clips a separately-filtered copy of the
    // source image to this box's (possibly rotated) shape
    const regionFilter = opts.regionFilters[rg.regionIndex] ?? "none";
    if (regionFilter !== "none") {
      const filtered = getFilteredCanvas(filterCache, src, w, h, regionFilter, opts.color);
      ctx.save();
      ctx.beginPath();
      if (angle !== 0) {
        ctx.translate(bx + bw / 2, by + bh / 2);
        ctx.rotate(angle);
        ctx.rect(-bw / 2, -bh / 2, bw, bh);
      } else {
        ctx.rect(bx, by, bw, bh);
      }
      ctx.clip();
      ctx.drawImage(filtered, 0, 0, w, h);
      ctx.restore();
    }

    if (opts.showBoxes) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      if (angle !== 0) {
        ctx.translate(bx + bw / 2, by + bh / 2);
        ctx.rotate(angle);
        ctx.translate(-bw / 2, -bh / 2);
        strokeBox(ctx, bw, bh, opts.boxStyle);
      } else {
        ctx.translate(bx, by);
        strokeBox(ctx, bw, bh, opts.boxStyle);
      }
      ctx.restore();
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

  // ── Zoom insets — cropped close-ups placed by the user, who can freely
  // drag and resize each one. No rotation, no drop shadow — clean,
  // axis-aligned "concept" frames ──────────────────────────────────────
  if (opts.zoomInset && opts.zoomInsets.length) {
    const scaleX = (src instanceof HTMLImageElement ? src.naturalWidth : src.width) / w;
    const scaleY = (src instanceof HTMLImageElement ? src.naturalHeight : src.height) / h;
    const cropSize = Math.min(w, h) * 0.16;

    opts.zoomInsets.forEach((inset) => {
      const focusPoint = map.get(inset.point);
      if (!focusPoint) return;

      const cropX = Math.max(0, px(focusPoint) - cropSize / 2);
      const cropY = Math.max(0, py(focusPoint) - cropSize / 2);

      const insetSize = inset.size * Math.min(w, h);
      const insetX = inset.x * w;
      const insetY = inset.y * h;

      // Per-inset effect — sources the crop from a separately-filtered
      // copy of the image instead of the raw source
      const insetFilter = opts.insetFilter ?? "none";
      const insetSrc = insetFilter !== "none"
        ? getFilteredCanvas(filterCache, src, w, h, insetFilter, opts.color)
        : src;
      const sx = insetFilter !== "none" ? cropX : cropX * scaleX;
      const sy = insetFilter !== "none" ? cropY : cropY * scaleY;
      const sw = insetFilter !== "none" ? cropSize : cropSize * scaleX;
      const sh = insetFilter !== "none" ? cropSize : cropSize * scaleY;

      ctx.save();
      ctx.beginPath();
      ctx.rect(insetX, insetY, insetSize, insetSize);
      ctx.clip();
      ctx.drawImage(insetSrc, sx, sy, sw, sh, insetX, insetY, insetSize, insetSize);
      ctx.restore();

      // Connector line from the source keypoint to this inset — part of
      // the constellation network when enabled
      if (opts.connections) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = Math.max(0.5, opts.lineWidth * 0.5);
        if (opts.connectionGlow) {
          ctx.shadowColor = opts.color;
          ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        ctx.moveTo(px(focusPoint), py(focusPoint));
        ctx.lineTo(insetX + insetSize / 2, insetY + insetSize / 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = opts.color;
      ctx.lineWidth = opts.lineWidth;
      ctx.globalAlpha = 0.85;
      ctx.strokeRect(insetX, insetY, insetSize, insetSize);

      if (opts.showLabels) {
        const lbl = `${opts.zoomLabel.trim() || DEFAULT_ZOOM_LABEL} ${uid()}`;
        ctx.globalAlpha = 0.9;
        const tw = ctx.measureText(lbl).width;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(insetX, insetY + insetSize + 2, tw + 8, fontSize + 4);
        ctx.fillStyle = opts.color;
        ctx.fillText(lbl, insetX + 4, insetY + insetSize + 4);
      }

      // Resize handle — shown only in the interactive editor, not on export
      if (interactive) {
        const handle = Math.max(10, insetSize * 0.07);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = opts.color;
        ctx.fillRect(insetX + insetSize - handle, insetY + insetSize - handle, handle, handle);
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    });
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
    case "thermal":
      ctx.drawImage(src, 0, 0, w, h);
      applyThermal(ctx, w, h);
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

// Thermal-camera "ironbow" palette — maps luminance through a multi-stop
// black → blue → magenta → orange → white ramp
const THERMAL_STOPS: [number, number, number, number][] = [
  [0.00, 0, 0, 0],
  [0.2, 40, 0, 120],
  [0.4, 160, 0, 140],
  [0.6, 230, 60, 20],
  [0.8, 250, 180, 20],
  [1.00, 255, 255, 255],
];

function thermalColor(lum: number): [number, number, number] {
  for (let i = 0; i < THERMAL_STOPS.length - 1; i++) {
    const [t0, r0, g0, b0] = THERMAL_STOPS[i];
    const [t1, r1, g1, b1] = THERMAL_STOPS[i + 1];
    if (lum >= t0 && lum <= t1) {
      const t = (lum - t0) / (t1 - t0);
      return [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t];
    }
  }
  return [255, 255, 255];
}

function applyThermal(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    const [r, g, b] = thermalColor(lum);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
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
