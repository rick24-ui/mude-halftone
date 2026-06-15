"use client";

import { useStore } from "@/store/useStore";
import PreviewCanvas from "@/components/PreviewCanvas";
import EffectsDock from "@/components/EffectsDock";
import { useControlsState, ControlsSections, ControlsExportFooter } from "@/components/ControlsPanel";
import TextControls from "./TextControls";

export default function TextStudio() {
  const image = useStore((s) => s.image);
  const ctl = useControlsState();

  return (
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

      <EffectsDock title="Texto & Efeitos">
        <div className="flex h-full flex-col">
          <div className="thin-scroll flex-1 overflow-y-auto p-4 space-y-4">
            <TextControls />
            <ControlsSections ctl={ctl} />
          </div>
          <ControlsExportFooter ctl={ctl} />
        </div>
      </EffectsDock>
    </main>
  );
}
