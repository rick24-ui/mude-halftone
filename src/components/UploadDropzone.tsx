"use client";

import { useCallback, useRef, useState } from "react";
import { useStore } from "@/store/useStore";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => reject(new Error("Falha ao carregar imagem"));
    img.src = url;
  });
}

export default function UploadDropzone({ compact = false }: { compact?: boolean }) {
  const setImage = useStore((s) => s.setImage);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!ACCEPT.includes(file.type)) {
        setError("Formato não suportado. Use PNG, JPG, WebP ou SVG.");
        return;
      }
      try {
        const img = await loadImage(file);
        setImage(img, file.name);
      } catch {
        setError("Não foi possível abrir a imagem.");
      }
    },
    [setImage]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className={compact ? "" : "w-full max-w-xl"}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed transition-colors ${
          compact ? "gap-2 p-6" : "gap-4 p-16"
        } ${drag ? "border-red bg-red/5" : "border-line hover:border-muted"}`}
      >
        <div
          className={`flex items-center justify-center rounded-full border border-line text-muted transition-colors group-hover:text-red ${
            compact ? "h-9 w-9" : "h-14 w-14"
          }`}
        >
          <svg width={compact ? 16 : 22} height={compact ? 16 : 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
          </svg>
        </div>
        <div className="text-center">
          <p className={compact ? "text-xs" : "text-sm"}>
            Arraste uma imagem ou <span className="text-red">clique para enviar</span>
          </p>
          <p className="label mt-1">PNG · JPG · WEBP · SVG</p>
        </div>
      </div>
      {error && <p className="mt-3 text-center text-xs text-red">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
