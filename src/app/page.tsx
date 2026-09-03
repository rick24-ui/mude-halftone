"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import UploadDropzone from "@/components/UploadDropzone";
import PreviewCanvas from "@/components/PreviewCanvas";
import ControlsPanel from "@/components/ControlsPanel";
import BatchModal from "@/components/BatchModal";
import TextStudio from "@/components/text/TextStudio";
import TrackerStudio from "@/components/tracker/TrackerStudio";
import ParticleStudio from "@/components/particle/ParticleStudio";

type Tab = "ponto" | "texto" | "tracker" | "particulas";

// ─── Icons — minimal line/dot marks, one per functionality, shared by the
// rail cards and the home cards so the whole app reads as one icon set ────

function IconHome() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M2.5 8.5 9 3l6.5 5.5" strokeLinecap="round" />
      <path d="M4 7.5V15h10V7.5" />
      <path d="M7.2 15v-4.2h3.6V15" />
    </svg>
  );
}

function IconDots() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="currentColor">
      <circle cx="4" cy="4" r="1.6" />
      <circle cx="9" cy="4" r="1" />
      <circle cx="14" cy="4" r="1.6" />
      <circle cx="4" cy="9" r="1" />
      <circle cx="9" cy="9" r="1.9" />
      <circle cx="14" cy="9" r="1" />
      <circle cx="4" cy="14" r="1.6" />
      <circle cx="9" cy="14" r="1" />
      <circle cx="14" cy="14" r="1.6" />
    </svg>
  );
}

function IconType() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 5h12M3 9h12M3 13h7" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="9" cy="9" r="6" />
      <circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none" />
      <path d="M9 1v3M9 14v3M1 9h3M14 9h3" strokeLinecap="round" />
    </svg>
  );
}

function IconParticles() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="currentColor">
      <circle cx="9" cy="9.5" r="2.1" />
      <circle cx="3" cy="4" r="1" opacity="0.85" />
      <circle cx="15.2" cy="3.2" r="1.3" opacity="0.6" />
      <circle cx="14.5" cy="14.5" r="1" opacity="0.75" />
      <circle cx="3" cy="14.5" r="1.3" opacity="0.5" />
      <circle cx="9.5" cy="1.8" r="0.8" opacity="0.6" />
    </svg>
  );
}

const TABS: { id: Tab; num: string; label: string; desc: string; icon: () => React.ReactNode }[] = [
  {
    id: "ponto",
    num: "01",
    label: "Pontilhismo",
    desc: "Transforme imagens em composições de pontos — grades, cores e movimento.",
    icon: IconDots,
  },
  {
    id: "texto",
    num: "02",
    label: "Texto",
    desc: "Componha tipografia com efeitos de pontilhismo e exporte em alta resolução.",
    icon: IconType,
  },
  {
    id: "tracker",
    num: "03",
    label: "Tracker",
    desc: "Rastreamento de pose e ambiente com IA, sobre imagem ou vídeo.",
    icon: IconTarget,
  },
  {
    id: "particulas",
    num: "04",
    label: "Partículas",
    desc: "Motor de partículas com morph, timeline e exportação em vídeo.",
    icon: IconParticles,
  },
];

// ─── Rail card — compact card selector, same visual language as the home
// cards (border, red on hover/active) so both read as one system ──────────

function RailCard({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`group relative flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border transition-all ${
        active
          ? "border-red bg-red/10 text-red"
          : "border-transparent text-muted hover:border-line hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
      }`}
    >
      {icon}
      {/* tooltip */}
      <span
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap
          rounded border border-line bg-[var(--panel-2)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text)]
          opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
      >
        {label}
      </span>
    </button>
  );
}

// ─── Home card — the big quick-select cards shown when no tool is active ──

function HomeCard({
  num,
  label,
  desc,
  icon,
  onClick,
}: {
  num: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start gap-4 rounded-xl border border-line bg-[var(--panel-2)] p-5 text-left
        transition-all hover:-translate-y-0.5 hover:border-red hover:shadow-[0_8px_28px_rgba(208,0,0,0.18)]"
    >
      <div className="flex w-full items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-line text-muted transition-colors group-hover:border-red/50 group-hover:text-red">
          {icon}
        </span>
        <span className="mono text-[10px] tracking-[.2em] text-muted/60 group-hover:text-red/70">{num}</span>
      </div>
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">{label}</h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{desc}</p>
      </div>
    </button>
  );
}

