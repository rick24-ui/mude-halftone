"use client";

import { useState } from "react";

export default function EffectsDock({
  title,
  children,
  raised = false,
}: {
  title: string;
  children: React.ReactNode;
  raised?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fabPos = raised ? "bottom-24" : "bottom-6";
  const panelPos = raised ? "bottom-44" : "bottom-24";

  return (
    <>
      {open && (
        <div
          className={`glass absolute ${panelPos} left-1/2 z-30 flex h-[60vh] w-[380px] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="label">{title}</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-white/10 hover:text-[var(--text)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fechar efeitos" : "Abrir efeitos"}
        className={`glass absolute ${fabPos} left-1/2 z-20 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full transition-colors hover:bg-white/10 ${open ? "text-red" : "text-[var(--text)]"}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="2" y1="14" x2="6" y2="14" />
          <line x1="10" y1="8" x2="14" y2="8" />
          <line x1="18" y1="16" x2="22" y2="16" />
        </svg>
      </button>
    </>
  );
}
