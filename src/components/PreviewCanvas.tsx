"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { renderCanvas, sampleDots } from "@/lib/engine";
import { applyAnimation } from "@/lib/animation";

const LOOP_SEC = 2.5;
const INFO_H = 32; // faixa de informações abaixo do preview

export default function PreviewCanvas() {
  const source = useStore((s) => s.source);
  const image = useStore((s) => s.image);
  const params = useStore((s) => s.params);
  const compare = useStore((s) => s.showOriginal);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);

  // área disponível para o preview — medida de verdade, pra que o canvas seja
  // sempre ajustado com a proporção exata da fonte (nada de esticar/achatar)
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!stageEl) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [stageEl]);

  const deferredParams = useDeferredValue(params);

  const dots = useMemo(() => {
    if (!source) return [];
    return sampleDots(source, deferredParams);
  }, [source, deferredParams]);

  const animated = deferredParams.animType !== "none" && deferredParams.animAmount > 0 && !compare;

  // tamanho exibido: "contain" proporcional, ampliando imagens pequenas
  const fit = useMemo(() => {
    if (!source || stage.w < 8 || stage.h < 8) return null;
    const k = Math.min(stage.w / source.width, stage.h / source.height);
    const dw = Math.max(1, Math.floor(source.width * k));
    const dh = Math.max(1, Math.floor(source.height * k));
    // resolução interna = tamanho exibido × DPR (nítido em qualquer tamanho);
    // teto menor durante animação pra manter a fluidez
    const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    // Células faz blur + threshold por frame (pesado) → teto ainda menor
    const cap = animated ? (deferredParams.connection === "cell" ? 900 : 1400) : 2600;
    let rs = (dw * dpr) / source.width;
    rs = Math.min(rs, cap / Math.max(source.width, source.height));
    return {
      dw,
      dh,
      rs,
      bw: Math.max(1, Math.round(source.width * rs)),
      bh: Math.max(1, Math.round(source.height * rs)),
    };
  }, [source, stage, animated, deferredParams.connection]);

  // render estático (sem animação ou comparando)
  useEffect(() => {
    if (animated || !fit) return;
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    if (canvas.width !== fit.bw) canvas.width = fit.bw;
    if (canvas.height !== fit.bh) canvas.height = fit.bh;
    const ctx = canvas.getContext("2d");
    if (ctx) renderCanvas(ctx, dots, deferredParams, source.width, source.height, fit.rs);
  }, [dots, deferredParams, source, animated, fit]);

  // loop de animação
  useEffect(() => {
    if (!animated || !source || !fit) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== fit.bw) canvas.width = fit.bw;
    if (canvas.height !== fit.bh) canvas.height = fit.bh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const phase = (((performance.now() - start) / 1000) % LOOP_SEC) / LOOP_SEC;
      const frame = applyAnimation(dots, deferredParams, phase);
      renderCanvas(ctx, frame, deferredParams, source.width, source.height, fit.rs);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dots, deferredParams, source, animated, fit]);

  useEffect(() => {
    const move = (clientX: number) => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
    };
    const onMove = (e: PointerEvent) => dragging.current && move(e.clientX);
    const onUp = () => (dragging.current = false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  if (!source) return null;

  return (
    <div className="flex h-full w-full flex-col">
      {/* palco — mede o espaço livre e centraliza o preview já ajustado */}
      <div ref={setStageEl} className="relative flex min-h-0 flex-1 items-center justify-center">
        {fit && (
          <div
            ref={wrapRef}
            className="checker relative shrink-0 overflow-hidden rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.55)] ring-1 ring-white/10"
            style={{ width: fit.dw, height: fit.dh }}
          >
            <canvas ref={canvasRef} className="block h-full w-full" />

            {compare && image && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.src}
                  alt="original"
                  draggable={false}
                  className="absolute inset-0 h-full w-full select-none object-fill"
                  style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
                />
                <div className="absolute inset-y-0 z-10 w-px bg-red" style={{ left: `${pos}%` }} />
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    dragging.current = true;
                  }}
                  className="glass absolute z-20 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full text-red"
                  style={{ left: `${pos}%`, top: "50%" }}
                  aria-label="Arrastar comparação"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
                  </svg>
                </button>
                <span className="label absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5">Original</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* faixa de informações — fora do preview, sem cobrir a imagem */}
      <div className="mono flex shrink-0 items-center justify-center gap-3 text-[10px] uppercase tracking-[.12em] text-muted" style={{ height: INFO_H }}>
        <span>
          <b className="text-[var(--text)]">{dots.length.toLocaleString("pt-BR")}</b> pontos
        </span>
        <span className="h-3 w-px bg-line" />
        <span>
          {source.width}×{source.height}
        </span>
        {animated && (
          <>
            <span className="h-3 w-px bg-line" />
            <span className="text-red">animado</span>
          </>
        )}
      </div>
    </div>
  );
}
