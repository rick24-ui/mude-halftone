"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import UploadDropzone from "@/components/UploadDropzone";
import PreviewCanvas from "@/components/PreviewCanvas";
import ControlsPanel from "@/components/ControlsPanel";
import BatchModal from "@/components/BatchModal";
import TextStudio from "@/components/text/TextStudio";
import TrackerStudio from "@/components/tracker/TrackerStudio";

type Tab = "ponto" | "texto" | "tracker";

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

  const tabs: { id: Tab; label: string }[] = [
    { id: "ponto", label: "Pontilhismo" },
    { id: "texto", label: "Texto" },
    { id: "tracker", label: "Tracker" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="glass-header relative flex h-12 shrink-0 items-center justify-between px-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="UPGM" className="h-5 w-auto opacity-90" />
          <span className="mono text-[13px] font-semibold tracking-wider text-[var(--text)]">UPGM — LAB</span>
        </div>

        {/* Tab switcher — centered */}
        <nav className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0 rounded-full bg-[var(--panel-2)] p-1">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-full px-4 py-1 text-[12px] font-medium transition-all ${
                tab === id
                  ? "bg-red text-white shadow-sm"
                  : "text-muted hover:text-[var(--text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Actions (ponto only) */}
        {tab === "ponto" && (
          <div className="flex items-center gap-2">
            {source && (
              <span className="mono hidden max-w-[140px] truncate text-[11px] text-muted lg:block">
                {fileName}
              </span>
            )}
            <button
              onClick={() => setBatchOpen(true)}
              className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:border-muted hover:text-[var(--text)]"
            >
              Lote
            </button>
            {source && (
              <>
                <button
                  onClick={() => setShowOriginal(!showOriginal)}
                  className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
                    showOriginal ? "border-red text-red" : "border-line text-muted hover:text-[var(--text)]"
                  }`}
                >
                  Comparar
                </button>
                <button
                  onClick={clearImage}
                  className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:border-muted hover:text-[var(--text)]"
                >
                  Nova imagem
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {batchOpen && <BatchModal onClose={() => setBatchOpen(false)} />}

      {/* Body */}
      {tab === "tracker" ? (
        <TrackerStudio />
      ) : tab === "texto" ? (
        <TextStudio />
      ) : !source ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
          <div className="text-center">
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
