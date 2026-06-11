"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  detectPoints,
  drawOverlay,
  loadDetector,
  TrackedPoint,
  DrawOptions,
  DEFAULT_REGION_LABELS,
  DEFAULT_ZOOM_LABEL,
  DEFAULT_LABEL_FONT,
  LABEL_FONTS,
  FILTERS,
} from "@/lib/tracker";
import { downloadBlob, timestampName } from "@/lib/export";

// ─── Types ────────────────────────────────────────────────────────────────

type Status = "idle" | "loading-model" | "detecting" | "done" | "no-person" | "error";

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
  zoomFocus: [],
  regionLabels: [...DEFAULT_REGION_LABELS],
  zoomLabel: DEFAULT_ZOOM_LABEL,
  labelFont: DEFAULT_LABEL_FONT,
  filter: "none",
  boxJitter: 0,
};

const inputCls =
  "w-full rounded bg-[var(--panel-2)] px-2.5 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-red";

// ─── Sub-components ───────────────────────────────────────────────────────

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="label">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 rounded-full transition-colors ${value ? "bg-red" : "bg-[var(--line)]"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "left-4" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line pb-4">
      <p className="label mb-3">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function TrackerStudio() {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [points, setPoints] = useState<TrackedPoint[]>([]);
  const [opts, setOpts] = useState<DrawOptions>(DEFAULT);
  const [status, setStatus] = useState<Status>("idle");
  const [dragging, setDragging] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  // Bumped by the "Embaralhar" button to force a redraw with fresh random
  // box jitter / inset placement, without otherwise changing opts
  const [shuffleTick, setShuffleTick] = useState(0);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof DrawOptions>(key: K, val: DrawOptions[K]) =>
    setOpts((o) => ({ ...o, [key]: val }));

  // Size the canvas to the image and draw the first frame once it's mounted
  // (the <canvas> only enters the DOM after imgSrc is set, so this can't
  // happen synchronously inside the image's onload handler).
  useEffect(() => {
    if (!imgSrc || !canvasRef.current || !imgRef.current) return;
    const img = imgRef.current;
    const maxW = 900;
    const scale = Math.min(1, maxW / img.naturalWidth);
    canvasRef.current.width = Math.round(img.naturalWidth * scale);
    canvasRef.current.height = Math.round(img.naturalHeight * scale);
    const ctx = canvasRef.current.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
  }, [imgSrc]);

  // Redraw whenever options or points change (or "Embaralhar" is pressed)
  useEffect(() => {
    if (!canvasRef.current || !imgRef.current || !points.length) return;
    drawOverlay(canvasRef.current, imgRef.current, points, opts);
  }, [opts, points, shuffleTick]);

  const mountImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgSrc(url);
      setPoints([]);
      setStatus("idle");
      set("zoomFocus", []);
    };
    img.src = url;
  }, []);

  // Click a keypoint dot to add/remove it from the zoom-inset focus list.
  // Only active while "Zoom inset" is enabled — that toggle is the master on/off.
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!opts.zoomInset || !points.length) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const cy = ((e.clientY - rect.top) / rect.height) * canvas.height;

      let nearest: TrackedPoint | null = null;
      let nearestDist = Infinity;
      for (const p of points) {
        const dist = Math.hypot(p.x * canvas.width - cx, p.y * canvas.height - cy);
        if (dist < nearestDist) { nearestDist = dist; nearest = p; }
      }
      const hitRadius = Math.max(opts.dotRadius * 2.5, 14);
      if (nearest && nearestDist <= hitRadius) {
        set(
          "zoomFocus",
          opts.zoomFocus.includes(nearest.name)
            ? opts.zoomFocus.filter((n) => n !== nearest!.name)
            : [...opts.zoomFocus, nearest.name]
        );
      }
    },
    [opts.zoomInset, opts.zoomFocus, opts.dotRadius, points]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f?.type.startsWith("image/")) mountImage(f);
    },
    [mountImage]
  );

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) mountImage(f);
    },
    [mountImage]
  );

  const detect = useCallback(async () => {
    if (!imgRef.current) return;
    setStatus("loading-model");
    const ok = await loadDetector();
    if (!ok) { setStatus("error"); return; }
    setStatus("detecting");
    const pts = await detectPoints(imgRef.current);
    if (!pts.length) { setStatus("no-person"); return; }
    setPoints(pts);
    if (canvasRef.current) drawOverlay(canvasRef.current, imgRef.current, pts, opts);
    setStatus("done");
  }, [opts]);

  // Auto-detect right after a new image is mounted, when enabled
  useEffect(() => {
    if (!imgSrc || !autoDetect) return;
    void detect();
    // Only re-trigger when a *new* image is mounted — not on every opts/detect change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgSrc, autoDetect]);

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

  const busy = status === "loading-model" || status === "detecting";

  return (
    <main className="flex flex-1 overflow-hidden">
      {/* ── Canvas area ─────────────────────────────────────────────────── */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden bg-ink p-6"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {!imgSrc ? (
          <div
            className={`flex flex-col items-center gap-5 rounded-xl border-2 border-dashed p-20 text-center transition-colors ${
              dragging ? "border-red bg-red/5" : "border-line"
            }`}
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold tracking-tight text-[var(--text)]">
                Arraste uma imagem com pessoa
              </p>
              <p className="text-[11px] text-muted">
                PNG, JPG, WEBP — o modelo IA detecta o corpo automaticamente
              </p>
            </div>
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded bg-red px-5 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              Selecionar arquivo
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            title={opts.zoomInset ? "Clique em um ponto para focar o zoom de detalhe" : undefined}
            className={`max-h-full max-w-full rounded-lg shadow-2xl ${opts.zoomInset && points.length ? "cursor-crosshair" : ""}`}
          />
        )}

        {/* Drag overlay */}
        {imgSrc && dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-red bg-red/10">
            <p className="text-sm font-semibold text-red">Soltar para trocar imagem</p>
          </div>
        )}

        {/* Status badge */}
        {busy && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-line bg-[var(--panel)] px-4 py-2 text-[11px] text-muted">
            {status === "loading-model" ? "Carregando modelo IA…" : "Detectando pontos do corpo…"}
          </div>
        )}
      </div>

      {/* ── Controls panel ──────────────────────────────────────────────── */}
      <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-[var(--panel)]">
        <div className="thin-scroll flex-1 overflow-y-auto p-4 space-y-4">

          {/* Detection behavior */}
          <Section title="Detecção">
            <Toggle
              label="Detectar ao subir imagem"
              value={autoDetect}
              onChange={setAutoDetect}
            />
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
                  className={`truncate rounded border px-2 py-2 text-[12px] leading-none transition-colors ${
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
              <div className="flex items-center justify-between gap-2 rounded bg-[var(--panel-2)] px-2.5 py-1.5">
                <span className="text-[10px] leading-snug text-muted">
                  {opts.zoomFocus.length
                    ? `Foco: ${opts.zoomFocus.length} ponto${opts.zoomFocus.length > 1 ? "s" : ""}`
                    : "Clique em pontos da imagem para focar o zoom (pode escolher vários)"}
                </span>
                {opts.zoomFocus.length > 0 && (
                  <button
                    onClick={() => set("zoomFocus", [])}
                    className="shrink-0 rounded border border-line px-2 py-1 text-[10px] text-muted hover:border-muted hover:text-[var(--text)]"
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}
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
              className="w-full rounded border border-line py-2 text-[11px] text-muted hover:border-muted hover:text-[var(--text)] disabled:opacity-40"
            >
              Embaralhar
            </button>
          </Section>

          {/* Creative filters */}
          <Section title="Filtro de imagem">
            <div className="grid grid-cols-2 gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => set("filter", f.id)}
                  className={`rounded border px-2 py-1.5 text-[11px] transition-colors ${
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

          {/* Effects */}
          <Section title="Efeitos">
            <Toggle label="Scanlines" value={opts.scanlines} onChange={(v) => set("scanlines", v)} />
            <Toggle label="Grain / ruído" value={opts.grain} onChange={(v) => set("grain", v)} />
            <Toggle label="Vignette" value={opts.vignette} onChange={(v) => set("vignette", v)} />
          </Section>

          {/* New image button */}
          {imgSrc && (
            <button
              onClick={() => { inputRef.current?.click(); }}
              className="w-full rounded border border-line py-2 text-[11px] text-muted hover:border-muted hover:text-[var(--text)]"
            >
              Trocar imagem
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>

        {/* Footer */}
        <div className="border-t border-line px-4 py-4 space-y-2">
          {status === "no-person" && (
            <p className="text-center text-[11px] text-red">Nenhuma pessoa detectada na imagem</p>
          )}
          {status === "error" && (
            <p className="text-center text-[11px] text-red">Erro ao carregar modelo</p>
          )}

          <button
            onClick={detect}
            disabled={!imgSrc || busy}
            className="w-full rounded bg-red py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {status === "loading-model"
              ? "Carregando modelo IA…"
              : status === "detecting"
              ? "Detectando…"
              : "Detectar automaticamente"}
          </button>

          {status === "done" && (
            <button
              onClick={exportPNG}
              className="w-full rounded border border-line py-2.5 text-xs font-medium text-muted hover:border-muted hover:text-[var(--text)]"
            >
              Exportar PNG
            </button>
          )}
        </div>
      </aside>
    </main>
  );
}