export default function Home() {
  const source = useStore((s) => s.source);
  const fileName = useStore((s) => s.fileName);
  const showOriginal = useStore((s) => s.showOriginal);
  const setShowOriginal = useStore((s) => s.setShowOriginal);
  const clearImage = useStore((s) => s.clearImage);
  const hydrateLibrary = useStore((s) => s.hydrateLibrary);
  const [batchOpen, setBatchOpen] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);

  useEffect(() => {
    hydrateLibrary();
  }, [hydrateLibrary]);

  const activeTab = TABS.find((t) => t.id === tab) ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* Header — brand + current tool eyebrow + contextual actions */}
      <header className="glass-header flex h-12 shrink-0 items-center justify-between px-4">
        <button
          onClick={() => setTab(null)}
          className="flex items-center gap-3"
          title="Voltar para o início"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="UPGM" className="h-5 w-auto opacity-90" />
          <span className="mono text-[12px] font-semibold tracking-[.12em] text-[var(--text)]">
            UPGM — LAB
          </span>
          {activeTab && (
            <>
              <span className="h-4 w-px bg-[var(--line)]" />
              <span className="mono text-[9px] tracking-[.16em] text-red uppercase">
                {activeTab.num} / {activeTab.label}
              </span>
            </>
          )}
        </button>

        {/* Right actions (ponto only) */}
        <div className="flex items-center gap-2">
          {tab === "ponto" && (
            <>
              {source && (
                <span className="mono hidden max-w-[130px] truncate text-[11px] text-muted lg:block">
                  {fileName}
                </span>
              )}
              <button
                onClick={() => setBatchOpen(true)}
                className="rounded border border-line px-3 py-1 mono text-[10px] uppercase tracking-widest text-muted hover:border-muted hover:text-[var(--text)] transition-colors"
              >
                Lote
              </button>
              {source && (
                <>
                  <button
                    onClick={() => setShowOriginal(!showOriginal)}
                    className={`rounded border px-3 py-1 mono text-[10px] uppercase tracking-widest transition-colors ${
                      showOriginal
                        ? "border-red text-red"
                        : "border-line text-muted hover:text-[var(--text)]"
                    }`}
                  >
                    Comparar
                  </button>
                  <button
                    onClick={clearImage}
                    className="rounded border border-line px-3 py-1 mono text-[10px] uppercase tracking-widest text-muted hover:border-muted hover:text-[var(--text)] transition-colors"
                  >
                    Nova imagem
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </header>

      {batchOpen && <BatchModal onClose={() => setBatchOpen(false)} />}

      {/* Body — fixed rail of card-selectors (the one navigation style for
          all 4 tools, plus Início) + active studio or the home card grid */}
      <div className="flex flex-1 min-h-0">
        <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1.5 border-r border-line bg-[var(--panel)] py-3">
          <RailCard active={tab === null} icon={<IconHome />} label="Início" onClick={() => setTab(null)} />
          <span className="my-1 h-px w-8 bg-line" />
          {TABS.map(({ id, label, icon: Icon }) => (
            <RailCard key={id} active={tab === id} icon={<Icon />} label={label} onClick={() => setTab(id)} />
          ))}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {tab === null ? (
            <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10">
              <div className="w-full max-w-2xl">
                <div className="mb-8 text-center">
                  <p className="mono text-[10px] uppercase tracking-[.22em] text-red mb-3">UPGM — LAB</p>
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Escolha uma ferramenta</h1>
                  <p className="mt-2 text-sm text-muted">
                    Quatro estúdios visuais — clique num card ou use o atalho na barra lateral.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {TABS.map(({ id, num, label, desc, icon: Icon }) => (
                    <HomeCard key={id} num={num} label={label} desc={desc} icon={<Icon />} onClick={() => setTab(id)} />
                  ))}
                </div>
              </div>
            </main>
          ) : tab === "particulas" ? (
            <ParticleStudio />
          ) : tab === "tracker" ? (
            <TrackerStudio />
          ) : tab === "texto" ? (
            <TextStudio />
          ) : !source ? (
            <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
              <div className="text-center">
                <p className="mono text-[10px] uppercase tracking-[.22em] text-muted mb-3">
                  01 / Pontilhismo
                </p>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">UPGM — Lab</h1>
                <p className="mt-2 max-w-md text-sm text-muted">
                  Faça upload de uma imagem. Ajuste pontos, formas, cores e efeitos. Exporte em SVG ou PNG.
                </p>
              </div>
              <UploadDropzone />
            </main>
          ) : (
            <main className="flex flex-1 overflow-hidden">
              <div className="flex flex-1 items-center justify-center overflow-hidden bg-ink p-6">
                <PreviewCanvas />
              </div>
              <aside className="glass-sidebar flex w-[320px] shrink-0 flex-col">
                <ControlsPanel />
              </aside>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
