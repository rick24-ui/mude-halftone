"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { renderCanvas, sampleDots } from "@/lib/engine";
import { applyAnimation } from "@/lib/animation";

const LOOP_SEC = 2.5;

export default function PreviewCanvas() {
  const source = useStore((s) => s.source);
  const image = useStore((s) => s.image);
  const params = useStore((s) => s.params);
  const compare = useStore((s) => s.showOriginal);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);

  const deferredParams = useDeferredValue(params);

  const dots = useMemo(() => {
    if (!source) return [];
    return sampleDots(source, deferredParams);
  }, [source, deferredParams]);

  const animated = deferredParams.animType !== "none" && deferredParams.animAmount > 0 && !compare;

  // render estático (sem animação ou comparando)
  useEffect(() => {
    if (animated) return;
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    if (ctx) renderCanvas(ctx, dots, deferredParams, source.width, source.height, 1);
  }, [dots, deferredParams, source, animated]);

  // loop de animação
  useEffect(() => {
    if (!animated || !source) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const phase = (((performance.now() - start) / 1000) % LOOP_SEC) / LOOP_SEC;
      const frame = applyAnimation(dots, deferredParams, phase);
      renderCanvas(ctx, frame, deferredParams, source.width, source.height, 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dots, deferredParams, source, animated]);

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
    <div className="relative flex h-full w-full items-center justify-center">
      <div
        ref={wrapRef}
        className="checker relative inline-block max-h-full max-w-full overflow-hidden rounded-2xl shadow-2xl"
      >
        <canvas
          ref={canvasRef}
          className="block max-h-[78vh] max-w-full"
          style={{ width: source.width, maxWidth: "100%", height: "auto" }}
        />

        {compare && image && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              alt="original"
              draggable={false}
              className="absolute inset-0 h-full w-full select-none"
              style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
            />
            <div className="absolute inset-y-0 z-10 w-px bg-red" style={{ left: `${pos}%` }} />
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                dragging.current = true;
              }}
              className="absolute z-20 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-red bg-ink text-red"
              style={{ left: `${pos}%`, top: "50%" }}
              aria-label="Arrastar comparação"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
              </svg>
            </button>
            <span className="label absolute left-2 top-2 rounded-lg bg-black/50 px-1.5 py-0.5">Original</span>
          </>
        )}
      </div>

      <span className="label absolute bottom-2 right-3 rounded-lg bg-black/40 px-2 py-1 backdrop-blur">
        {dots.length.toLocaleString("pt-BR")} pontos{animated ? " · animado" : ""}
      </span>
    </div>
  );
}
