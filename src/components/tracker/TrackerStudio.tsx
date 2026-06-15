"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  detectPoints,
  detectEnvironmentPoints,
  drawOverlay,
  loadDetector,
  placeZoomInset,
  TrackedPoint,
  DrawOptions,
  ZoomInsetState,
  TrackMode,
  MAX_VIDEO_DURATION,
  DEFAULT_REGION_LABELS,
  DEFAULT_ZOOM_LABEL,
  DEFAULT_LABEL_FONT,
  LABEL_FONTS,
  FILTERS,
  REGION_FILTERS,
  MARKER_STYLES,
  BOX_STYLES,
} from "@/lib/tracker";
import { downloadBlob, timestampName } from "@/lib/export";
import { Section, Toggle } from "@/components/dock/controls";
import EffectsDock from "@/components/EffectsDock";

// ─── Types ────────────────────────────────────────────────────────────────

type Status = "idle" | "loading-model" | "detecting" | "done" | "no-person" | "error";
type MediaType = "image" | "video";

const TRACK_MODES: { id: TrackMode; label: string; hint: string }[] = [
  { id: "person", label: "Pessoa", hint: "Detecta o corpo da pessoa com IA (pose)." },
  { id: "environment", label: "Ambiente", hint: "Rastreia pontos de contraste do ambiente — fundos, objetos, texturas." },
];

function formatTime(s: number): string {
  return `${s.toFixed(1)}s`;
}

function lerpPoints(prev: TrackedPoint[], target: TrackedPoint[], t: number): TrackedPoint[] {
  if (!prev.length || prev.length !== target.length) return target;
  const prevMap = new Map(prev.map((p) => [p.name, p]));
  return target.map((tp) => {
    const pp = prevMap.get(tp.name);
    if (!pp) return tp;
    return { ...tp, x: pp.x + (tp.x - pp.x) * t, y: pp.y + (tp.y - pp.y) * t };
  });
}

