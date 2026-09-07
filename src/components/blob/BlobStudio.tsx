"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BlobNode, BlobLink, BlobParams, DEFAULT_BLOB_PARAMS, LinkMode, RenderMode, ColorMode, Quality,
  mulberry32, nextNodeId, computeContours, smoothContours, contourToPathCommands, drawContourPath,
  makeCanvasFillStyle, contoursBBox,
} from "@/lib/blob";
import {
  PanelSection as Section, SegmentedRow as Segmented, Toggle, ColorField, PanelSlider as Slider,
} from "@/components/ui/panel";

// ─── canvas rendering — shared by the live preview loop and PNG export ─────

function renderBlob(
  ctx: CanvasRenderingContext2D,
  nodes: BlobNode[],
  links: BlobLink[],
  W: number,
  H: number,
  time: number,
  p: BlobParams
) {
  ctx.clearRect(0, 0, W, H);
  if (p.background === "solid") {
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, W, H);
  }

  const raw = computeContours(nodes, links, W, H, time, p);
  const contours = smoothContours(raw, p.curvature);
  if (contours.length === 0) return { contours: raw };

  const bbox = contoursBBox(contours);
  const straight = p.curvature <= 2;

  ctx.save();
  ctx.globalAlpha = p.opacity;

  const buildPath = () => {
    ctx.beginPath();
    for (const c of contours) drawContourPath(ctx, c, straight);
  };

  if (p.glow && (p.renderMode === "fill" || p.renderMode === "both")) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.filter = `blur(${Math.max(1, (p.glowAmount / 100) * 28)}px)`;
    buildPath();
    ctx.fillStyle = makeCanvasFillStyle(ctx, p, bbox);
    ctx.globalAlpha = p.opacity * Math.min(1, p.glowAmount / 60);
    ctx.fill("evenodd");
    ctx.restore();
  }

  if (p.renderMode === "fill" || p.renderMode === "both") {
    buildPath();
    ctx.fillStyle = makeCanvasFillStyle(ctx, p, bbox);
    ctx.fill("evenodd");
  }
  if (p.renderMode === "stroke" || p.renderMode === "both") {
    buildPath();
    ctx.strokeStyle = p.colorMode === "solid" ? p.color1 : makeCanvasFillStyle(ctx, p, bbox);
    ctx.lineWidth = p.strokeWidth;
    ctx.lineJoin = "round";
    if (p.renderMode === "stroke") ctx.stroke();
    else ctx.stroke();
  }

  if (p.grain && (p.renderMode === "fill" || p.renderMode === "both")) {
    ctx.save();
    buildPath();
    ctx.clip("evenodd");
    const amt = p.grainAmount / 100;
    const nx = Math.max(1, Math.round((bbox.maxX - bbox.minX) / 3));
    const ny = Math.max(1, Math.round((bbox.maxY - bbox.minY) / 3));
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = amt * 0.5;
    for (let gy = 0; gy < ny; gy++) {
      for (let gx = 0; gx < nx; gx++) {
        const v = mulberry32((gx * 928371 + gy * 123457 + Math.floor(time * 2) * 7919) >>> 0)();
        ctx.fillStyle = v > 0.5 ? "#ffffff" : "#000000";
        ctx.fillRect(bbox.minX + gx * 3, bbox.minY + gy * 3, 3, 3);
      }
    }
    ctx.restore();
  }

  ctx.restore();
  return { contours };
}

// ─── SVG export — same contour data, emitted as vector path(s) ────────────

