"use client";

import { useEffect, useRef, useState } from "react";
import Slider from "@/components/Slider";
import {
  BorderParams,
  DEFAULT_BORDER,
  BORDER_PRESETS,
  FORMAT_PRESETS,
  drawBorder,
  buildBorderSVG,
} from "@/lib/border";
import { timestampName, downloadBlob } from "@/lib/export";
import { Section, Toggle } from "@/components/dock/controls";
import EffectsDock from "@/components/EffectsDock";

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <span className="mono text-[11px] uppercase text-muted">{value}</span>
        <label className="h-6 w-6 cursor-pointer rounded-full border border-line" style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-full w-full cursor-pointer opacity-0" />
        </label>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="label">{label}</span>
      <input
        type="number"
        min={200}
        max={6000}
        value={value}
        onChange={(e) => onChange(Math.max(200, Math.min(6000, parseInt(e.target.value) || 0)))}
        className="w-24 rounded-lg bg-[var(--panel-2)] px-2 py-1.5 text-right text-[12px] outline-none focus:ring-1 focus:ring-red"
      />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="label shrink-0">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded-lg bg-[var(--panel-2)] px-2 py-1.5 text-right text-[12px] outline-none focus:ring-1 focus:ring-red"
      />
    </label>
  );
}

export default function BordersStudio() {
  const [p, setP] = useState<BorderParams>({ ...DEFAULT_BORDER });
  const [presetId, setPresetId] = useState<string | null>("frame");
  const [playing, setPlaying] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(0);
  const lastRef = useRef(performance.now());

  const set = <K extends keyof BorderParams>(k: K, v: BorderParams[K]) => {
    setP((prev) => ({ ...prev, [k]: v }));
    setPresetId(null);
  };

  const formatId = FORMAT_PRESETS.find((f) => f.width === p.width && f.height === p.height)?.id ?? null;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (playing) tRef.current += dt;
      const canvas = canvasRef.current;
      if (canvas) {
        if (canvas.width !== p.width) canvas.width = p.width;
        if (canvas.height !== p.height) canvas.height = p.height;
        const ctx = canvas.getContext("2d");
        if (ctx) drawBorder(ctx, p, tRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [p, playing]);

  const exportPNG = () => {
    const canvas = document.createElement("canvas");
    canvas.width = p.width;
    canvas.height = p.height;
    const ctx = canvas.getContext("2d")!;
    drawBorder(ctx, p, tRef.current);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, timestampName("rc-pointilism-border", "png"));
    }, "image/png");
  };

  const exportSVG = () => {
    const svg = buildBorderSVG(p, tRef.current);
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), timestampName("rc-pointilism-border", "svg"));
  };

  return (
    <main className="relative flex-1 overflow-hidden bg-ink">
      {/* ── Ambient background — atmospheric glow behind the glass dock ─── */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="ambient-glow h-full w-full" />
        <div className="absolute inset-0 bg-ink/55" />
      </div>

      {/* ── Centered preview stage ───────────────────────────────────── */}
      <div className="absolute inset-0 flex items-center justify-center px-8 pt-12 pb-28">
        <div
          className="relative overflow-hidden rounded-2xl shadow-2xl"
          style={{ aspectRatio: `${p.width} / ${p.height}`, height: "82vh", maxWidth: "100%", maxHeight: "82vh" }}
        >
          <div className="reel-bg absolute inset-0" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="label rounded-lg bg-black/40 px-3 py-1.5 backdrop-blur">prévia do conteúdo</span>
          </div>
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        </div>
      </div>

      <EffectsDock title="Borda & Efeitos">
        <div className="flex h-full flex-col">
          <div className="thin-scroll flex-1 overflow-y-auto p-4 space-y-4">
            {/* Modelos de Borda */}
            <div className="border-b border-white/10 pb-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="label text-[var(--text)]">Modelos de Borda</h3>
                <button onClick={() => { setP({ ...DEFAULT_BORDER }); setPresetId("frame"); }} className="label hover:text-red">
                  Reset
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {BORDER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setP((prev) => ({ ...prev, ...preset.params }));
                      setPresetId(preset.id);
                    }}
                    className={`rounded-lg border px-2 py-2 text-left text-[11px] transition-colors ${
                      presetId === preset.id ? "border-red bg-red/10 text-[var(--text)]" : "border-line text-muted hover:border-muted hover:text-[var(--text)]"
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <Section title="Formato & Dimensão">
              <div className="grid grid-cols-2 gap-1.5">
                {FORMAT_PRESETS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setP((prev) => ({ ...prev, width: f.width, height: f.height }))}
                    className={`rounded-lg border px-2 py-1.5 text-left text-[10px] leading-tight transition-colors ${
                      formatId === f.id ? "border-red bg-red/10 text-[var(--text)]" : "border-line text-muted hover:border-muted hover:text-[var(--text)]"
                    }`}
                  >
                    {f.name}
                    <span className="mono block text-[9px] opacity-60">{f.width}×{f.height}</span>
                  </button>
                ))}
              </div>
              <NumField label="Largura" value={p.width} onChange={(v) => set("width", v)} />
              <NumField label="Altura" value={p.height} onChange={(v) => set("height", v)} />
            </Section>

            <Section title="Geometria">
              <Slider label="Espessura" value={p.thickness} min={60} max={320} step={2} unit="px" onChange={(v) => set("thickness", v)} />
              <Slider label="Tamanho do ponto" value={p.dotSize} min={3} max={24} step={0.5} unit="px" onChange={(v) => set("dotSize", v)} />
              <Slider label="Espaçamento" value={p.dotGap} min={14} max={60} step={1} unit="px" onChange={(v) => set("dotGap", v)} />
              {p.style === "frame" && (
                <Slider label="Anéis" value={p.rings} min={1} max={8} step={1} onChange={(v) => set("rings", v)} />
              )}
            </Section>

            <Section title="Movimento">
              <Slider label="Velocidade" value={p.speed} min={0} max={4} step={0.1} unit="×" onChange={(v) => set("speed", v)} />
              <Toggle label="Animar prévia" value={playing} onChange={setPlaying} />
            </Section>

            <Section title="Cores">
              <ColorField label="Cor de destaque" value={p.accent} onChange={(v) => set("accent", v)} />
              <ColorField label="Cor dos pontos" value={p.dotColor} onChange={(v) => set("dotColor", v)} />
            </Section>

            <Section title="Textos">
              <Toggle label="Mostrar título" value={p.showTitle} onChange={(v) => set("showTitle", v)} />
              <TextField label="Título" value={p.title} onChange={(v) => set("title", v)} />
              <TextField label="@" value={p.handle} onChange={(v) => set("handle", v)} />
            </Section>
          </div>

          <div className="border-t border-white/10 px-4 py-4">
            <p className="label mb-2">{p.width}×{p.height} · centro transparente</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={exportPNG} className="rounded-lg bg-[var(--panel-2)] py-2.5 text-xs font-medium hover:bg-[var(--line)]">
                PNG
              </button>
              <button onClick={exportSVG} className="rounded-lg bg-red py-2.5 text-xs font-medium text-white hover:opacity-90">
                SVG
              </button>
            </div>
          </div>
        </div>
      </EffectsDock>
    </main>
  );
}