// #rrggbb → rgba(...) — used to tint each "layer" card in the history panel
// with the accent color that was active when that change was made
function hexToRgba(hex: string, alpha: number): string {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const TRACK_SPEED_RANGE = { min: 0.08, max: 0.9 };
const TRACK_DENSITY_RANGE = { min: 1, max: 10 };

// Maps the "densidade" slider (1–10) to how often detection re-runs during
// playback — denser = more frequent target updates for the smoothing loop
function detectIntervalMs(density: number): number {
  const t = (density - TRACK_DENSITY_RANGE.min) / (TRACK_DENSITY_RANGE.max - TRACK_DENSITY_RANGE.min);
  return Math.round(260 - t * 210); // density 1 → 260ms, density 10 → 50ms
}

// Maps the "densidade" slider to how many feature points "Ambiente" mode tracks
function envPointCount(density: number): number {
  const t = (density - TRACK_DENSITY_RANGE.min) / (TRACK_DENSITY_RANGE.max - TRACK_DENSITY_RANGE.min);
  return Math.round(4 + t * 10); // density 1 → 4 points, density 10 → 14 points
}

// Picks the best video container/codec the browser's MediaRecorder supports,
// preferring MP4/H.264 for compatibility and falling back to WebM
function pickRecorderFormat(): { mimeType: string; ext: string } {
  const candidates: { mimeType: string; ext: string }[] = [
    { mimeType: "video/mp4;codecs=avc1.42E01E", ext: "mp4" },
    { mimeType: "video/mp4;codecs=h264", ext: "mp4" },
    { mimeType: "video/mp4", ext: "mp4" },
    { mimeType: "video/webm;codecs=vp9", ext: "webm" },
    { mimeType: "video/webm;codecs=vp8", ext: "webm" },
    { mimeType: "video/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: "video/webm", ext: "webm" };
}

// Draws an <img> onto a same-size offscreen canvas — used so the environment
// feature detector (which reads pixel data) can run on still images too
function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c;
}

const COLORS = [
  { id: "white", label: "White", hex: "#ffffff" },
  { id: "gold", label: "Gold", hex: "#d4a853" },
  { id: "cyan", label: "Cyan", hex: "#00d4ff" },
  { id: "red", label: "Red", hex: "#e8143c" },
  { id: "lime", label: "Lime", hex: "#aaff44" },
];

const DEFAULT: DrawOptions = {
  color: "#ffffff",
  showKeypoints: true,
  showSkeleton: true,
  showBoxes: true,
  showLabels: true,
  lineWidth: 1.2,
  dotRadius: 4,
  scanlines: false,
  grain: false,
  vignette: false,
  zoomInset: true,
  zoomInsets: [],
  regionLabels: [...DEFAULT_REGION_LABELS],
  zoomLabel: DEFAULT_ZOOM_LABEL,
  labelFont: DEFAULT_LABEL_FONT,
  filter: "none",
  boxJitter: 0,
  dotGlow: false,
  markerStyle: "dot",
  boxStyle: "rect",
  connections: false,
  connectionDensity: 0.4,
  connectionGlow: false,
  showCoords: false,
  regionFilters: DEFAULT_REGION_LABELS.map(() => "none" as const),
  insetFilter: "none",
};

// ─── History / "layers" panel ──────────────────────────────────────────────

type Snap = { opts: DrawOptions; trackMode: TrackMode; trackSpeed: number; trackDensity: number };

interface HistoryEntry {
  id: number;
  label: string;
  color: string;
  time: string;
  snapshot: Snap;
}

// Produces a short human-readable label for the single most relevant change
// between two snapshots — used to build the history/layers list. Discrete
// changes (clicks/toggles/selects) commit immediately; continuous ones
// (sliders) are flagged for a debounced commit so dragging doesn't spam entries.
function describeChange(prev: Snap, next: Snap): { label: string; debounce: boolean } | null {
  if (prev.trackMode !== next.trackMode) {
    return { label: `Modo: ${TRACK_MODES.find((m) => m.id === next.trackMode)?.label ?? next.trackMode}`, debounce: false };
  }

  const po = prev.opts;
  const no = next.opts;

  if (po.zoomInsets.length !== no.zoomInsets.length) {
    return { label: no.zoomInsets.length > po.zoomInsets.length ? "Zoom inset adicionado" : "Zoom inset removido", debounce: false };
  }
  if (JSON.stringify(po.zoomInsets) !== JSON.stringify(no.zoomInsets)) {
    return { label: "Zoom inset ajustado", debounce: true };
  }
  if (po.color !== no.color) {
    return { label: `Cor: ${COLORS.find((c) => c.hex === no.color)?.label ?? no.color}`, debounce: false };
  }
  if (po.filter !== no.filter) {
    return { label: `Filtro: ${FILTERS.find((f) => f.id === no.filter)?.label ?? no.filter}`, debounce: false };
  }
  if (po.insetFilter !== no.insetFilter) {
    return { label: `Efeito no zoom: ${REGION_FILTERS.find((f) => f.id === no.insetFilter)?.label ?? no.insetFilter}`, debounce: false };
  }
  if (JSON.stringify(po.regionFilters) !== JSON.stringify(no.regionFilters)) {
    const idx = po.regionFilters.findIndex((f, i) => f !== no.regionFilters[i]);
    const customLabel = idx >= 0 ? no.regionLabels[idx]?.trim() : undefined;
    const region = customLabel || DEFAULT_REGION_LABELS[idx] || `Região ${idx + 1}`;
    const filterLabel = REGION_FILTERS.find((f) => f.id === no.regionFilters[idx])?.label ?? "—";
    return { label: `${region}: ${filterLabel}`, debounce: false };
  }
  if (po.markerStyle !== no.markerStyle) {
    return { label: `Pontos: ${MARKER_STYLES.find((m) => m.id === no.markerStyle)?.label ?? no.markerStyle}`, debounce: false };
  }
  if (po.boxStyle !== no.boxStyle) {
    return { label: `Quadros: ${BOX_STYLES.find((b) => b.id === no.boxStyle)?.label ?? no.boxStyle}`, debounce: false };
  }
  if (po.labelFont !== no.labelFont) {
    return { label: `Fonte: ${LABEL_FONTS.find((f) => f.family === no.labelFont)?.label ?? "personalizada"}`, debounce: false };
  }

  const boolFields: [keyof DrawOptions, string][] = [
    ["showKeypoints", "Pontos"],
    ["showSkeleton", "Esqueleto"],
    ["showBoxes", "Boxes"],
    ["showLabels", "Labels"],
    ["zoomInset", "Zoom inset"],
    ["dotGlow", "Glow nos pontos"],
    ["connections", "Rede de conexões"],
    ["connectionGlow", "Glow na rede"],
    ["showCoords", "Coordenadas"],
    ["scanlines", "Scanlines"],
    ["grain", "Grain"],
    ["vignette", "Vignette"],
  ];
  for (const [key, label] of boolFields) {
    if (po[key] !== no[key]) {
      return { label: `${label}: ${no[key] ? "ativado" : "desativado"}`, debounce: false };
    }
  }

  if (po.lineWidth !== no.lineWidth) return { label: `Espessura da linha: ${no.lineWidth.toFixed(1)}px`, debounce: true };
  if (po.dotRadius !== no.dotRadius) return { label: `Tamanho do ponto: ${no.dotRadius}px`, debounce: true };
  if (po.boxJitter !== no.boxJitter) return { label: `Aleatoriedade: ${Math.round(no.boxJitter * 100)}%`, debounce: true };
  if (po.connectionDensity !== no.connectionDensity) return { label: `Densidade da rede: ${Math.round(no.connectionDensity * 100)}%`, debounce: true };

  if (prev.trackSpeed !== next.trackSpeed) return { label: `Velocidade de troca: ${Math.round(next.trackSpeed * 100)}%`, debounce: true };
  if (prev.trackDensity !== next.trackDensity) return { label: `Densidade: ${next.trackDensity}`, debounce: true };

  return null;
}

const DEFAULT_INSET_SIZE = 0.22;
const MIN_INSET_SIZE = 0.08;
const MAX_INSET_SIZE = 0.55;

const inputCls =
  "w-full rounded-lg bg-[var(--panel-2)] px-2.5 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-red";

// ─── Main Component ───────────────────────────────────────────────────────

export default function TrackerStudio() {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [points, setPoints] = useState<TrackedPoint[]>([]);
  const [opts, setOpts] = useState<DrawOptions>(DEFAULT);
  const [status, setStatus] = useState<Status>("idle");
  const [dragging, setDragging] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  const [trackMode, setTrackMode] = useState<TrackMode>("person");
  // How fast displayed points catch up to new detections (0.08–0.9) and how
  // often/dense detection re-runs during video playback (1–10)
  const [trackSpeed, setTrackSpeed] = useState(0.35);
  const [trackDensity, setTrackDensity] = useState(5);
  // Bumped by the "Embaralhar" button to force a redraw with fresh random
  // box jitter / inset placement, without otherwise changing opts
  const [shuffleTick, setShuffleTick] = useState(0);

  // Video playback / timeline state
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoTruncated, setVideoTruncated] = useState(false);
  const [exportingVideo, setExportingVideo] = useState(false);

  // History of meaningful option/mode changes, shown as a stack of "layers" —
  // most recent first, click to restore that snapshot
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Offscreen canvas holding the current video frame — fed into detection
  // and drawOverlay as the "source" image
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef(0);
  // Latest detection result (updated every ~throttle interval) and the
  // smoothed/interpolated points actually drawn each frame during playback
  const framePointsRef = useRef<TrackedPoint[]>([]);
  const displayPointsRef = useRef<TrackedPoint[]>([]);
  // History/layers bookkeeping: last seen snapshot, pending debounce timer,
  // a flag to avoid re-logging a change caused by restoring a past entry,
  // and a monotonic id counter for React keys
  const prevSnapRef = useRef<Snap | null>(null);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoringRef = useRef(false);
  const historyIdRef = useRef(0);

  const set = <K extends keyof DrawOptions>(key: K, val: DrawOptions[K]) =>
    setOpts((o) => ({ ...o, [key]: val }));

  // Size the canvas to the image and draw the first frame once it's mounted
  // (the <canvas> only enters the DOM after imgSrc is set, so this can't
  // happen synchronously inside the image's onload handler).
  useEffect(() => {
    if (mediaType !== "image" || !imgSrc || !canvasRef.current || !imgRef.current) return;
    const img = imgRef.current;
    const maxW = 900;
    const scale = Math.min(1, maxW / img.naturalWidth);
    canvasRef.current.width = Math.round(img.naturalWidth * scale);
    canvasRef.current.height = Math.round(img.naturalHeight * scale);
    const ctx = canvasRef.current.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
  }, [imgSrc, mediaType]);

  // Redraw whenever options or points change (or "Embaralhar" is pressed)
  useEffect(() => {
    if (mediaType !== "image" || !canvasRef.current || !imgRef.current || !points.length) return;
    drawOverlay(canvasRef.current, imgRef.current, points, opts, { interactive: true });
  }, [opts, points, shuffleTick, mediaType]);

  const mountFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setPoints([]);
    setStatus("idle");
    setOpts((o) => ({ ...o, zoomInsets: [] }));

    if (file.type.startsWith("video/")) {
      imgRef.current = null;
      setImgSrc(null);
      setMediaType("video");
      setPlaying(false);
      setCurrentTime(0);
      setVideoDuration(0);
      setVideoTruncated(false);
      setVideoSrc(url);
    } else {
      setVideoSrc(null);
      setMediaType("image");
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        setImgSrc(url);
      };
      img.src = url;
    }
  }, []);

  // Tracks an in-progress drag (move or resize) of a zoom inset
  const dragRef = useRef<{
    mode: "move" | "resize";
    index: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const canvasPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  // Pointer down: either start dragging/resizing an existing zoom inset, or
  // — if it lands near a keypoint dot — toggle a new inset on/off for that point.
  const handlePointerDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!opts.zoomInset || !points.length) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { x: cx, y: cy } = canvasPoint(e);
      const w = canvas.width;
      const h = canvas.height;

      // Check resize handles / inset bodies first (topmost = last drawn = last in array)
      for (let i = opts.zoomInsets.length - 1; i >= 0; i--) {
        const inset = opts.zoomInsets[i];
        const ix = inset.x * w;
        const iy = inset.y * h;
        const isize = inset.size * Math.min(w, h);
        const handle = Math.max(10, isize * 0.07);

        const onHandle =
          cx >= ix + isize - handle && cx <= ix + isize + handle / 2 &&
          cy >= iy + isize - handle && cy <= iy + isize + handle / 2;
        if (onHandle) {
          dragRef.current = { mode: "resize", index: i, offsetX: 0, offsetY: 0 };
          return;
        }

        const inBody = cx >= ix && cx <= ix + isize && cy >= iy && cy <= iy + isize;
        if (inBody) {
          dragRef.current = { mode: "move", index: i, offsetX: cx - ix, offsetY: cy - iy };
          return;
        }
      }

      // Otherwise, check for a keypoint dot — toggle inset on/off
      let nearest: TrackedPoint | null = null;
      let nearestDist = Infinity;
      for (const p of points) {
        const dist = Math.hypot(p.x * w - cx, p.y * h - cy);
        if (dist < nearestDist) { nearestDist = dist; nearest = p; }
      }
      const hitRadius = Math.max(opts.dotRadius * 2.5, 14);
      if (nearest && nearestDist <= hitRadius) {
        const existingIdx = opts.zoomInsets.findIndex((i) => i.point === nearest!.name);
        if (existingIdx >= 0) {
          set("zoomInsets", opts.zoomInsets.filter((_, i) => i !== existingIdx));
        } else {
          const pos = placeZoomInset(nearest.x, nearest.y, w, h, DEFAULT_INSET_SIZE);
          const next: ZoomInsetState = { point: nearest.name, x: pos.x, y: pos.y, size: DEFAULT_INSET_SIZE };
          set("zoomInsets", [...opts.zoomInsets, next]);
        }
      }
    },
    [opts.zoomInset, opts.zoomInsets, opts.dotRadius, points, canvasPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { x: cx, y: cy } = canvasPoint(e);
      const w = canvas.width;
      const h = canvas.height;
      const minDim = Math.min(w, h);

      setOpts((o) => {
        const inset = o.zoomInsets[drag.index];
        if (!inset) return o;
        let next: ZoomInsetState;
        if (drag.mode === "move") {
          const x = (cx - drag.offsetX) / w;
          const y = (cy - drag.offsetY) / h;
          const maxX = 1 - inset.size * minDim / w;
          const maxY = 1 - inset.size * minDim / h;
          next = { ...inset, x: Math.min(Math.max(0, x), Math.max(0, maxX)), y: Math.min(Math.max(0, y), Math.max(0, maxY)) };
        } else {
          const ix = inset.x * w;
          const iy = inset.y * h;
          const size = Math.max(cx - ix, cy - iy) / minDim;
          next = { ...inset, size: Math.min(MAX_INSET_SIZE, Math.max(MIN_INSET_SIZE, size)) };
        }
        const insets = [...o.zoomInsets];
        insets[drag.index] = next;
        return { ...o, zoomInsets: insets };
      });
    },
    [canvasPoint]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f?.type.startsWith("image/") || f?.type.startsWith("video/")) mountFile(f);
    },
    [mountFile]
  );

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) mountFile(f);
    },
    [mountFile]
  );

  const detect = useCallback(async () => {
    if (!imgRef.current) return;

    if (trackMode === "environment") {
      setStatus("detecting");
      const pts = detectEnvironmentPoints(imageToCanvas(imgRef.current), envPointCount(trackDensity));
      setPoints(pts);
      if (canvasRef.current) drawOverlay(canvasRef.current, imgRef.current, pts, opts);
      setStatus("done");
      return;
    }

    setStatus("loading-model");
    const ok = await loadDetector();
    if (!ok) { setStatus("error"); return; }
    setStatus("detecting");
    const pts = await detectPoints(imgRef.current);
    if (!pts.length) { setStatus("no-person"); return; }
    setPoints(pts);
    if (canvasRef.current) drawOverlay(canvasRef.current, imgRef.current, pts, opts);
    setStatus("done");
  }, [opts, trackMode, trackDensity]);

  // Auto-detect right after a new image is mounted, when enabled
  useEffect(() => {
    if (mediaType !== "image" || !imgSrc || !autoDetect) return;
    void detect();
    // Only re-trigger when a *new* image is mounted — not on every opts/detect change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgSrc, autoDetect, mediaType]);

  // ── Video ────────────────────────────────────────────────────────────────

  // Called once the video's dimensions/duration are known — sizes the
  // display canvas and the offscreen frame buffer, and applies the
  // MAX_VIDEO_DURATION cap on the timeline.
  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (!frameCanvasRef.current) frameCanvasRef.current = document.createElement("canvas");
    const frameCanvas = frameCanvasRef.current;

    const maxW = 900;
    const scale = Math.min(1, maxW / video.videoWidth);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    canvas.width = w;
    canvas.height = h;
    frameCanvas.width = w;
    frameCanvas.height = h;

    setVideoDuration(Math.min(video.duration, MAX_VIDEO_DURATION));
    setVideoTruncated(video.duration > MAX_VIDEO_DURATION + 0.05);
    // Nudge off zero so a "seeked" event always fires, triggering the first
    // frame draw + detection below
    video.currentTime = 0.001;
  }, []);

  // Grabs the current video frame into the offscreen buffer and redraws the
  // overlay on top of it. Accepts an optional points override so the
  // playback loop can pass smoothed/interpolated positions.
  const drawVideoFrame = useCallback((pts: TrackedPoint[] = points) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const frameCanvas = frameCanvasRef.current;
    if (!video || !canvas || !frameCanvas) return;
    frameCanvas.getContext("2d")!.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
    drawOverlay(canvas, frameCanvas, pts, opts, { interactive: true });
  }, [points, opts]);

  // Keep the smoothing target in sync with the latest detection result
  useEffect(() => {
    framePointsRef.current = points;
  }, [points]);

  // Full detection pass on the current frame — updates status, used on
  // initial load / scrub / manual "Detectar" click
  const detectVideoFrame = useCallback(async () => {
    const frameCanvas = frameCanvasRef.current;
    if (!frameCanvas) return;

    if (trackMode === "environment") {
      setStatus("detecting");
      setPoints(detectEnvironmentPoints(frameCanvas, envPointCount(trackDensity)));
      setStatus("done");
      return;
    }

    setStatus("loading-model");
    const ok = await loadDetector();
    if (!ok) { setStatus("error"); return; }
    setStatus("detecting");
    const pts = await detectPoints(frameCanvas);
    setPoints(pts);
    setStatus(pts.length ? "done" : "no-person");
  }, [trackMode, trackDensity]);

  // Lightweight detection used inside the playback loop — skips status
  // churn so the badge doesn't flicker every ~throttle interval while playing
  const detectVideoFrameQuiet = useCallback(async () => {
    const frameCanvas = frameCanvasRef.current;
    if (!frameCanvas) return;
    if (trackMode === "environment") {
      setPoints(detectEnvironmentPoints(frameCanvas, envPointCount(trackDensity)));
    } else {
      if (!(await loadDetector())) return;
      const pts = await detectPoints(frameCanvas);
      if (pts.length) setPoints(pts);
    }
  }, [trackMode, trackDensity]);

  // Redraw whenever a new frame is grabbed via scrubbing
  useEffect(() => {
    const video = videoRef.current;
    if (!video || mediaType !== "video") return;
    const onSeeked = () => {
      drawVideoFrame();
      setCurrentTime(video.currentTime);
      if (autoDetect) void detectVideoFrame();
    };
    video.addEventListener("seeked", onSeeked);
    return () => video.removeEventListener("seeked", onSeeked);
  }, [mediaType, drawVideoFrame, detectVideoFrame, autoDetect]);

  // Redraw the current frame when options/points change while paused
  useEffect(() => {
    if (mediaType !== "video" || playing) return;
    drawVideoFrame();
  }, [opts, points, shuffleTick, mediaType, playing, drawVideoFrame]);

  // Re-run detection on the current frame/image when the track mode changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mediaType === "image" && imgSrc) void detect();
    else if (mediaType === "video" && videoSrc) void detectVideoFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackMode]);

  // Playback loop — draws every frame, runs throttled detection in the
  // background, and stops at the end of the (possibly truncated) timeline
  useEffect(() => {
    if (!playing) return;
    const video = videoRef.current;
    if (!video) return;

    const step = () => {
      const v = videoRef.current;
      if (!v) return;
      if (v.currentTime >= videoDuration || v.ended) {
        v.pause();
        setPlaying(false);
        return;
      }
      // Interpolate toward the latest detection result every frame, so
      // points (and anything anchored to them, like zoom insets) glide
      // smoothly at ~60fps instead of snapping every detection interval
      displayPointsRef.current = lerpPoints(displayPointsRef.current, framePointsRef.current, trackSpeed);
      drawVideoFrame(displayPointsRef.current);
      setCurrentTime(v.currentTime);
      const now = performance.now();
      if (now - lastDetectRef.current > detectIntervalMs(trackDensity)) {
        lastDetectRef.current = now;
        void detectVideoFrameQuiet();
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, videoDuration, drawVideoFrame, detectVideoFrameQuiet, trackSpeed, trackDensity]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      if (video.currentTime >= videoDuration) video.currentTime = 0;
      lastDetectRef.current = 0;
      // Snap the smoothing baseline to the current points so playback
      // doesn't lerp in from a stale position
      displayPointsRef.current = points;
      void video.play();
      setPlaying(true);
    }
  }, [playing, videoDuration, points]);

  const handleSeek = useCallback((t: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
      setPlaying(false);
    }
    video.currentTime = t;
  }, [playing]);

  // Runs detection on the current source, whether it's a still image or a video frame
  const runDetect = useCallback(() => {
    if (mediaType === "video") return detectVideoFrame();
    return detect();
  }, [mediaType, detect, detectVideoFrame]);

  // Scales line/dot sizes from the on-screen (downscaled) canvas to the
  // source video's native resolution, so exports look proportionally the
  // same as the live preview instead of having hairline strokes
  const exportOptsAt = useCallback((targetW: number): DrawOptions => {
    const displayW = canvasRef.current?.width || targetW;
    const scale = targetW / displayW;
    return { ...opts, lineWidth: opts.lineWidth * scale, dotRadius: opts.dotRadius * scale };
  }, [opts]);

  const exportVideoFramePNG = useCallback(() => {
    const video = videoRef.current;
    if (!video || !points.length) return;
    const frameSrc = document.createElement("canvas");
    frameSrc.width = video.videoWidth;
    frameSrc.height = video.videoHeight;
    frameSrc.getContext("2d")!.drawImage(video, 0, 0, frameSrc.width, frameSrc.height);

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = video.videoWidth;
    exportCanvas.height = video.videoHeight;
    drawOverlay(exportCanvas, frameSrc, points, exportOptsAt(video.videoWidth));
    exportCanvas.toBlob(
      (blob) => { if (blob) downloadBlob(blob, timestampName("rc-tracker-frame", "png")); },
      "image/png"
    );
  }, [points, exportOptsAt]);

  // Records a dedicated full-resolution offscreen canvas (matching the
  // source video's native size) with the live overlay while the clamped
  // video plays through once, then downloads the result as MP4 (or WebM as
  // a fallback if the browser can't record MP4)
  const exportVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoDuration) return;

    setExportingVideo(true);
    try {
      video.pause();
      setPlaying(false);
      await new Promise<void>((resolve) => {
        const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = 0;
      });

      const exportW = video.videoWidth;
      const exportH = video.videoHeight;
      const exportOpts = exportOptsAt(exportW);

      const exportFrame = document.createElement("canvas");
      exportFrame.width = exportW;
      exportFrame.height = exportH;
      const exportFrameCtx = exportFrame.getContext("2d")!;

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = exportW;
      exportCanvas.height = exportH;

      const { mimeType, ext } = pickRecorderFormat();
      const stream = exportCanvas.captureStream(30);
      // High bitrate scaled to resolution — keeps the export close to source quality
      const videoBitsPerSecond = Math.min(100_000_000, Math.round(exportW * exportH * 30 * 0.25));
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

      let exportDisplayPoints = framePointsRef.current;
      recorder.start();
      lastDetectRef.current = 0;
      displayPointsRef.current = points;
      await video.play();
      setPlaying(true);

      await new Promise<void>((resolve) => {
        const tick = () => {
          const v = videoRef.current;
          if (!v || v.currentTime >= videoDuration || v.ended) { resolve(); return; }
          exportFrameCtx.drawImage(v, 0, 0, exportW, exportH);
          exportDisplayPoints = lerpPoints(exportDisplayPoints, framePointsRef.current, trackSpeed);
          drawOverlay(exportCanvas, exportFrame, exportDisplayPoints, exportOpts);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      video.pause();
      setPlaying(false);
      recorder.stop();
      await stopped;

      const blob = new Blob(chunks, { type: mimeType });
      downloadBlob(blob, timestampName("rc-tracker", ext));
    } finally {
      setExportingVideo(false);
    }
  }, [videoDuration, points, exportOptsAt, trackSpeed]);

  const exportPNG = useCallback(() => {
    if (!imgRef.current || !points.length) return;
    const img = imgRef.current;
    // Re-render the overlay onto an offscreen canvas at the source image's
    // native resolution — the on-screen canvas is downscaled to fit the
    // viewport (max 900px wide), which would otherwise cap export quality.
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = img.naturalWidth;
    exportCanvas.height = img.naturalHeight;
    drawOverlay(exportCanvas, img, points, opts);
    exportCanvas.toBlob(
      (blob) => { if (blob) downloadBlob(blob, timestampName("rc-tracker", "png")); },
      "image/png"
    );
  }, [points, opts]);

  // Tracks meaningful changes to opts/trackMode/trackSpeed/trackDensity and
  // appends a labeled entry to the history/layers panel. Discrete changes
  // (toggles, selects) commit on the next tick; slider drags are debounced
  // so a single drag produces one entry instead of dozens. Restoring a past
  // entry sets restoringRef so the resulting change isn't logged again.
  useEffect(() => {
    const next: Snap = { opts, trackMode, trackSpeed, trackDensity };
    const prev = prevSnapRef.current;
    prevSnapRef.current = next;
    if (!prev) return;
    if (restoringRef.current) { restoringRef.current = false; return; }

    const change = describeChange(prev, next);
    if (!change) return;

    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      historyIdRef.current += 1;
      const entry: HistoryEntry = {
        id: historyIdRef.current,
        label: change.label,
        color: next.opts.color,
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        snapshot: next,
      };
      setHistory((h) => [entry, ...h].slice(0, 12));
    }, change.debounce ? 650 : 0);

    return () => {
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    };
  }, [opts, trackMode, trackSpeed, trackDensity]);

  // Jumps back to a past entry in the history/layers panel
  const restoreHistory = useCallback((entry: HistoryEntry) => {
    restoringRef.current = true;
    setOpts(entry.snapshot.opts);
    setTrackMode(entry.snapshot.trackMode);
    setTrackSpeed(entry.snapshot.trackSpeed);
    setTrackDensity(entry.snapshot.trackDensity);
  }, []);

  const busy = status === "loading-model" || status === "detecting";

  return (
    <main
      className="relative flex-1 overflow-hidden bg-ink"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {/* ── Ambient background — blurred reflection behind the glass panels ─ */}
      <div className="absolute inset-0 overflow-hidden">
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt="" className="h-full w-full scale-110 object-cover opacity-50 blur-3xl" />
        ) : videoSrc ? (
          <video src={videoSrc} muted loop autoPlay playsInline className="h-full w-full scale-110 object-cover opacity-50 blur-3xl" />
        ) : (
          <div className="ambient-glow h-full w-full" />
        )}
        <div className="absolute inset-0 bg-ink/55" />
      </div>

      {/* ── Centered media stage ─────────────────────────────────────────── */}
      <div className="absolute inset-0 flex items-center justify-center px-8 pr-[312px] pt-12 pb-28">
        {!imgSrc && !videoSrc ? (
          <div
            className={`flex flex-col items-center gap-5 rounded-xl border-2 border-dashed p-20 text-center transition-colors ${
              dragging ? "border-red bg-red/5" : "border-line"
            }`}
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold tracking-tight text-[var(--text)]">
                Arraste uma imagem ou vídeo com pessoa
              </p>
              <p className="text-[11px] text-muted">
                PNG, JPG, WEBP — ou MP4/WEBM de até {MAX_VIDEO_DURATION}s. O modelo IA detecta o corpo automaticamente
              </p>
            </div>
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-lg bg-red px-5 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              Selecionar arquivo
            </button>
          </div>
        ) : (
          <>
            {mediaType === "video" && (
              <video
                ref={videoRef}
                src={videoSrc ?? undefined}
                onLoadedMetadata={handleVideoLoaded}
                muted
                playsInline
                className="hidden"
              />
            )}
            <canvas
              ref={canvasRef}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              title={opts.zoomInset ? "Clique em um ponto para criar um zoom — arraste para mover, use o canto para redimensionar" : undefined}
              className={`max-h-full max-w-full rounded-2xl shadow-2xl ${opts.zoomInset && points.length ? "cursor-crosshair" : ""}`}
            />
          </>
        )}
      </div>

      {/* Drag overlay */}
      {(imgSrc || videoSrc) && dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-2 border-dashed border-red bg-red/10">
          <p className="rounded-full bg-[var(--ink)]/80 px-4 py-2 text-sm font-semibold text-red">Soltar para trocar mídia</p>
        </div>
      )}

      {/* Status badge */}
      {(busy || exportingVideo) && (
        <div className="glass absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-[11px] text-[var(--text)]">
          {exportingVideo
            ? "Exportando vídeo…"
            : status === "loading-model"
            ? "Carregando modelo IA…"
            : "Detectando pontos…"}
        </div>
      )}

      {/* ── Top-right pill — media actions ───────────────────────────────── */}
      <div className="glass absolute right-4 top-4 z-20 flex h-14 w-[170px] items-center justify-center rounded-full">
        <button
          onClick={() => inputRef.current?.click()}
          className="flex h-full w-full items-center justify-center gap-2 rounded-full px-4 text-[11px] font-medium text-[var(--text)] transition-colors hover:bg-white/10"
        >
          {(imgSrc || videoSrc) ? "Trocar mídia" : "Carregar mídia"}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />

      {/* ── Floating dock — controls ──────────────────────────────────────── */}
      <EffectsDock title="Tracking & Efeitos" raised={mediaType === "video" && videoDuration > 0}>
        <div className="flex h-full flex-col">
        <div className="thin-scroll flex-1 overflow-y-auto p-4 space-y-4">

          {/* Detection behavior */}
          <Section title="Detecção">
            <Toggle
              label="Detectar ao subir mídia"
              value={autoDetect}
              onChange={setAutoDetect}
            />
          </Section>

          {/* What the tracker should lock onto */}
          <Section title="Modo de captura">
            <div className="flex gap-1.5">
              {TRACK_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setTrackMode(m.id)}
                  title={m.hint}
                  className={`flex-1 rounded-full px-4 py-1.5 text-[11px] font-medium transition-colors ${
                    trackMode === m.id ? "bg-red text-white" : "text-muted hover:text-[var(--text)]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-snug text-muted">
              {TRACK_MODES.find((m) => m.id === trackMode)?.hint}
            </p>

            {mediaType === "video" && (
              <>
                <label className="block">
                  <div className="mb-1 flex justify-between">
                    <span className="label">Velocidade de troca</span>
                    <span className="mono text-[11px] text-[var(--text)]">{Math.round(trackSpeed * 100)}%</span>
                  </div>
                  <input
                    className="rng w-full"
                    type="range"
                    min={TRACK_SPEED_RANGE.min} max={TRACK_SPEED_RANGE.max} step={0.01}
                    value={trackSpeed}
                    onChange={(e) => setTrackSpeed(parseFloat(e.target.value))}
                  />
                  <p className="mt-1 text-[10px] leading-snug text-muted">
                    Quão rápido o tracking acompanha a nova posição — baixo fica suave/fluido, alto fica mais ágil.
                  </p>
                </label>
                <label className="block">
                  <div className="mb-1 flex justify-between">
                    <span className="label">Densidade</span>
                    <span className="mono text-[11px] text-[var(--text)]">{trackDensity}</span>
                  </div>
                  <input
                    className="rng w-full"
                    type="range"
                    min={TRACK_DENSITY_RANGE.min} max={TRACK_DENSITY_RANGE.max} step={1}
                    value={trackDensity}
                    onChange={(e) => setTrackDensity(parseInt(e.target.value))}
                  />
                  <p className="mt-1 text-[10px] leading-snug text-muted">
                    {trackMode === "environment"
                      ? "Quantos pontos de ambiente são rastreados e com que frequência a posição é atualizada."
                      : "Com que frequência a posição é re-analisada durante a reprodução."}
                  </p>
                </label>
              </>
            )}
          </Section>

          {/* Editable label texts */}
          <Section title="Textos das regiões">
            {DEFAULT_REGION_LABELS.map((defaultLabel, i) => (
              <label key={i} className="block">
                <span className="label mb-1 block">{`Região ${i + 1}`}</span>
                <input
                  type="text"
                  className={inputCls}
                  placeholder={defaultLabel}
                  value={opts.regionLabels[i] ?? ""}
                  onChange={(e) => {
                    const next = [...opts.regionLabels];
                    next[i] = e.target.value;
                    set("regionLabels", next);
                  }}
                />
              </label>
            ))}
            <label className="block">
              <span className="label mb-1 block">Zoom inset</span>
              <input
                type="text"
                className={inputCls}
                placeholder={DEFAULT_ZOOM_LABEL}
                value={opts.zoomLabel}
                onChange={(e) => set("zoomLabel", e.target.value)}
              />
            </label>
          </Section>

          {/* Label font */}
          <Section title="Fonte dos textos">
            <div className="grid grid-cols-2 gap-1.5">
              {LABEL_FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => set("labelFont", f.family)}
                  style={{ fontFamily: f.family }}
                  className={`truncate rounded-lg border px-2 py-2 text-[12px] leading-none transition-colors ${
                    opts.labelFont === f.family
                      ? "border-red bg-red/10 text-[var(--text)]"
                      : "border-line text-muted hover:text-[var(--text)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Color */}
          <Section title="Cor dos elementos">
            <div className="grid grid-cols-5 gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  title={c.label}
                  onClick={() => set("color", c.hex)}
                  className="group flex flex-col items-center gap-1"
                >
                  <span
                    className={`h-7 w-7 rounded-full border-2 transition-transform group-hover:scale-110 ${
                      opts.color === c.hex ? "border-red scale-110" : "border-line"
                    }`}
                    style={{ background: c.hex }}
                  />
                  <span className="label text-[9px]">{c.label}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* Tracking layers */}
          <Section title="Camadas de tracking">
            <Toggle label="Pontos (keypoints)" value={opts.showKeypoints} onChange={(v) => set("showKeypoints", v)} />
            <Toggle label="Esqueleto (linhas)" value={opts.showSkeleton} onChange={(v) => set("showSkeleton", v)} />
            <Toggle label="Bounding boxes" value={opts.showBoxes} onChange={(v) => set("showBoxes", v)} />
            <Toggle label="Labels técnicos" value={opts.showLabels} onChange={(v) => set("showLabels", v)} />
            <Toggle
              label="Zoom inset (detalhe)"
              value={opts.zoomInset}
              onChange={(v) => set("zoomInset", v)}
            />
            {opts.zoomInset && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--panel-2)] px-2.5 py-1.5">
                <span className="text-[10px] leading-snug text-muted">
                  {opts.zoomInsets.length
                    ? `${opts.zoomInsets.length} zoom${opts.zoomInsets.length > 1 ? "s" : ""} — arraste para mover, puxe o canto para redimensionar`
                    : "Clique em pontos da imagem para criar zooms (pode escolher vários)"}
                </span>
                {opts.zoomInsets.length > 0 && (
                  <button
                    onClick={() => set("zoomInsets", [])}
                    className="shrink-0 rounded-lg border border-line px-2 py-1 text-[10px] text-muted hover:border-muted hover:text-[var(--text)]"
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}
          </Section>

          {/* Marker / box shape — extra creative tracking styles */}
          <Section title="Estilo do tracking">
            <div>
              <span className="label mb-1.5 block">Forma dos pontos</span>
              <div className="grid grid-cols-3 gap-1.5">
                {MARKER_STYLES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => set("markerStyle", m.id)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${
                      opts.markerStyle === m.id
                        ? "border-red bg-red/10 text-[var(--text)]"
                        : "border-line text-muted hover:border-muted hover:text-[var(--text)]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <Toggle label="Glow nos pontos" value={opts.dotGlow} onChange={(v) => set("dotGlow", v)} />
            <div>
              <span className="label mb-1.5 block">Forma dos quadros</span>
              <div className="grid grid-cols-2 gap-1.5">
                {BOX_STYLES.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => set("boxStyle", b.id)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${
                      opts.boxStyle === b.id
                        ? "border-red bg-red/10 text-[var(--text)]"
                        : "border-line text-muted hover:border-muted hover:text-[var(--text)]"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* Line style */}
          <Section title="Espessura">
            <label className="block">
              <div className="mb-1 flex justify-between">
                <span className="label">Linha</span>
                <span className="mono text-[11px] text-[var(--text)]">{opts.lineWidth.toFixed(1)}px</span>
              </div>
              <input
                className="rng w-full"
                type="range" min={0.5} max={3} step={0.1}
                value={opts.lineWidth}
                onChange={(e) => set("lineWidth", parseFloat(e.target.value))}
              />
            </label>
            <label className="block">
              <div className="mb-1 flex justify-between">
                <span className="label">Ponto</span>
                <span className="mono text-[11px] text-[var(--text)]">{opts.dotRadius}px</span>
              </div>
              <input
                className="rng w-full"
                type="range" min={2} max={10} step={1}
                value={opts.dotRadius}
                onChange={(e) => set("dotRadius", parseInt(e.target.value))}
              />
            </label>
          </Section>

          {/* Random / dynamic boxes */}
          <Section title="Dinâmica">
            <label className="block">
              <div className="mb-1 flex justify-between">
                <span className="label">Aleatoriedade dos quadros</span>
                <span className="mono text-[11px] text-[var(--text)]">{Math.round(opts.boxJitter * 100)}%</span>
              </div>
              <input
                className="rng w-full"
                type="range" min={0} max={1} step={0.05}
                value={opts.boxJitter}
                onChange={(e) => set("boxJitter", parseFloat(e.target.value))}
              />
              <p className="mt-1 text-[10px] leading-snug text-muted">
                Faz os quadrados de tracking variarem de posição, tamanho e ângulo — deixa a composição mais dinâmica.
              </p>
            </label>
            <button
              onClick={() => setShuffleTick((t) => t + 1)}
              disabled={!points.length}
              className="w-full rounded-lg border border-line py-2 text-[11px] text-muted hover:border-muted hover:text-[var(--text)] disabled:opacity-40"
            >
              Embaralhar
            </button>
          </Section>

          {/* Constellation network — TouchDesigner-style connection lines */}
          <Section title="Rede de conexões">
            <Toggle label="Conectar pontos" value={opts.connections} onChange={(v) => set("connections", v)} />
            {opts.connections && (
              <label className="block">
                <div className="mb-1 flex justify-between">
                  <span className="label">Densidade da rede</span>
                  <span className="mono text-[11px] text-[var(--text)]">{Math.round(opts.connectionDensity * 100)}%</span>
                </div>
                <input
                  className="rng w-full"
                  type="range" min={0} max={1} step={0.05}
                  value={opts.connectionDensity}
                  onChange={(e) => set("connectionDensity", parseFloat(e.target.value))}
                />
              </label>
            )}
            {opts.connections && (
              <Toggle label="Glow nas linhas" value={opts.connectionGlow} onChange={(v) => set("connectionGlow", v)} />
            )}
            <Toggle label="Coordenadas flutuantes" value={opts.showCoords} onChange={(v) => set("showCoords", v)} />
          </Section>

          {/* Creative filters */}
          <Section title="Filtro de imagem">
            <div className="grid grid-cols-2 gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => set("filter", f.id)}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${
                    opts.filter === f.id
                      ? "border-red bg-red/10 text-[var(--text)]"
                      : "border-line text-muted hover:border-muted hover:text-[var(--text)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Per-region / per-inset effect overrides */}
          <Section title="Efeitos por região">
            {DEFAULT_REGION_LABELS.map((defaultLabel, i) => (
              <label key={i} className="block">
                <span className="label mb-1 block">{opts.regionLabels[i]?.trim() || defaultLabel}</span>
                <select
                  className={inputCls}
                  value={opts.regionFilters[i] ?? "none"}
                  onChange={(e) => {
                    const next = [...opts.regionFilters];
                    next[i] = e.target.value as DrawOptions["regionFilters"][number];
                    set("regionFilters", next);
                  }}
                >
                  {REGION_FILTERS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </label>
            ))}
            <label className="block">
              <span className="label mb-1 block">Efeito no zoom</span>
              <select
                className={inputCls}
                value={opts.insetFilter}
                onChange={(e) => set("insetFilter", e.target.value as DrawOptions["insetFilter"])}
              >
                {REGION_FILTERS.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </label>
          </Section>

          {/* Effects */}
          <Section title="Efeitos">
            <Toggle label="Scanlines" value={opts.scanlines} onChange={(v) => set("scanlines", v)} />
            <Toggle label="Grain / ruído" value={opts.grain} onChange={(v) => set("grain", v)} />
            <Toggle label="Vignette" value={opts.vignette} onChange={(v) => set("vignette", v)} />
          </Section>

        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-4 py-4 space-y-2">
          {status === "no-person" && (
            <p className="text-center text-[11px] text-red">
              {trackMode === "person" ? "Nenhuma pessoa detectada" : "Nenhum ponto detectado"}
            </p>
          )}
          {status === "error" && (
            <p className="text-center text-[11px] text-red">Erro ao carregar modelo</p>
          )}

          <button
            onClick={runDetect}
            disabled={(!imgSrc && !videoSrc) || busy}
            className="w-full rounded-lg bg-red py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {status === "loading-model"
              ? "Carregando modelo IA…"
              : status === "detecting"
              ? "Detectando…"
              : "Detectar automaticamente"}
          </button>

          {status === "done" && mediaType === "image" && (
            <button
              onClick={exportPNG}
              className="w-full rounded-lg border border-line py-2.5 text-xs font-medium text-muted hover:border-muted hover:text-[var(--text)]"
            >
              Exportar PNG
            </button>
          )}

          {mediaType === "video" && videoDuration > 0 && (
            <>
              <button
                onClick={exportVideoFramePNG}
                disabled={!points.length}
                className="w-full rounded-lg border border-line py-2.5 text-xs font-medium text-muted hover:border-muted hover:text-[var(--text)] disabled:opacity-40"
              >
                Exportar frame (PNG)
              </button>
              <button
                onClick={exportVideo}
                disabled={exportingVideo}
                className="w-full rounded-lg border border-line py-2.5 text-xs font-medium text-muted hover:border-muted hover:text-[var(--text)] disabled:opacity-40"
              >
                {exportingVideo ? "Exportando…" : "Exportar vídeo (MP4)"}
              </button>
            </>
          )}
        </div>
        </div>
      </EffectsDock>

      {/* Bottom player bar — video playback */}
      {mediaType === "video" && videoDuration > 0 && (
        <div className="glass absolute bottom-4 left-8 right-[312px] z-20 flex h-14 items-center gap-3 rounded-full px-4">
          <button
            onClick={togglePlay}
            aria-label={playing ? "Pausar" : "Tocar"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red text-white hover:opacity-90"
          >
            {playing ? (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
                <rect x="1" y="0" width="3.5" height="12" />
                <rect x="7.5" y="0" width="3.5" height="12" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
                <path d="M1 0 11 6 1 12Z" />
              </svg>
            )}
          </button>
          <input
            className="rng flex-1"
            type="range" min={0} max={videoDuration} step={0.01}
            value={Math.min(currentTime, videoDuration)}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
          />
          {videoTruncated && (
            <span className="mono shrink-0 rounded-full bg-red/20 px-2 py-0.5 text-[10px] text-red">
              MAX {MAX_VIDEO_DURATION}s
            </span>
          )}
          <span className="mono shrink-0 text-[11px] text-muted">
            {formatTime(currentTime)} / {formatTime(videoDuration)}
          </span>
        </div>
      )}

      {/* History / layers panel */}
      <div className="glass absolute bottom-4 right-4 z-20 flex max-h-[50vh] w-[280px] flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <p className="label">Histórico</p>
          {history.length > 0 && (
            <button
              onClick={() => setHistory([])}
              className="text-[10px] text-muted hover:text-[var(--text)]"
            >
              Limpar
            </button>
          )}
        </div>
        <div className="thin-scroll flex-1 overflow-y-auto px-3 pb-3">
          {history.length === 0 ? (
            <p className="px-1 py-2 text-[11px] leading-relaxed text-muted">
              As alterações de estilo aparecem aqui como camadas. Clique numa camada para voltar a esse ponto.
            </p>
          ) : (
            <div className="space-y-1.5">
              {history.map((h, i) => (
                <button
                  key={h.id}
                  onClick={() => restoreHistory(h)}
                  style={{
                    background: `linear-gradient(135deg, ${hexToRgba(h.color, 0.16)}, rgba(255,255,255,0.02))`,
                    opacity: Math.max(0.5, 1 - i * 0.05),
                  }}
                  className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left transition-opacity hover:border-white/20 hover:opacity-100"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: h.color, boxShadow: `0 0 8px ${h.color}` }}
                    />
                    <span className="flex-1 truncate text-[11px] text-[var(--text)]">{h.label}</span>
                  </div>
                  <p className="mono mt-1 text-[10px] text-muted">{h.time}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
