"use client";

import { useRef, useState, useCallback } from "react";
import { AsciiRenderResult, AsciiParams } from "@/lib/ascii";

interface AsciiCanvasProps {
  result: AsciiRenderResult | null;
  params: AsciiParams;
  originalImage: CanvasImageSource | null;
  loading: boolean;
  zoom: number;
  onZoomChange: (z: number) => void;
  showLoupe: boolean;
  onToggleLoupe?: () => void;
  compareMode: boolean;
  onToggleCompare?: () => void;
  comparePos: number; // 0 a 100%
  onComparePosChange: (pos: number) => void;
}

export default function AsciiCanvas({
  result,
  params,
  originalImage,
  loading,
  zoom,
  onZoomChange,
  showLoupe,
  onToggleLoupe,
  compareMode,
  onToggleCompare,
  comparePos,
  onComparePosChange,
}: AsciiCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const loupePreRef = useRef<HTMLPreElement>(null);

  // Pan / arrastar
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const startPanRef = useRef({ x: 0, y: 0 });

  // Compare split dragging
  const [isDraggingCompare, setIsDraggingCompare] = useState(false);
  const [viewOriginalOnly, setViewOriginalOnly] = useState(false);

  // Loupe mouse position
  const [loupePos, setLoupePos] = useState({ x: -999, y: -999, active: false });

  // Reset pan ao recentralizar
  const handleResetView = useCallback(() => {
    setPan({ x: 0, y: 0 });
    onZoomChange(1);
  }, [onZoomChange]);

  // Mouse wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      const newZoom = Math.max(0.4, Math.min(2.5, +(zoom + delta).toFixed(2)));
      onZoomChange(newZoom);
    }
  };

  // Drag to pan or drag compare split
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !e.shiftKey) {
      // Verifica se clicou próximo ao divisor de comparação
      if (compareMode && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mousePct = ((e.clientX - rect.left) / rect.width) * 100;
        if (Math.abs(mousePct - comparePos) < 4) {
          setIsDraggingCompare(true);
          return;
        }
      }
      setIsPanning(true);
      startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCompare && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const newPct = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
      onComparePosChange(Math.round(newPct));
      return;
    }

    if (isPanning) {
      setPan({
        x: e.clientX - startPanRef.current.x,
        y: e.clientY - startPanRef.current.y,
      });
    }

    // Atualiza a Lupa com precisão matemática
    if (showLoupe && containerRef.current && preRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      setLoupePos({
        x: clientX,
        y: clientY,
        active: true,
      });

      if (loupePreRef.current) {
        const preRect = preRef.current.getBoundingClientRect();
        const relX = e.clientX - preRect.left;
        const relY = e.clientY - preRect.top;

        // Raio da lupa = 90px (diâmetro 180px). Fator de ampliação = 2.4x
        const radius = 90;
        const mag = 2.4;
        const tx = radius / mag - relX;
        const ty = radius / mag - relY;

        loupePreRef.current.style.transformOrigin = "0 0";
        loupePreRef.current.style.transform = `scale(${mag}) translate(${tx}px, ${ty}px)`;
      }
    }
  };

  const onMouseUp = () => {
    setIsPanning(false);
    setIsDraggingCompare(false);
  };

  const onMouseLeave = () => {
    setIsPanning(false);
    setIsDraggingCompare(false);
    setLoupePos((p) => ({ ...p, active: false }));
  };

  const actualFontSize = Math.max(4, Math.round(params.fontSize * zoom));

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      className={`relative flex h-full w-full select-none items-center justify-center overflow-hidden transition-colors ${
        isDraggingCompare
          ? "cursor-ew-resize"
          : isPanning
          ? "cursor-grabbing"
          : showLoupe
          ? "cursor-crosshair"
          : "cursor-grab"
      }`}
      style={{ backgroundColor: params.bgColor }}
    >
      {/* Grade de fundo sutil */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Camada de Scanlines CRT (se ativado) */}
      {params.scanlines && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.45) 50%)",
            backgroundSize: "100% 4px",
          }}
        />
      )}

      {/* Conteúdo Renderizado (ASCII / Braille) */}
      {result ? (
        <div
          className="relative transition-transform duration-75 ease-out"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          {/* Seletor "Ver Original" Total (caso o usuário queira alternar 100%) */}
          {compareMode && viewOriginalOnly && originalImage instanceof HTMLImageElement ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={originalImage.src}
              alt="Original"
              className="max-h-[85vh] max-w-[85vw] object-contain rounded-lg shadow-2xl"
            />
          ) : (
            <>
              {/* Compare Split View (Original à esquerda vs ASCII à direita) */}
              {compareMode && originalImage instanceof HTMLImageElement && (
                <div
                  className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
                  style={{
                    clipPath: `polygon(0 0, ${comparePos}% 0, ${comparePos}% 100%, 0 100%)`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={originalImage.src}
                    alt="Original"
                    className="h-full w-full object-cover"
                    style={{
                      opacity: 0.95,
                    }}
                  />
                  {/* Badge "ORIGINAL" */}
                  <div className="absolute top-3 left-3 rounded bg-black/80 px-2 py-0.5 text-[9px] mono uppercase tracking-widest text-white backdrop-blur border border-white/20">
                    Original
                  </div>
                </div>
              )}

              {/* Badge "ASCII" do lado direito do split */}
              {compareMode && originalImage && (
                <div
                  className="pointer-events-none absolute top-3 z-10 rounded bg-red/80 px-2 py-0.5 text-[9px] mono uppercase tracking-widest text-white backdrop-blur border border-red/30"
                  style={{ left: `${Math.min(92, comparePos + 2)}%` }}
                >
                  {params.mode === "braille" ? "Braille HD" : "ASCII Art"}
                </div>
              )}

              {/* Linha divisória interativa de comparação */}
              {compareMode && originalImage && (
                <div
                  className="absolute top-0 bottom-0 z-20 w-1 cursor-ew-resize bg-red shadow-[0_0_12px_rgba(208,0,0,0.9)]"
                  style={{ left: `${comparePos}%` }}
                >
                  {/* Handle circular com ícone < > */}
                  <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-red text-[11px] font-bold text-white shadow-lg">
                    ⇄
                  </div>
                </div>
              )}

              {/* Renderização do Texto / HTML ASCII */}
              {params.colorMode === "mono" ? (
                <pre
                  ref={preRef}
                  className={`font-mono leading-none tracking-normal whitespace-pre ${
                    params.glow
                      ? "drop-shadow-[0_0_8px_rgba(208,0,0,0.5)] [text-shadow:0_0_6px_currentColor]"
                      : ""
                  }`}
                  style={{
                    fontSize: `${actualFontSize}px`,
                    lineHeight: params.lineHeight,
                    letterSpacing: "0px",
                    color: params.textColor,
                  }}
                >
                  {result.text}
                </pre>
              ) : (
                <pre
                  ref={preRef}
                  className={`font-mono leading-none tracking-normal whitespace-pre ${
                    params.glow
                      ? "drop-shadow-[0_0_8px_rgba(208,0,0,0.5)] [text-shadow:0_0_6px_currentColor]"
                      : ""
                  }`}
                  style={{
                    fontSize: `${actualFontSize}px`,
                    lineHeight: params.lineHeight,
                    letterSpacing: "0px",
                    color: params.textColor,
                  }}
                  dangerouslySetInnerHTML={{ __html: result.html }}
                />
              )}
            </>
          )}
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-red border-t-transparent" />
          <p className="mono text-[11px] uppercase tracking-widest text-muted">
            Processando matriz ASCII…
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center text-muted">
          <p className="mono text-[11px] uppercase tracking-[.22em] text-red">
            06 / ASCII Studio
          </p>
          <p className="text-base font-medium text-[var(--text)]">
            Nenhuma imagem carregada
          </p>
          <p className="max-w-xs text-[12px] leading-relaxed">
            Faça upload de uma foto, ative a câmera ao vivo ou digite um texto para renderizar.
          </p>
        </div>
      )}

      {/* Lupa de Inspeção (Loupe Magnifier) — Alta fidelidade visual */}
      {showLoupe && loupePos.active && result && (
        <div
          className="pointer-events-none absolute z-30 h-44 w-44 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 border-red bg-[#0d0d0f] shadow-[0_0_36px_rgba(0,0,0,0.9),0_0_16px_rgba(208,0,0,0.5)]"
          style={{
            left: `${loupePos.x}px`,
            top: `${loupePos.y}px`,
          }}
        >
          {params.colorMode === "mono" ? (
            <pre
              ref={loupePreRef}
              className="absolute top-0 left-0 font-mono leading-none tracking-normal whitespace-pre origin-top-left pointer-events-none"
              style={{
                fontSize: `${actualFontSize}px`,
                lineHeight: params.lineHeight,
                color: params.textColor,
              }}
            >
              {result.text}
            </pre>
          ) : (
            <pre
              ref={loupePreRef}
              className="absolute top-0 left-0 font-mono leading-none tracking-normal whitespace-pre origin-top-left pointer-events-none"
              style={{
                fontSize: `${actualFontSize}px`,
                lineHeight: params.lineHeight,
                color: params.textColor,
              }}
              dangerouslySetInnerHTML={{ __html: result.html }}
            />
          )}

          {/* Retículo e lente de mira */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border border-red/40" />
            <div className="absolute h-full w-[1px] bg-red/20" />
            <div className="absolute h-[1px] w-full bg-red/20" />
            <span className="absolute bottom-2 font-mono text-[9px] uppercase tracking-widest text-red/80 font-bold bg-black/60 px-1.5 py-0.5 rounded">
              2.4× LOUPE
            </span>
          </div>
        </div>
      )}

      {/* Barra flutuante de controles do Viewport */}
      {result && (
        <div className="glass absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full px-3 py-1.5 shadow-2xl z-20">
          {/* Controles de Zoom */}
          <button
            onClick={() => onZoomChange(Math.max(0.4, +(zoom - 0.15).toFixed(2)))}
            disabled={zoom <= 0.4}
            className="btn-glass flex h-6 w-6 items-center justify-center text-xs font-bold"
            title="Reduzir zoom"
          >
            -
          </button>
          <button
            onClick={handleResetView}
            className="mono px-2 text-[11px] text-muted hover:text-[var(--text)]"
            title="Resetar escala e posição"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => onZoomChange(Math.min(2.5, +(zoom + 0.15).toFixed(2)))}
            disabled={zoom >= 2.5}
            className="btn-glass flex h-6 w-6 items-center justify-center text-xs font-bold"
            title="Aumentar zoom"
          >
            +
          </button>

          <span className="h-3 w-px bg-line" />

          {/* Botão Comparar ON/OFF rápido */}
          {originalImage && onToggleCompare && (
            <button
              onClick={onToggleCompare}
              className={`btn-glass px-2.5 py-1 text-[10px] mono uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                compareMode ? "is-active text-red border-red/50 bg-red/[0.12]" : ""
              }`}
              title="Ativar/Desativar comparação lado a lado"
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${compareMode ? "bg-red animate-pulse" : "bg-muted/40"}`} />
              Comparar: <b>{compareMode ? "ON" : "OFF"}</b>
            </button>
          )}

          {/* Botão de Alternar Ver Original Total (quando em modo comparar) */}
          {compareMode && originalImage && (
            <button
              onMouseDown={() => setViewOriginalOnly(true)}
              onMouseUp={() => setViewOriginalOnly(false)}
              className={`btn-glass px-2.5 py-1 text-[10px] mono uppercase tracking-wider ${
                viewOriginalOnly ? "is-active text-red border-red/50" : ""
              }`}
              title="Segure para visualizar somente a imagem original"
            >
              Segure p/ Original
            </button>
          )}

          {/* Botão Lupa ON/OFF rápido */}
          {onToggleLoupe && (
            <button
              onClick={onToggleLoupe}
              className={`btn-glass px-2.5 py-1 text-[10px] mono uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                showLoupe ? "is-active text-red border-red/50 bg-red/[0.12]" : ""
              }`}
              title="Ativar/Desativar Lupa de aumento"
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${showLoupe ? "bg-red animate-pulse" : "bg-muted/40"}`} />
              Lupa: <b>{showLoupe ? "ON" : "OFF"}</b>
            </button>
          )}

          <span className="h-3 w-px bg-line" />

          <button
            onClick={handleResetView}
            className="btn-glass px-2.5 py-0.5 text-[10px] mono uppercase tracking-wider"
          >
            Centralizar
          </button>
        </div>
      )}
    </div>
  );
}
