"use client";

import { useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { processBatch, downloadBlob, timestampName } from "@/lib/export";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export default function BatchModal({ onClose }: { onClose: () => void }) {
  const params = useStore((s) => s.params);
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<"png" | "svg">("png");
  const [scale, setScale] = useState(2);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const valid = Array.from(list).filter((f) => ACCEPT.includes(f.type));
    setFiles((prev) => [...prev, ...valid]);
  };

  const run = async () => {
    if (!files.length) return;
    setProgress({ done: 0, total: files.length, name: "" });
    const blob = await processBatch(files, params, format, scale, 1000, (done, total, name) =>
      setProgress({ done, total, name })
    );
    downloadBlob(blob, timestampName("rc-pointilism-batch", "zip"));
    setProgress(null);
  };

  const busy = progress !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="glass w-full max-w-md rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="mono text-sm font-bold">Processar em lote</h2>
          <button onClick={onClose} className="text-muted hover:text-[var(--text)]">✕</button>
        </div>

        <p className="mb-3 text-xs text-muted">
          As configurações atuais serão aplicadas a todas as imagens e baixadas em um único ZIP.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          className="mb-3 cursor-pointer rounded-lg border border-dashed border-line p-6 text-center hover:border-white/20"
        >
          <p className="text-xs">
            Arraste imagens ou <span className="text-red">clique para selecionar</span>
          </p>
          <p className="label mt-1">{files.length ? `${files.length} arquivo(s)` : "PNG · JPG · WEBP · SVG"}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT.join(",")}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="mb-4 flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="label">Formato</span>
            {(["png", "svg"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`rounded-full px-2 py-0.5 text-[11px] uppercase ${format === f ? "seg-active" : "seg-idle bg-white/[0.04]"}`}
              >
                {f}
              </button>
            ))}
          </div>
          {format === "png" && (
            <div className="flex items-center gap-1">
              <span className="label">Escala</span>
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
          )}
        </div>

        {progress && (
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-[11px] text-muted">
              <span className="truncate">{progress.name}</span>
              <span>{progress.done}/{progress.total}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-2)]">
              <div className="h-full bg-red transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-glass px-3 py-2 text-xs">
            Cancelar
          </button>
          <button
            onClick={run}
            disabled={!files.length || busy}
            className="btn-primary px-4 py-2 text-xs"
          >
            {busy ? "Processando…" : "Gerar ZIP"}
          </button>
        </div>
      </div>
    </div>
  );
}
