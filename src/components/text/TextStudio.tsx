"use client";

import PreviewCanvas from "@/components/PreviewCanvas";
import ControlsPanel from "@/components/ControlsPanel";
import TextControls from "./TextControls";

export default function TextStudio() {
  return (
    <main className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-ink p-6">
        <PreviewCanvas />
      </div>
      <aside className="glass-sidebar flex w-[320px] shrink-0 flex-col">
        <div className="thin-scroll max-h-[46%] shrink-0 overflow-y-auto border-b border-line">
          <TextControls />
        </div>
        <div className="min-h-0 flex-1">
          <ControlsPanel />
        </div>
      </aside>
    </main>
  );
}
