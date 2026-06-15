"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import UploadDropzone from "@/components/UploadDropzone";
import PreviewCanvas from "@/components/PreviewCanvas";
import ControlsPanel from "@/components/ControlsPanel";
import EffectsDock from "@/components/EffectsDock";
import BatchModal from "@/components/BatchModal";
import BordersStudio from "@/components/borders/BordersStudio";
import TextStudio from "@/components/text/TextStudio";
import TrackerStudio from "@/components/tracker/TrackerStudio";

type Tab = "ponto" | "texto" | "borders" | "tracker";

export default function Home() {
  const source = useStore((s) => s.source);
  const image = useStore((s) => s.image);
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

  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`rounded-full px-3 py-1 text-[12px] transition-colors ${
        tab === id ? "bg-red text-white" : "text-muted hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-red" />
            <span className="mono text-sm font-bold tracking-tight">RC — POINTILISM GENERATOR</span>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-[var(--panel-2)] p-1">
            {tabBtn("ponto", "Pontilhismo")}
            {tabBtn("texto", "Texto")}
            {tabBtn("borders", "Borders")}
            {tabBtn("tracker", "Tracker")}
          </div>
        </div>

        {tab === "ponto" && (
          <div className="flex items-center gap-2">
            {source && (
              <span className="mono hidden max-w-[160px] truncate text-[11px] text-muted lg:block">{fileName}</span>
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
      ) : tab === "borders" ? (
        <BordersStudio />
      ) : tab === "texto" ? (
        <TextStudio />
      ) : !source ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">RC — Pointilism Generator</h1>
            <p className="mt-2 max-w-md text-sm text-muted">
              Upload a silhouette, icon or photo. Adjust dots, shapes, motion, colors and elastic cells. Export as SVG or PNG.
            </p>
          </div>
          <UploadDropzone />
        </main>
      ) : (
        <main className="relative flex-1 overflow-hidden bg-ink">
          {/* ── Ambient background — blurred reflection behind the glass dock ─ */}
          <div className="absolute inset-0 overflow-hidden">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.src} alt="" className="h-full w-full scale-110 object-cover opacity-50 blur-3xl" />
            ) : (
              <div className="ambient-glow h-full w-full" />
            )}
            <div className="absolute inset-0 bg-ink/55" />
          </div>

          {/* ── Centered canvas stage ─────────────────────────────────────── */}
          <div className="absolute inset-0 flex items-center justify-center px-8 pt-12 pb-28">
            <PreviewCanvas />
          </div>

          <EffectsDock title="Efeitos">
            <ControlsPanel />
          </EffectsDock>
        </main>
      )}
    </div>
  );
}
