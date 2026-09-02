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

const TABS: { id: Tab; num: string; label: string }[] = [
  { id: "ponto",     num: "01", label: "Pontilhismo" },
  { id: "texto",     num: "02", label: "Texto"        },
  { id: "tracker",   num: "03", label: "Tracker"      },
  { id: "particulas",num: "04", label: "Partículas"   },
];

export default function Home() {
  const source = useStore((s) => s.source);
  const fileName = useStore((s) => s.fileName);
  const showOriginal = useStore((s) => s.showOriginal);
  const setShowOriginal = useStore((s) => s.setShowOriginal);
  const clearImage = useStore((s) => s.clearImage);
  const hydrateLibrary = useStore((s) => s.hydrateLibrary);
  const [batchOpen, setBatchOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("ponto");

  useEffect(() => {
    hydrateLibrary();
  }, [hydrateLibrary]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="glass-header relative flex h-14 shrink-0 items-stretch justify-between">

        {/* Brand */}
        <div className="flex items-center gap-3 px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="UPGM" className="h-5 w-auto opacity-90" />
          <span className="mono text-[12px] font-semibold tracking-[.12em] text-[var(--text)]">
            UPGM — LAB
          </span>
          {/* vertical separator */}
          <span className="h-4 w-px bg-[var(--line)]" />
          <span className="mono text-[9px] tracking-[.2em] text-muted uppercase">Visual Tools</span>
        </div>

        {/* Tab nav — centered */}
        <nav className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex items-stretch">
          {TABS.map(({ id, num, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="relative flex flex-col items-center justify-center px-5 group"
              >
                {/* number */}
                <span
                  className={`mono text-[9px] tracking-[.16em] leading-none mb-0.5 transition-colors ${
                    active ? "text-red" : "text-muted/50 group-hover:text-muted"
                  }`}
                >
                  {num}
                </span>
                {/* label */}
                <span
                  className={`text-[12px] font-medium tracking-wide leading-none transition-colors ${
                    active ? "text-[var(--text)]" : "text-muted group-hover:text-[var(--text)]/70"
                  }`}
                >
                  {label}
                </span>
                {/* active indicator — bottom border */}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-red" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right actions (ponto only) */}
        <div className="flex items-center gap-2 px-4">
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

      {/* Body */}
      {tab === "particulas" ? (
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
  );
}