function buildBlobSVG(nodes: BlobNode[], links: BlobLink[], W: number, H: number, time: number, p: BlobParams): string {
  const raw = computeContours(nodes, links, W, H, time, p);
  const contours = smoothContours(raw, p.curvature);
  const straight = p.curvature <= 2;
  const d = contours.map((c) => contourToPathCommands(c, straight)).join(" ");

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  if (p.background === "solid") out.push(`<rect width="${W}" height="${H}" fill="${p.bgColor}"/>`);

  let fillAttr = `fill="${p.color1}"`;
  let strokeAttr = "";
  if (p.colorMode === "gradient") {
    const rad = (p.gradientAngle * Math.PI) / 180;
    const x1 = 50 - Math.cos(rad) * 50, y1 = 50 - Math.sin(rad) * 50;
    const x2 = 50 + Math.cos(rad) * 50, y2 = 50 + Math.sin(rad) * 50;
    out.push(
      `<defs><linearGradient id="g1" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">` +
      `<stop offset="0" stop-color="${p.color1}"/><stop offset="1" stop-color="${p.color2}"/>` +
      `</linearGradient></defs>`
    );
    fillAttr = `fill="url(#g1)"`;
  }
  if (p.renderMode === "stroke") { strokeAttr = `stroke="${p.color1}" stroke-width="${p.strokeWidth}"`; fillAttr = `fill="none"`; }
  else if (p.renderMode === "both") { strokeAttr = `stroke="${p.color1}" stroke-width="${p.strokeWidth}"`; }

  const op = p.opacity < 1 ? ` opacity="${p.opacity}"` : "";
  out.push(`<path d="${d}" fill-rule="evenodd" ${fillAttr} ${strokeAttr} stroke-linejoin="round"${op}/>`);
  out.push(`</svg>`);
  return out.join("");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function timestampName(prefix: string, ext: string) {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${prefix}_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.${ext}`;
}

const HIT_PX = 16;

export default function BlobStudio() {
  const [nodes, setNodes] = useState<BlobNode[]>([]);
  const [links, setLinks] = useState<BlobLink[]>([]);
  const [P, setP] = useState<BlobParams>({ ...DEFAULT_BLOB_PARAMS });
  const [playing, setPlaying] = useState(true);
  const [pendingLink, setPendingLink] = useState<number | null>(null);
  const [genCount, setGenCount] = useState(8);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const linksRef = useRef(links);
  const pRef = useRef(P);
  const playingRef = useRef(playing);
  const timeRef = useRef(0);
  const dirtyRef = useRef(true);
  const WRef = useRef(0), HRef = useRef(0);
  const dragRef = useRef<{ id: number; moved: boolean } | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
    linksRef.current = links;
    pRef.current = P;
    playingRef.current = playing;
  }, [nodes, links, P, playing]);

  // ── resize ────────────────────────────────────────────────────────────
  const handleResize = useCallback(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const r = wrap.getBoundingClientRect();
    const W = Math.max(1, Math.floor(r.width * DPR));
    const H = Math.max(1, Math.floor(r.height * DPR));
    WRef.current = W; HRef.current = H;
    canvas.width = W; canvas.height = H;
    canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
    dirtyRef.current = true;
  }, []);

  useEffect(() => {
    handleResize();
    let tid: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(tid); tid = setTimeout(handleResize, 140); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [handleResize]);

  // ── animation loop ───────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      const W = WRef.current, H = HRef.current;
      if (!canvas || W === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const animating = playingRef.current && pRef.current.idleAmount > 0;
      if (animating) timeRef.current = now / 1000;
      if (animating || dirtyRef.current) {
        renderBlob(ctx, nodesRef.current, linksRef.current, W, H, timeRef.current, pRef.current);
        if (!animating) dirtyRef.current = false;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setParam = useCallback(<K extends keyof BlobParams>(key: K, val: BlobParams[K]) => {
    setP((p) => ({ ...p, [key]: val }));
    dirtyRef.current = true;
  }, []);

  // ── node/link editing helpers ────────────────────────────────────────
  const addNode = useCallback((nx: number, ny: number) => {
    const p = pRef.current;
    const rng = mulberry32(Date.now() & 0xffffffff);
    const r = p.minRadiusN + rng() * (p.maxRadiusN - p.minRadiusN);
    const n: BlobNode = { id: nextNodeId(), x: nx, y: ny, r, seed: rng() * 1000 };
    setNodes((prev) => [...prev, n]);
    dirtyRef.current = true;
  }, []);

  const removeNode = useCallback((id: number) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setLinks((prev) => prev.filter((l) => l.a !== id && l.b !== id));
    dirtyRef.current = true;
  }, []);

  const toggleLink = useCallback((a: number, b: number) => {
    setLinks((prev) => {
      const exists = prev.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
      dirtyRef.current = true;
      return exists ? prev.filter((l) => !((l.a === a && l.b === b) || (l.a === b && l.b === a))) : [...prev, { a, b }];
    });
  }, []);

  const hitTest = useCallback((px: number, py: number): BlobNode | null => {
    const W = WRef.current, H = HRef.current;
    let best: BlobNode | null = null, bestD = Infinity;
    for (const n of nodesRef.current) {
      const nx = n.x * W, ny = n.y * H;
      const d = Math.hypot(px - nx, py - ny);
      const grabR = Math.max(n.r * Math.min(W, H), HIT_PX);
      if (d <= grabR && d < bestD) { best = n; bestD = d; }
    }
    return best;
  }, []);

  const toLocal = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const DPR = WRef.current / rect.width;
    return { px: (e.clientX - rect.left) * DPR, py: (e.clientY - rect.top) * DPR };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { px, py } = toLocal(e);
    const hit = hitTest(px, py);
    if (hit) {
      dragRef.current = { id: hit.id, moved: false };
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    } else if (pRef.current.linkMode !== "manual" || pendingLink === null) {
      const W = WRef.current, H = HRef.current;
      addNode(px / W, py / H);
    }
  }, [toLocal, hitTest, addNode, pendingLink]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { px, py } = toLocal(e);
    const W = WRef.current, H = HRef.current;
    drag.moved = true;
    setNodes((prev) => prev.map((n) => (n.id === drag.id ? { ...n, x: Math.min(1, Math.max(0, px / W)), y: Math.min(1, Math.max(0, py / H)) } : n)));
    dirtyRef.current = true;
  }, [toLocal]);

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (!drag.moved && pRef.current.linkMode === "manual") {
      if (pendingLink === null) setPendingLink(drag.id);
      else if (pendingLink === drag.id) setPendingLink(null);
      else { toggleLink(pendingLink, drag.id); setPendingLink(null); }
    }
  }, [pendingLink, toggleLink]);

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const DPR = WRef.current / rect.width;
    const px = (e.clientX - rect.left) * DPR, py = (e.clientY - rect.top) * DPR;
    const hit = hitTest(px, py);
    if (hit) removeNode(hit.id);
  }, [hitTest, removeNode]);

  // ── generate / clear ─────────────────────────────────────────────────
  const generateNodes = useCallback(() => {
    const p = pRef.current;
    const rng = mulberry32(Date.now() & 0xffffffff);
    const list: BlobNode[] = [];
    for (let i = 0; i < genCount; i++) {
      const r = p.minRadiusN + rng() * (p.maxRadiusN - p.minRadiusN);
      list.push({ id: nextNodeId(), x: 0.15 + rng() * 0.7, y: 0.15 + rng() * 0.7, r, seed: rng() * 1000 });
    }
    setNodes(list);
    setLinks([]);
    setPendingLink(null);
    dirtyRef.current = true;
  }, [genCount]);

  const clearAll = useCallback(() => {
    setNodes([]); setLinks([]); setPendingLink(null); dirtyRef.current = true;
  }, []);

  // auto-links (nearest / distance) recompute whenever nodes (including drags)
  // or those settings change, so links stay live while repositioning points
  useEffect(() => {
    if (P.linkMode === "manual" || P.linkMode === "none") return;
    const list = nodes;
    const next: BlobLink[] = [];
    const seen = new Set<string>();
    const add = (a: number, b: number) => {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!seen.has(k)) { seen.add(k); next.push({ a, b }); }
    };
    if (P.linkMode === "nearest") {
      for (const n of list) {
        const others = list.filter((o) => o.id !== n.id)
          .map((o) => ({ o, d: Math.hypot(o.x - n.x, o.y - n.y) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, P.linkNearestK);
        for (const { o } of others) add(n.id, o.id);
      }
    } else if (P.linkMode === "distance") {
      const avgR = list.reduce((s, n) => s + n.r, 0) / Math.max(1, list.length);
      const maxD = P.linkDistance * avgR * 2.2;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) <= maxD) add(list[i].id, list[j].id);
        }
      }
    }
    setLinks(next);
    dirtyRef.current = true;
  }, [nodes, P.linkMode, P.linkNearestK, P.linkDistance]);

  // ── export ────────────────────────────────────────────────────────────
  const [scale, setScale] = useState(2);
  const [copied, setCopied] = useState(false);

  const exportPNG = useCallback(() => {
    const W = WRef.current, H = HRef.current;
    if (W === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    renderBlob(ctx, nodesRef.current, linksRef.current, W, H, timeRef.current, pRef.current);
    canvas.toBlob((blob) => { if (blob) downloadBlob(blob, timestampName("upgm-fusao", "png")); }, "image/png");
  }, [scale]);

  const exportSVG = useCallback(() => {
    const W = WRef.current, H = HRef.current;
    if (W === 0) return;
    const svg = buildBlobSVG(nodesRef.current, linksRef.current, W, H, timeRef.current, pRef.current);
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), timestampName("upgm-fusao", "svg"));
  }, []);

  const copyPNG = useCallback(async () => {
    const W = WRef.current, H = HRef.current;
    if (W === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    renderBlob(ctx, nodesRef.current, linksRef.current, W, H, timeRef.current, pRef.current);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true); setTimeout(() => setCopied(false), 1500);
      } catch { /* clipboard unavailable */ }
    }, "image/png");
  }, [scale]);

  const hasContent = nodes.length > 0;

  return (
    <div className="flex flex-1 min-h-0">
      <div
        ref={wrapRef}
        className="flex-1 relative min-w-0 flex items-center justify-center bg-ink overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          className="block w-full h-full cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onDoubleClick={onDoubleClick}
        />

        {/* node markers overlay */}
        {P.showNodes && nodes.map((n) => (
          <div
            key={n.id}
            className={`pointer-events-none absolute rounded-full border ${
              pendingLink === n.id ? "border-red bg-red/20" : "border-white/30"
            }`}
            style={{
              left: `${n.x * 100}%`, top: `${n.y * 100}%`,
              width: 6, height: 6, transform: "translate(-50%,-50%)",
            }}
          />
        ))}

        {!hasContent && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none px-6 text-center">
            <p className="mono text-[10px] uppercase tracking-[.22em] text-muted mb-2">05 / Fusão</p>
            <p className="text-lg font-bold tracking-tight text-[var(--text)]">Comece adicionando pontos</p>
            <p className="mt-1 max-w-sm text-[13px] text-muted">
              Clique no canvas para posicionar o primeiro ponto — ou gere um grupo aleatório pelo painel ao lado.
            </p>
          </div>
        )}

        {/* transport */}
        <div className="glass absolute left-1/2 -translate-x-1/2 bottom-4 flex items-center gap-3 rounded-full px-4 py-2">
          <button onClick={() => setPlaying((v) => !v)} className="btn-primary w-7 h-7 flex items-center justify-center text-[12px]">
            {playing ? "❚❚" : "▶"}
          </button>
          <span className="mono text-[10px] text-muted shrink-0 whitespace-nowrap">
            <b className="text-[var(--text)]">{nodes.length}</b> pontos · <b className="text-[var(--text)]">{links.length}</b> vínculos
          </span>
          {pendingLink !== null && (
            <span className="mono text-[10px] text-red shrink-0">clique em outro ponto pra conectar</span>
          )}
        </div>
      </div>

      <aside className="glass-sidebar flex w-[320px] shrink-0 flex-col overflow-hidden">
        <div className="thin-scroll flex-1 overflow-y-auto">
          <Section title="Pontos">
            <div>
              <label className="label mb-1 block">Quantidade a gerar</label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={2} max={40} step={1} value={genCount}
                  onChange={(e) => setGenCount(parseInt(e.target.value))}
                  className="rng w-full"
                />
                <span className="mono text-[11px] text-red w-6 text-right">{genCount}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={generateNodes} className="btn-glass flex-1 py-2 text-[11px] mono uppercase tracking-widest">
                Gerar aleatório
              </button>
              <button onClick={clearAll} disabled={!hasContent} className="btn-glass flex-1 py-2 text-[11px] mono uppercase tracking-widest">
                Limpar tudo
              </button>
            </div>
            <Slider label="Raio mín." value={P.minRadiusN * 100} min={1} max={20} step={0.5} fmt={(v) => v.toFixed(1)} onChange={(v) => setParam("minRadiusN", v / 100)} />
            <Slider label="Raio máx." value={P.maxRadiusN * 100} min={2} max={30} step={0.5} fmt={(v) => v.toFixed(1)} onChange={(v) => setParam("maxRadiusN", v / 100)} />
            <p className="text-[10px] leading-relaxed text-muted">
              Clique no canvas para adicionar um ponto · arraste para mover · duplo clique remove.
            </p>
          </Section>

          <Section title="Fusão">
            <Slider label="Intensidade" value={P.fusion} min={0} max={100} step={1} fmt={Math.round} onChange={(v) => setParam("fusion", v)} />
            <Slider label="Nitidez" value={P.sharpness} min={0} max={100} step={1} fmt={Math.round} onChange={(v) => setParam("sharpness", v)} />
            <div>
              <label className="label mb-1 block">Qualidade</label>
              <Segmented
                value={P.quality}
                onChange={(v) => setParam("quality", v as Quality)}
                options={[
                  { value: "draft", label: "Rascunho" },
                  { value: "medium", label: "Média" },
                  { value: "high", label: "Alta" },
                ]}
              />
            </div>
          </Section>

          <Section title="Conexões">
            <Segmented
              value={P.linkMode}
              onChange={(v) => { setParam("linkMode", v as LinkMode); setPendingLink(null); }}
              options={[
                { value: "none", label: "Nenhuma" },
                { value: "nearest", label: "Vizinhos" },
                { value: "distance", label: "Distância" },
                { value: "manual", label: "Manual" },
              ]}
            />
            {P.linkMode === "nearest" && (
              <Slider label="Vizinhos por ponto" value={P.linkNearestK} min={1} max={5} step={1} onChange={(v) => setParam("linkNearestK", Math.round(v))} />
            )}
            {P.linkMode === "distance" && (
              <Slider label="Distância máxima" value={P.linkDistance} min={0.5} max={4} step={0.1} unit="×" onChange={(v) => setParam("linkDistance", v)} />
            )}
            {P.linkMode === "manual" && (
              <p className="text-[10px] leading-relaxed text-muted">Clique em um ponto e depois em outro para conectar (ou desconectar) os dois.</p>
            )}
            {P.linkMode !== "none" && (
              <Slider label="Espessura do vínculo" value={P.linkWidth} min={5} max={100} step={1} fmt={Math.round} onChange={(v) => setParam("linkWidth", v)} />
            )}
          </Section>

          <Section title="Estilo">
            <Segmented
              value={P.renderMode}
              onChange={(v) => setParam("renderMode", v as RenderMode)}
              options={[
                { value: "fill", label: "Preenchido" },
                { value: "stroke", label: "Contorno" },
                { value: "both", label: "Ambos" },
              ]}
            />
            {(P.renderMode === "stroke" || P.renderMode === "both") && (
              <Slider label="Espessura do contorno" value={P.strokeWidth} min={0.5} max={20} step={0.5} unit="px" onChange={(v) => setParam("strokeWidth", v)} />
            )}
            <Slider label="Curvatura" value={P.curvature} min={0} max={100} step={1} fmt={Math.round} onChange={(v) => setParam("curvature", v)} />
          </Section>

          <Section title="Cores">
            <Segmented
              value={P.colorMode}
              onChange={(v) => setParam("colorMode", v as ColorMode)}
              options={[
                { value: "solid", label: "Sólida" },
                { value: "gradient", label: "Gradiente" },
              ]}
            />
            <ColorField label="Cor principal" value={P.color1} onChange={(v) => setParam("color1", v)} />
            {P.colorMode === "gradient" && (
              <>
                <ColorField label="Cor secundária" value={P.color2} onChange={(v) => setParam("color2", v)} />
                <Slider label="Ângulo" value={P.gradientAngle} min={0} max={360} step={1} unit="°" onChange={(v) => setParam("gradientAngle", v)} />
              </>
            )}
            <div className="pt-1">
              <Segmented
                value={P.background}
                onChange={(v) => setParam("background", v as BlobParams["background"])}
                options={[
                  { value: "transparent", label: "Transparente" },
                  { value: "solid", label: "Fundo sólido" },
                ]}
              />
            </div>
            {P.background === "solid" && <ColorField label="Cor do fundo" value={P.bgColor} onChange={(v) => setParam("bgColor", v)} />}
            <Slider label="Opacidade" value={P.opacity} min={0} max={1} step={0.01} fmt={(v) => Math.round(v * 100) + "%"} onChange={(v) => setParam("opacity", v)} />
          </Section>

          <Section title="Efeitos">
            <Toggle label="Brilho (glow)" value={P.glow} onChange={(v) => setParam("glow", v)} />
            {P.glow && <Slider label="Intensidade do brilho" value={P.glowAmount} min={0} max={100} step={1} fmt={Math.round} onChange={(v) => setParam("glowAmount", v)} />}
            <Toggle label="Grão / textura" value={P.grain} onChange={(v) => setParam("grain", v)} />
            {P.grain && <Slider label="Intensidade do grão" value={P.grainAmount} min={0} max={100} step={1} fmt={Math.round} onChange={(v) => setParam("grainAmount", v)} />}
          </Section>

          <Section title="Movimento" className="border-b-0">
            <Slider label="Intensidade" value={P.idleAmount} min={0} max={100} step={1} fmt={Math.round} onChange={(v) => setParam("idleAmount", v)} />
            <Slider label="Velocidade" value={P.idleSpeed} min={0} max={100} step={1} fmt={Math.round} onChange={(v) => setParam("idleSpeed", v)} />
            <Toggle label="Mostrar pontos" value={P.showNodes} onChange={(v) => setParam("showNodes", v)} />
          </Section>
        </div>

        {/* Export */}
        <div className="border-t border-line bg-white/[0.02] px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="label text-[var(--text)]">Exportar</h3>
            <div className="flex gap-1">
              {[1, 2, 4].map((s) => (
                <button key={s} onClick={() => setScale(s)} className={`rounded-full px-2 py-0.5 text-[11px] ${scale === s ? "seg-active" : "seg-idle bg-white/[0.04]"}`}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={exportPNG} disabled={!hasContent} className="btn-glass py-2.5 text-xs font-medium">PNG</button>
            <button onClick={exportSVG} disabled={!hasContent} className="btn-glass py-2.5 text-xs font-medium">SVG</button>
          </div>
          <button onClick={copyPNG} disabled={!hasContent} className="btn-primary mt-2 w-full py-2.5 text-xs disabled:opacity-40">
            {copied ? "Copiado!" : "Copiar PNG"}
          </button>
        </div>
      </aside>
    </div>
  );
}
