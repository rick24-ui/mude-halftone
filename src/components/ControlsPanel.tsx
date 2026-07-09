"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import Slider from "./Slider";
import { PRESETS, RED, INK, PAPER } from "@/lib/types";
import { sampleDots } from "@/lib/engine";
import { exportPNG, exportSVG, exportPDF, copyPNGToClipboard, exportGIF, exportVideo } from "@/lib/export";

// ---------- pequenos blocos de UI ----------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/5 px-4 py-4">
      <h3 className="label mb-3 text-[var(--text)]">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md bg-[var(--panel-2)] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded px-2 py-1.5 text-[11px] transition-colors ${
            value === o.value ? "bg-red text-white" : "text-muted hover:text-[var(--text)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex w-full items-center justify-between py-1">
      <span className="label">{label}</span>
      <span className={`relative h-4 w-7 rounded-full transition-colors ${value ? "bg-red" : "bg-[var(--line)]"}`}>
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${value ? "translate-x-3.5" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <span className="mono text-[11px] uppercase text-muted">{value}</span>
        <label className="h-6 w-6 cursor-pointer rounded border border-line" style={{ background: value }}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}

const SWATCHES = [RED, INK, "#FFFFFF", PAPER, "#7A0A1F", "#1f6feb"];

// ---------- painel ----------

export default function ControlsPanel() {
  const { params, setParam, applyPreset, reset, presetId, source } = useStore();
  const library = useStore((s) => s.library);
  const saveStyle = useStore((s) => s.saveStyle);
  const loadStyle = useStore((s) => s.loadStyle);
  const deleteStyle = useStore((s) => s.deleteStyle);
  const [scale, setScale] = useState(2);
  const [copied, setCopied] = useState(false);
  const [styleName, setStyleName] = useState("");
  const [animDuration, setAnimDuration] = useState(2.5);
  const [anim, setAnim] = useState<{ kind: "gif" | "mp4"; done: number; total: number } | null>(null);

  const p = params;
  const set = setParam;

  const runAnim = async (kind: "gif" | "mp4") => {
    if (!source || p.animType === "none") return;
    setAnim({ kind, done: 0, total: 1 });
    const dots = sampleDots(source, p);
    const onProgress = (done: number, total: number) => setAnim({ kind, done, total });
    try {
      if (kind === "gif")
        await exportGIF(dots, p, source.width, source.height, { duration: animDuration, scale, onProgress });
      else await exportVideo(dots, p, source.width, source.height, { duration: animDuration, scale, onProgress });
    } finally {
      setAnim(null);
    }
  };

  const runExport = (fn: "png" | "svg" | "pdf" | "copy") => {
    if (!source) return;
    const dots = sampleDots(source, p);
    if (fn === "png") exportPNG(dots, p, source.width, source.height, scale);
    else if (fn === "svg") exportSVG(dots, p, source.width, source.height);
    else if (fn === "pdf") exportPDF(dots, p, source.width, source.height, scale);
    else
      copyPNGToClipboard(dots, p, source.width, source.height, scale).then((ok) => {
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Presets */}
      <div className="px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="label text-[var(--text)]">Presets MUDE</h3>
          <button onClick={reset} className="label hover:text-red">
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className={`rounded border px-2 py-2 text-left text-[11px] transition-colors ${
                presetId === preset.id
                  ? "border-red bg-red/10 text-[var(--text)]"
                  : "border-line text-muted hover:border-muted hover:text-[var(--text)]"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto">
        {/* Grade / distribuição */}
        <Section title="Grade & Distribuição">
          <Segmented
            value={p.grid}
            onChange={(v) => set("grid", v)}
            options={[
              { value: "square", label: "Quadrada" },
              { value: "hex", label: "Favo" },
              { value: "concentric", label: "Radial" },
            ]}
          />
          <Slider label="Distância" value={p.spacing} min={3} max={40} step={0.5} unit="px" onChange={(v) => set("spacing", v)} />
          <Slider label="Aleatoriedade" value={p.jitter} min={0} max={1} step={0.01} onChange={(v) => set("jitter", v)} />
          {p.grid === "square" && (
            <Toggle label="Linhas alternadas" value={p.hexOffset} onChange={(v) => set("hexOffset", v)} />
          )}
        </Section>

        {/* Ponto */}
        <Section title="Ponto / Forma">
          <Segmented
            value={p.shape}
            onChange={(v) => set("shape", v)}
            options={[
              { value: "circle", label: "Círculo" },
              { value: "square", label: "Quadrado" },
              { value: "diamond", label: "Losango" },
              { value: "triangle", label: "Triângulo" },
              { value: "hexagon", label: "Hexágono" },
              { value: "ring", label: "Anel" },
              { value: "cross", label: "Cruz" },
            ]}
          />
          <Slider label="Tamanho mín." value={p.minSize} min={0} max={20} step={0.1} unit="px" onChange={(v) => set("minSize", v)} />
          <Slider label="Tamanho máx." value={p.maxSize} min={0.5} max={30} step={0.1} unit="px" onChange={(v) => set("maxSize", v)} />
          <Slider label="Escala global" value={p.sizeScale} min={0.2} max={2.5} step={0.05} unit="×" onChange={(v) => set("sizeScale", v)} />
          {p.shape !== "circle" && p.shape !== "ring" && (
            <Slider label="Rotação" value={p.rotation} min={0} max={360} step={1} unit="°" onChange={(v) => set("rotation", v)} />
          )}
        </Section>

        {/* Movimento */}
        <Section title="Movimento / Fluxo">
          <Slider label="Intensidade" value={p.flow} min={0} max={40} step={0.5} unit="px" onChange={(v) => set("flow", v)} />
          <Slider label="Escala do campo" value={p.flowScale} min={0.5} max={12} step={0.1} onChange={(v) => set("flowScale", v)} />
          <Slider label="Direção" value={p.flowAngle} min={0} max={360} step={1} unit="°" onChange={(v) => set("flowAngle", v)} />
          <Slider label="Ondulação" value={p.wave} min={0} max={1} step={0.01} onChange={(v) => set("wave", v)} />
        </Section>

        {/* Animação */}
        <Section title="Animação (movimento ao vivo)">
          <Segmented
            value={p.animType}
            onChange={(v) => set("animType", v)}
            options={[
              { value: "none", label: "Nenhum" },
              { value: "pulse", label: "Pulso" },
              { value: "wave", label: "Onda" },
              { value: "drift", label: "Deriva" },
              { value: "orbit", label: "Órbita" },
              { value: "shimmer", label: "Cintila" },
            ]}
          />
          {p.animType !== "none" && (
            <>
              <Slider label="Intensidade" value={p.animAmount} min={0} max={1} step={0.01} onChange={(v) => set("animAmount", v)} />
              <Slider label="Velocidade" value={p.animSpeed} min={1} max={6} step={1} unit=" ciclos" onChange={(v) => set("animSpeed", v)} />
              <Slider label="Duração export" value={animDuration} min={1} max={6} step={0.5} unit="s" onChange={setAnimDuration} />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => runAnim("gif")}
                  disabled={!source || !!anim}
                  className="rounded bg-[var(--panel-2)] py-2.5 text-xs font-medium hover:bg-[var(--line)] disabled:opacity-40"
                >
                  {anim?.kind === "gif" ? `GIF ${Math.round((anim.done / anim.total) * 100)}%` : "Exportar GIF"}
                </button>
                <button
                  onClick={() => runAnim("mp4")}
                  disabled={!source || !!anim}
                  className="rounded bg-[var(--panel-2)] py-2.5 text-xs font-medium hover:bg-[var(--line)] disabled:opacity-40"
                >
                  {anim?.kind === "mp4" ? `MP4 ${Math.round((anim.done / anim.total) * 100)}%` : "Exportar MP4"}
                </button>
              </div>
              <p className="label">Vídeo/GIF usam fundo sólido · loop perfeito</p>
            </>
          )}
        </Section>

        {/* Conexões / elasticidade */}
        <Section title="Conexões / Elasticidade">
          <Segmented
            value={p.connection}
            onChange={(v) => set("connection", v)}
            options={[
              { value: "none", label: "Nenhuma" },
              { value: "cell", label: "Células" },
              { value: "links", label: "Rede" },
            ]}
          />
          {p.connection === "cell" && (
            <Slider label="Elasticidade" value={p.elasticity} min={0} max={30} step={0.5} onChange={(v) => set("elasticity", v)} />
          )}
          {p.connection === "links" && (
            <>
              <Slider label="Distância" value={p.connectDistance} min={0} max={3} step={0.1} unit="×" onChange={(v) => set("connectDistance", v)} />
              <Slider label="Espessura" value={p.linkWidth} min={0.2} max={8} step={0.1} unit="px" onChange={(v) => set("linkWidth", v)} />
            </>
          )}
        </Section>

        {/* Amostragem */}
        <Section title="Amostragem da Fonte">
          <Slider label="Brilho" value={p.brightness} min={-100} max={100} step={1} onChange={(v) => set("brightness", v)} />
          <Slider label="Contraste" value={p.contrast} min={-100} max={100} step={1} onChange={(v) => set("contrast", v)} />
          <Slider label="Gama" value={p.gamma} min={0.2} max={3} step={0.05} onChange={(v) => set("gamma", v)} />
          <Slider label="Limiar baixo" value={p.thresholdLow} min={0} max={255} step={1} onChange={(v) => set("thresholdLow", v)} />
          <Slider label="Limiar alto" value={p.thresholdHigh} min={0} max={255} step={1} onChange={(v) => set("thresholdHigh", v)} />
          <Toggle label="Inverter" value={p.invert} onChange={(v) => set("invert", v)} />
        </Section>

        {/* Cores */}
        <Section title="Cores">
          <Segmented
            value={p.colorMode}
            onChange={(v) => set("colorMode", v)}
            options={[
              { value: "solid", label: "Sólida" },
              { value: "duotone", label: "Duotone" },
              { value: "sample", label: "Amostra" },
            ]}
          />
          {p.colorMode !== "sample" && <ColorField label="Cor principal" value={p.color1} onChange={(v) => set("color1", v)} />}
          {p.colorMode === "duotone" && <ColorField label="Cor secundária" value={p.color2} onChange={(v) => set("color2", v)} />}
          {p.colorMode !== "sample" && (
            <div className="flex gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => set("color1", c)}
                  className="h-6 w-6 rounded border border-line"
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          )}
          <div className="pt-1">
            <Segmented
              value={p.background}
              onChange={(v) => set("background", v)}
              options={[
                { value: "transparent", label: "Transparente" },
                { value: "solid", label: "Fundo sólido" },
              ]}
            />
          </div>
          {p.background === "solid" && <ColorField label="Cor do fundo" value={p.bgColor} onChange={(v) => set("bgColor", v)} />}
          <Slider label="Opacidade" value={p.opacity} min={0} max={1} step={0.01} onChange={(v) => set("opacity", v)} />
        </Section>

        {/* Biblioteca */}
        <Section title="Biblioteca de Estilos">
          <div className="flex gap-2">
            <input
              value={styleName}
              onChange={(e) => setStyleName(e.target.value)}
              placeholder="Nome do estilo"
              className="min-w-0 flex-1 rounded bg-[var(--panel-2)] px-2 py-1.5 text-[12px] outline-none placeholder:text-muted focus:ring-1 focus:ring-red"
            />
            <button
              onClick={() => {
                saveStyle(styleName);
                setStyleName("");
              }}
              className="rounded bg-red px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90"
            >
              Salvar
            </button>
          </div>
          {library.length === 0 ? (
            <p className="label">Nenhum estilo salvo ainda.</p>
          ) : (
            <div className="space-y-1">
              {library.map((s) => (
                <div
                  key={s.id}
                  className="group flex items-center justify-between rounded border border-line px-2 py-1.5"
                >
                  <button
                    onClick={() => loadStyle(s.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="h-3 w-3 shrink-0 rounded-full border border-line" style={{ background: s.params.color1 }} />
                    <span className="truncate text-[12px] hover:text-red">{s.name}</span>
                  </button>
                  <button
                    onClick={() => deleteStyle(s.id)}
                    className="ml-2 text-muted opacity-60 hover:text-red group-hover:opacity-100"
                    aria-label="Excluir"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Export */}
      <div className="border-t border-white/5 bg-[var(--panel)] px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="label text-[var(--text)]">Exportar</h3>
          <div className="flex gap-1">
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`rounded px-2 py-0.5 text-[11px] ${scale === s ? "bg-red text-white" : "bg-[var(--panel-2)] text-muted"}`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => runExport("png")}
            disabled={!source}
            className="rounded bg-[var(--panel-2)] py-2.5 text-xs font-medium hover:bg-[var(--line)] disabled:opacity-40"
          >
            PNG
          </button>
          <button
            onClick={() => runExport("svg")}
            disabled={!source}
            className="rounded bg-[var(--panel-2)] py-2.5 text-xs font-medium hover:bg-[var(--line)] disabled:opacity-40"
          >
            SVG
          </button>
          <button
            onClick={() => runExport("pdf")}
            disabled={!source}
            className="rounded bg-[var(--panel-2)] py-2.5 text-xs font-medium hover:bg-[var(--line)] disabled:opacity-40"
          >
            PDF
          </button>
        </div>
        <button
          onClick={() => runExport("copy")}
          disabled={!source}
          className="mt-2 w-full rounded bg-red py-2.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {copied ? "Copiado!" : "Copiar PNG"}
        </button>
      </div>
    </div>
  );
}
