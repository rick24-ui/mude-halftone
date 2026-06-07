export interface TrackedPoint {
  name: string;
  x: number; // normalized 0–1
  y: number; // normalized 0–1
  score: number;
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
}

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
  zoom?: boolean;
}

const REGIONS: Region[] = [
  { label: "Driving power chain", keys: ["right_shoulder", "right_elbow", "right_wrist"] },
  { label: "Kinetic arc vector", keys: ["left_shoulder", "left_elbow", "left_wrist"] },
  { label: "Core transfer chain", keys: ["left_shoulder", "right_shoulder", "left_hip", "right_hip"] },
  { label: "Hovering point", keys: ["nose", "left_shoulder", "right_shoulder"] },
  { label: "Ground contact", keys: ["right_knee", "right_ankle"], zoom: true },
  { label: "Anchor node", keys: ["left_knee", "left_ankle"] },
];

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
  ctx.drawImage(src, 0, 0, w, h);

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

  // ── Region boxes + labels ───────────────────────────────────────────────
  const pad = w * 0.038;
  const fontSize = Math.max(10, w * 0.012);
  ctx.font = `${fontSize}px "Geist Mono", ui-monospace, monospace`;
  ctx.textBaseline = "top";

  let zoomRegion: { bx: number; by: number; bw: number; bh: number } | null = null;

  interface ValidRegion extends Region { pts: TrackedPoint[]; avgScore: number; id: string; }

  const validRegions: ValidRegion[] = REGIONS.map((rg) => {
    const pts = rg.keys
      .map((k) => map.get(k))
      .filter((p): p is TrackedPoint => p !== undefined);
    if (pts.length < Math.min(2, rg.keys.length)) return null;
    const avgScore = pts.reduce((s, p) => s + p.score, 0) / pts.length;
    return { ...rg, pts, avgScore, id: uid() } as ValidRegion;
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

    if (rg.zoom) {
      zoomRegion = { bx, by, bw, bh };
    }
  });

  // ── Zoom inset ──────────────────────────────────────────────────────────
  if (opts.zoomInset && zoomRegion) {
    const { bx, by, bw, bh } = zoomRegion as { bx: number; by: number; bw: number; bh: number };
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
      const lbl = `Strike zone ${uid()}`;
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
