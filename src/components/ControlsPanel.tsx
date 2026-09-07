"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import Slider from "./Slider";
import { PanelSection as Section, SegmentedRow as Segmented, SegmentedGrid, Toggle, ColorField, PresetGrid } from "@/components/ui/panel";
import { PRESETS, RED, INK, PAPER, PointillismParams } from "@/lib/types";
import { sampleDots } from "@/lib/engine";
import { exportPNG, exportSVG, exportPDF, copyPNGToClipboard, exportGIF, exportVideo } from "@/lib/export";

// ---------- pequenos blocos de UI (locais a este painel) ----------

const SWATCHES = [RED, INK, "#FFFFFF", PAPER, "#7A0A1F", "#1f6feb"];

// ---------- histórico de estilos — mesmo padrão do Tracker ----------

const GRID_LABELS: Record<PointillismParams["grid"], string> = {
  square: "Quadrada", hex: "Favo", concentric: "Radial", stipple: "Orgânica",
};
const SHAPE_LABELS: Record<PointillismParams["shape"], string> = {
  circle: "Círculo", square: "Quadrado", diamond: "Losango", triangle: "Triângulo",
  hexagon: "Hexágono", ring: "Anel", cross: "Cruz",
};
const CONNECTION_LABELS: Record<PointillismParams["connection"], string> = {
  none: "Nenhuma", cell: "Células", links: "Rede",
};
const COLOR_MODE_LABELS: Record<PointillismParams["colorMode"], string> = {
  solid: "Sólida", duotone: "Duotone", sample: "Amostra",
};
const ANIM_LABELS: Record<PointillismParams["animType"], string> = {
  none: "Nenhum", pulse: "Pulso", wave: "Onda", drift: "Deriva", orbit: "Órbita", shimmer: "Cintila",
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

interface HistoryEntry {
  id: number;
  label: string;
  color: string;
  time: string;
  snapshot: PointillismParams;
}

interface DiffRule {
  changed: (a: PointillismParams, b: PointillismParams) => boolean;
  describe: (b: PointillismParams) => string;
  debounce?: boolean;
}

// Regra por campo, na ordem em que devem ser checadas — a primeira diferença
// encontrada vira o rótulo da entrada. Mudanças discretas (toggles/selects)
// commitam na hora; sliders são debounced pra não lotar o histórico a cada
// pixel arrastado.
const DIFF_RULES: DiffRule[] = [
  { changed: (a, b) => a.grid !== b.grid, describe: (b) => `Distribuição: ${GRID_LABELS[b.grid]}` },
  { changed: (a, b) => a.shape !== b.shape, describe: (b) => `Forma: ${SHAPE_LABELS[b.shape]}` },
  { changed: (a, b) => a.connection !== b.connection, describe: (b) => `Conexão: ${CONNECTION_LABELS[b.connection]}` },
  { changed: (a, b) => a.colorMode !== b.colorMode, describe: (b) => `Cor: ${COLOR_MODE_LABELS[b.colorMode]}` },
  { changed: (a, b) => a.animType !== b.animType, describe: (b) => `Animação: ${ANIM_LABELS[b.animType]}` },
  { changed: (a, b) => a.background !== b.background, describe: (b) => `Fundo: ${b.background === "solid" ? "sólido" : "transparente"}` },
  { changed: (a, b) => a.color1 !== b.color1, describe: () => "Cor principal alterada" },
  { changed: (a, b) => a.color2 !== b.color2, describe: () => "Cor secundária alterada" },
  { changed: (a, b) => a.bgColor !== b.bgColor, describe: () => "Cor de fundo alterada" },
  { changed: (a, b) => a.hexOffset !== b.hexOffset, describe: (b) => `Linhas alternadas: ${b.hexOffset ? "ativado" : "desativado"}` },
  { changed: (a, b) => a.invert !== b.invert, describe: (b) => `Inverter: ${b.invert ? "ativado" : "desativado"}` },
  { changed: (a, b) => a.spacing !== b.spacing, describe: (b) => `Distância: ${b.spacing}px`, debounce: true },
  { changed: (a, b) => a.jitter !== b.jitter, describe: (b) => `Aleatoriedade: ${Math.round(b.jitter * 100)}%`, debounce: true },
  { changed: (a, b) => a.minSize !== b.minSize, describe: (b) => `Tamanho mín.: ${b.minSize.toFixed(1)}px`, debounce: true },
  { changed: (a, b) => a.maxSize !== b.maxSize, describe: (b) => `Tamanho máx.: ${b.maxSize.toFixed(1)}px`, debounce: true },
  { changed: (a, b) => a.sizeScale !== b.sizeScale, describe: (b) => `Escala global: ${b.sizeScale.toFixed(2)}×`, debounce: true },
  { changed: (a, b) => a.rotation !== b.rotation, describe: (b) => `Rotação: ${b.rotation}°`, debounce: true },
  { changed: (a, b) => a.flow !== b.flow, describe: (b) => `Movimento: ${b.flow}px`, debounce: true },
  { changed: (a, b) => a.flowScale !== b.flowScale, describe: (b) => `Escala do campo: ${b.flowScale.toFixed(1)}`, debounce: true },
  { changed: (a, b) => a.flowAngle !== b.flowAngle, describe: (b) => `Direção: ${b.flowAngle}°`, debounce: true },
  { changed: (a, b) => a.wave !== b.wave, describe: (b) => `Ondulação: ${Math.round(b.wave * 100)}%`, debounce: true },
  { changed: (a, b) => a.elasticity !== b.elasticity, describe: (b) => `Elasticidade: ${b.elasticity.toFixed(1)}`, debounce: true },
  { changed: (a, b) => a.connectDistance !== b.connectDistance, describe: (b) => `Distância dos links: ${b.connectDistance.toFixed(1)}×`, debounce: true },
  { changed: (a, b) => a.linkWidth !== b.linkWidth, describe: (b) => `Espessura dos links: ${b.linkWidth.toFixed(1)}px`, debounce: true },
  { changed: (a, b) => a.brightness !== b.brightness, describe: (b) => `Brilho: ${b.brightness}`, debounce: true },
  { changed: (a, b) => a.contrast !== b.contrast, describe: (b) => `Contraste: ${b.contrast}`, debounce: true },
  { changed: (a, b) => a.gamma !== b.gamma, describe: (b) => `Gama: ${b.gamma.toFixed(2)}`, debounce: true },
  { changed: (a, b) => a.thresholdLow !== b.thresholdLow, describe: (b) => `Limiar baixo: ${b.thresholdLow}`, debounce: true },
  { changed: (a, b) => a.thresholdHigh !== b.thresholdHigh, describe: (b) => `Limiar alto: ${b.thresholdHigh}`, debounce: true },
  { changed: (a, b) => a.opacity !== b.opacity, describe: (b) => `Opacidade: ${Math.round(b.opacity * 100)}%`, debounce: true },
  { changed: (a, b) => a.animAmount !== b.animAmount, describe: (b) => `Intensidade da animação: ${Math.round(b.animAmount * 100)}%`, debounce: true },
  { changed: (a, b) => a.animSpeed !== b.animSpeed, describe: (b) => `Velocidade da animação: ${b.animSpeed}`, debounce: true },
];

function describeChange(prev: PointillismParams, next: PointillismParams): { label: string; debounce: boolean } | null {
  for (const rule of DIFF_RULES) {
    if (rule.changed(prev, next)) return { label: rule.describe(next), debounce: !!rule.debounce };
  }
  return null;
}

// ---------- painel ----------

export default function ControlsPanel() {
  const { params, setParam, setParams, applyPreset, reset, presetId, source } = useStore();
  const library = useStore((s) => s.library);
  const saveStyle = useStore((s) => s.saveStyle);
  const loadStyle = useStore((s) => s.loadStyle);
  const deleteStyle = useStore((s) => s.deleteStyle);
  const [scale, setScale] = useState(2);
  const [copied, setCopied] = useState(false);
  const [styleName, setStyleName] = useState("");
  const [animDuration, setAnimDuration] = useState(2.5);
  const [anim, setAnim] = useState<{ kind: "gif" | "mp4"; done: number; total: number } | null>(null);

  // Histórico de estilos — cada alteração relevante vira uma camada clicável
  // para voltar a esse ponto. Mesmo padrão do painel "Histórico" do Tracker.
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const prevSnapRef = useRef<PointillismParams | null>(null);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoringRef = useRef(false);
  const historyIdRef = useRef(0);

  useEffect(() => {
    const prev = prevSnapRef.current;
    prevSnapRef.current = params;
    if (!prev) return;
    if (restoringRef.current) { restoringRef.current = false; return; }

    const change = describeChange(prev, params);
    if (!change) return;

    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      historyIdRef.current += 1;
      const entry: HistoryEntry = {
        id: historyIdRef.current,
        label: change.label,
        color: params.color1,
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        snapshot: params,
      };
      setHistory((h) => [entry, ...h].slice(0, 12));
    }, change.debounce ? 650 : 0);

    return () => {
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    };
  }, [params]);

  const restoreHistory = useCallback((entry: HistoryEntry) => {
    restoringRef.current = true;
    setParams(entry.snapshot);
  }, [setParams]);

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
      <Section
        title="Presets"
        headerRight={
          <button onClick={reset} className="label hover:text-red">
            Reset
          </button>
        }
      >
        <PresetGrid items={PRESETS} isActive={(preset) => presetId === preset.id} onSelect={applyPreset} />
      </Section>

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
              { value: "stipple", label: "Orgânica" },
            ]}
          />
          <div>
            <Slider label="Distância" value={p.spacing} min={3} max={40} step={0.5} unit="px" onChange={(v) => set("spacing", v)} />
            {p.grid === "stipple" && (
              <p className="mt-1 text-[10px] leading-snug text-muted">
                Nesse modo controla a densidade dos pontos, não uma grade fixa.
              </p>
            )}
          </div>
          <Slider label="Aleatoriedade" value={p.jitter} min={0} max={1} step={0.01} onChange={(v) => set("jitter", v)} />
          {p.grid === "square" && (
            <Toggle label="Linhas alternadas" value={p.hexOffset} onChange={(v) => set("hexOffset", v)} />
          )}
          {p.grid === "stipple" && (
            <p className="text-[10px] leading-relaxed text-muted">
              Distribuição orgânica ponderada pela escuridão da imagem — mais pontos onde é mais escuro, como um pontilhismo feito à mão.
            </p>
          )}
        </Section>

        {/* Ponto */}
        <Section title="Ponto / Forma">
          <SegmentedGrid
            columns={3}
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
          <SegmentedGrid
            columns={3}
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
                  className="btn-glass py-2.5 text-xs font-medium"
                >
                  {anim?.kind === "gif" ? `GIF ${Math.round((anim.done / anim.total) * 100)}%` : "Exportar GIF"}
                </button>
                <button
                  onClick={() => runAnim("mp4")}
                  disabled={!source || !!anim}
                  className="btn-glass py-2.5 text-xs font-medium"
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
              className="min-w-0 flex-1 rounded-lg border border-line bg-white/[0.03] px-2 py-1.5 text-[12px] outline-none placeholder:text-muted focus:ring-1 focus:ring-red/40"
            />
            <button
              onClick={() => {
                saveStyle(styleName);
                setStyleName("");
              }}
              className="btn-primary px-3 py-1.5 text-[11px]"
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

        {/* Histórico — mesmo padrão do painel "Histórico" do Tracker */}
        <Section
          title="Histórico"
          headerRight={
            history.length > 0 && (
              <button onClick={() => setHistory([])} className="text-[10px] text-muted hover:text-[var(--text)]">
                Limpar
              </button>
            )
          }
        >
          {history.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted">
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
        </Section>
      </div>

      {/* Export */}
      <div className="border-t border-line bg-white/[0.02] px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="label text-[var(--text)]">Exportar</h3>
          <div className="flex gap-1">
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`rounded-full px-2 py-0.5 text-[11px] ${scale === s ? "seg-active" : "seg-idle bg-white/[0.04]"}`}
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
            className="btn-glass py-2.5 text-xs font-medium"
          >
            PNG
          </button>
          <button
            onClick={() => runExport("svg")}
            disabled={!source}
            className="btn-glass py-2.5 text-xs font-medium"
          >
            SVG
          </button>
          <button
            onClick={() => runExport("pdf")}
            disabled={!source}
            className="btn-glass py-2.5 text-xs font-medium"
          >
            PDF
          </button>
        </div>
        <button
          onClick={() => runExport("copy")}
          disabled={!source}
          className="btn-primary mt-2 w-full py-2.5 text-xs disabled:opacity-40"
        >
          {copied ? "Copiado!" : "Copiar PNG"}
        </button>
      </div>
    </div>
  );
}
