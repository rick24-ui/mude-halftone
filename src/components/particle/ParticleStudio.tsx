"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelSection, PanelSlider as Slider, SegmentedRow, Toggle as KitToggle, PresetGrid } from "@/components/ui/panel";

// ─── types ──────────────────────────────────────────────────────────────────

type Motion = "inplace" | "rise" | "fall" | "drift" | "radial" | "swirl" | "scatter";
type Shape = "circle" | "square" | "diamond" | "ring";
type Easing = "linear" | "in" | "out" | "inout";
type ColorMode = "original" | "white" | "custom";
type ExFormat = "landscape" | "portrait" | "square";
type ExCycle = "once" | "pingpong";
type MorphStyle = "direct" | "burst" | "wave" | "swirl" | "rise" | "scatter";

interface Params {
  density: number; size: number; sizeVar: number; shape: Shape;
  disp: number; turb: number; tscale: number; flow: number;
  grav: number; wind: number; centerBias: number;
  spread: number; easing: Easing; motion: Motion; dur: number;
  bookend: boolean; introSec: number; outroSec: number; idle: number;
  mTransDisp: number; morphStyle: MorphStyle;
  colorMode: ColorMode; customColor: string;
  opacity: number; fade: number; trail: number;
  glow: boolean; glowAmt: number; bg: string;
  fps: number; exFormat: ExFormat; exQuality: number; exCycle: ExCycle;
}

interface Particle {
  hx: number; hy: number;
  r: number; g: number; b: number;
  sz: number; seed: number; delay: number;
  bx: number; by: number; rx: number; ry: number;
}

interface MorphFrame {
  x: Float32Array; y: Float32Array;
  r: Float32Array; g: Float32Array; b: Float32Array;
}

interface MorphPool {
  frames: MorphFrame[];
  stat: Array<{ seed: number; sz: number }>;
  N: number;
}

interface MorphSlot {
  img: HTMLImageElement;
  name: string;
  thumb: string;
  hold: number;
  trans: number;
}

interface Preset {
  name: string;
  desc: string;
  p: Partial<Params>;
}

// ─── constants ───────────────────────────────────────────────────────────────

const DEFAULTS: Params = {
  density: 52, size: 1.8, sizeVar: 40, shape: "circle",
  disp: 35, turb: 25, tscale: 45, flow: 35, grav: 0, wind: 0, centerBias: 60,
  spread: 65, easing: "inout", motion: "inplace", dur: 5,
  bookend: true, introSec: 1, outroSec: 1, idle: 12,
  mTransDisp: 55, morphStyle: "burst",
  colorMode: "original", customColor: "#d00000",
  opacity: 88, fade: 80, trail: 30,
  glow: true, glowAmt: 55, bg: "#0a0a0a",
  fps: 30, exFormat: "landscape", exQuality: 1080, exCycle: "once",
};

const PRESETS: Preset[] = [
  { name: "Respiro",    desc: "dissolve no lugar",  p: { motion: "inplace", disp: 12, turb: 30, tscale: 55, flow: 18, grav: 0, wind: 0, fade: 90, easing: "inout", dur: 6, spread: 70, trail: 35, shape: "circle", glow: true, glowAmt: 55, size: 1.8 } },
  { name: "Ascensão",   desc: "sobe como fumaça",   p: { motion: "rise",    disp: 42, turb: 32, tscale: 42, flow: 22, grav: -4, wind: 2, fade: 85, easing: "out",   dur: 7, spread: 80, trail: 40, shape: "circle", glow: true, glowAmt: 60, size: 1.6 } },
  { name: "Névoa",      desc: "tremor etéreo",       p: { motion: "inplace", disp: 8,  turb: 55, tscale: 60, flow: 24, grav: 0, wind: 0, fade: 55, easing: "inout", dur: 8, spread: 60, trail: 78, shape: "circle", glow: true, glowAmt: 65, size: 1.4 } },
  { name: "Deriva",     desc: "desliza pro lado",    p: { motion: "drift",   disp: 38, turb: 20, tscale: 40, flow: 20, grav: 0, wind: 10, fade: 70, easing: "inout", dur: 7, spread: 75, trail: 45, shape: "circle", glow: true, glowAmt: 50, size: 1.7 } },
  { name: "Dissolução", desc: "radial gentil",       p: { motion: "radial",  disp: 34, turb: 18, tscale: 38, flow: 18, grav: 0, wind: 0, fade: 82, easing: "out",   dur: 6, spread: 72, trail: 38, shape: "circle", glow: true, glowAmt: 55, size: 1.7 } },
  { name: "Vórtice",    desc: "giro lento",          p: { motion: "swirl",   disp: 30, turb: 22, tscale: 45, flow: 20, grav: 0, wind: 0, fade: 75, easing: "inout", dur: 7, spread: 70, trail: 42, shape: "circle", glow: true, glowAmt: 58, size: 1.6 } },
  { name: "Cinzas",     desc: "cai devagar",         p: { motion: "fall",    disp: 30, turb: 24, tscale: 42, flow: 18, grav: 6, wind: 2, fade: 85, easing: "in",    dur: 7, spread: 78, trail: 40, shape: "square", glow: true, glowAmt: 48, size: 1.5 } },
  { name: "Cintilar",   desc: "brilha parado",       p: { motion: "inplace", disp: 5,  turb: 40, tscale: 70, flow: 30, grav: 0, wind: 0, fade: 28, easing: "inout", dur: 5, spread: 50, trail: 30, shape: "circle", glow: true, glowAmt: 80, size: 1.8 } },
];

// ─── pure math ───────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function computeStep(density: number) {
  return Math.max(1, Math.round(7 - (density - 6) / 94 * 6));
}

function bezCoord(t: number, a: number, b: number) {
  const mt = 1 - t; return 3 * mt * mt * t * a + 3 * mt * t * t * b + t * t * t;
}
function bezDeriv(t: number, a: number, b: number) {
  const mt = 1 - t; return 3 * mt * mt * a + 6 * mt * t * (b - a) + 3 * t * t * (1 - b);
}
function cubicBezierY(u: number, x1: number, y1: number, x2: number, y2: number) {
  if (u <= 0) return 0; if (u >= 1) return 1;
  let t = u;
  for (let i = 0; i < 8; i++) {
    const x = bezCoord(t, x1, x2) - u;
    if (Math.abs(x) < 1e-4) break;
    const d = bezDeriv(t, x1, x2);
    if (Math.abs(d) < 1e-6) break;
    t -= x / d; if (t < 0) t = 0; else if (t > 1) t = 1;
  }
  return bezCoord(t, y1, y2);
}
function easeVal(t: number, m: Easing): number {
  if (m === "in") return t * t * t;
  if (m === "out") { const u = 1 - t; return 1 - u * u * u; }
  if (m === "inout") return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return t;
}
function hexToRgb(hex: string) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
}
function hexToRgba(hex: string, a: number) {
  const c = hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`;
}

// ─── image sampling ───────────────────────────────────────────────────────────

function samplePoints(img: HTMLImageElement, EW: number, EH: number, step: number): [number, number, number, number, number][] {
  const iw = img.width, ih = img.height, margin = 0.82;
  const scale = Math.min(EW * margin / iw, EH * margin / ih);
  const dw = Math.max(1, Math.round(iw * scale)), dh = Math.max(1, Math.round(ih * scale));
  const ox = Math.round((EW - dw) / 2), oy = Math.round((EH - dh) / 2);
  const off = document.createElement("canvas"); off.width = dw; off.height = dh;
  const o = off.getContext("2d")!; o.drawImage(img, 0, 0, dw, dh);
  let data: Uint8ClampedArray;
  try { data = o.getImageData(0, 0, dw, dh).data; } catch { return []; }
  let opaqueCount = 0, checks = 0;
  for (let s = 3; s < data.length; s += 4 * 97) { checks++; if (data[s] > 248) opaqueCount++; }
  const opaque = checks > 0 && opaqueCount / checks > 0.92;
  const pts: [number, number, number, number, number][] = [];
  for (let y = 0; y < dh; y += step) {
    for (let x = 0; x < dw; x += step) {
      const i = (y * dw + x) * 4;
      const al = data[i + 3], rr = data[i], gg = data[i + 1], bb = data[i + 2];
      const inc = opaque ? (0.299 * rr + 0.587 * gg + 0.114 * bb) > 14 : al > 28;
      if (inc) pts.push([ox + x, oy + y, rr, gg, bb]);
    }
  }
  return pts;
}

function buildSet(img: HTMLImageElement | null, W: number, H: number, P: Params, stepScale = 1): Particle[] {
  if (!img) return [];
  const step = Math.max(1, Math.round(computeStep(P.density) * stepScale));
  let pts = samplePoints(img, W, H, step);
  const rng = mulberry32(1337);
  const CAP = 200000;
  if (pts.length > CAP) {
    const keep = CAP / pts.length;
    pts = pts.filter(() => rng() < keep);
  }
  const cx = W / 2, cy = H / 2, m = P.motion;
  return pts.map(d => {
    const hx = d[0], hy = d[1], dx = hx - cx, dy = hy - cy, len = Math.sqrt(dx * dx + dy * dy) || 1;
    let bx: number, by: number;
    if (m === "rise")    { bx = (rng() - 0.5) * 0.5; by = -1; }
    else if (m === "fall")  { bx = (rng() - 0.5) * 0.5; by = 1; }
    else if (m === "drift") { bx = 1; by = (rng() - 0.5) * 0.4; }
    else if (m === "radial"){ bx = dx / len; by = dy / len; }
    else if (m === "swirl") { bx = -dy / len; by = dx / len; }
    else if (m === "scatter"){ const an = rng() * 6.2832; bx = Math.cos(an); by = Math.sin(an); }
    else { const a2 = rng() * 6.2832; bx = Math.cos(a2) * 0.18; by = Math.sin(a2) * 0.18; }
    return { hx, hy, r: d[2], g: d[3], b: d[4], sz: 0.6 + rng() * 1.4, seed: rng() * 1000, delay: rng(), bx, by, rx: dx / len, ry: dy / len };
  });
}

function buildMorphPool(slots: MorphSlot[], EW: number, EH: number, P: Params, stepScale = 1): MorphPool | null {
  if (slots.length < 1) return null;
  const step = Math.max(1, Math.round(computeStep(P.density) * stepScale));
  const CAP = 90000;
  const slotPts: [number, number, number, number, number][][] = [];
  let maxN = 0;
  for (let s = 0; s < slots.length; s++) {
    const rng = mulberry32(1234 + s * 777);
    let pts = samplePoints(slots[s].img, EW, EH, step);
    if (pts.length > CAP) { const keep = CAP / pts.length; pts = pts.filter(() => rng() < keep); }
    for (let i = pts.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [pts[i], pts[j]] = [pts[j], pts[i]]; }
    slotPts.push(pts);
    if (pts.length > maxN) maxN = pts.length;
  }
  if (maxN < 1) return null;
  const N = maxN;
  const frames: MorphFrame[] = slotPts.map(pk => {
    const L = pk.length || 1;
    const fx = new Float32Array(N), fy = new Float32Array(N), fr = new Float32Array(N), fg = new Float32Array(N), fb = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const src = pk[i % L] ?? [EW / 2, EH / 2, 255, 255, 255];
      fx[i] = src[0]; fy[i] = src[1]; fr[i] = src[2]; fg[i] = src[3]; fb[i] = src[4];
    }
    return { x: fx, y: fy, r: fr, g: fg, b: fb };
  });
  const srng = mulberry32(9090);
  const stat = Array.from({ length: N }, () => ({ seed: srng() * 1000, sz: 0.6 + srng() * 1.4 }));
  return { frames, stat, N };
}

// ─── drawing ──────────────────────────────────────────────────────────────────

function drawParticles(g: CanvasRenderingContext2D, a: number, time: number, W: number, H: number, unit: number, particles: Particle[], P: Params) {
  const diag = Math.sqrt(W * W + H * H);
  const dispMag = (P.disp / 100) * diag * 0.6;
  const windPx = P.wind * 0.012 * diag;
  const gravPx = P.grav * 0.012 * diag;
  const tAmp = (P.turb / 100) * 70 * unit;
  const tf = ((P.tscale / 100) * 0.02 + 0.003) / (unit / (window.devicePixelRatio || 1));
  const sp = P.flow / 50;
  const idleAmp = (P.idle / 100) * 9 * unit;
  const baseOp = P.opacity / 100, fadeAmt = P.fade / 100;
  const sizeBase = P.size * unit, sizeVarF = P.sizeVar / 100, spread = P.spread / 100;
  const colMode = P.colorMode;
  const cc = colMode === "custom" ? hexToRgb(P.customColor) : null;
  const shape = P.shape;
  const cb = P.centerBias / 100;

  for (const p of particles) {
    let localRaw = (a - p.delay * spread) / (1 - spread + 1e-4);
    if (localRaw < 0) localRaw = 0; else if (localRaw > 1) localRaw = 1;
    const pe = localRaw;
    const efx = p.bx * (1 - cb) + p.rx * cb, efy = p.by * (1 - cb) + p.ry * cb;
    let tox = 0, toy = 0;
    if (tAmp > 0 && pe > 0) {
      tox = Math.sin(p.hy * tf + time * sp + p.seed) * tAmp * pe;
      toy = Math.cos(p.hx * tf + time * sp * 0.8 + p.seed * 1.7) * tAmp * pe;
    }
    if (idleAmp > 0) {
      tox += Math.sin(p.hy * tf * 1.7 + time * 0.9 + p.seed) * idleAmp;
      toy += Math.cos(p.hx * tf * 1.7 + time * 0.75 + p.seed * 1.3) * idleAmp;
    }
    const x = p.hx + efx * dispMag * pe + windPx * pe + tox;
    const y = p.hy + efy * dispMag * pe + gravPx * pe + toy;
    const alpha = baseOp * (1 - pe * fadeAmt);
    if (alpha <= 0.012) continue;
    let sz = sizeBase * (1 + (p.sz - 1) * sizeVarF);
    if (sz < 0.6) sz = 0.6;
    let cs: string;
    if (colMode === "original") cs = `${p.r},${p.g},${p.b}`;
    else if (colMode === "white") cs = "255,255,255";
    else cs = `${cc!.r},${cc!.g},${cc!.b}`;
    const style = `rgba(${cs},${alpha})`;
    if (shape === "square") { g.fillStyle = style; g.fillRect(x - sz / 2, y - sz / 2, sz, sz); }
    else if (shape === "circle") { g.fillStyle = style; g.beginPath(); g.arc(x, y, sz / 2, 0, 6.2832); g.fill(); }
    else if (shape === "diamond") { const h = sz / 2; g.fillStyle = style; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h, y); g.lineTo(x, y + h); g.lineTo(x - h, y); g.closePath(); g.fill(); }
    else { g.strokeStyle = style; g.lineWidth = Math.max(1, sz * 0.32); g.beginPath(); g.arc(x, y, sz / 2, 0, 6.2832); g.stroke(); }
  }
}

function morphTimeMap(M: number, slots: MorphSlot[], bookend: boolean) {
  const list: Array<{ type: string; k: number; w: number; start: number; end: number; wrap?: boolean }> = [];
  let total = 0;
  for (let k = 0; k < M; k++) {
    const sl = slots[k];
    list.push({ type: "hold", k, w: Math.max(0.05, sl.hold), start: 0, end: 0 });
    if (k < M - 1) list.push({ type: "trans", k, w: Math.max(0.1, sl.trans), start: 0, end: 0 });
  }
  if (bookend && M >= 2) {
    const tb = Math.max(0.1, slots[M - 1].trans);
    list.push({ type: "trans", k: M - 1, w: tb, wrap: true, start: 0, end: 0 });
  }
  if (!list.length) list.push({ type: "hold", k: 0, w: 1, start: 0, end: 0 });
  for (const item of list) total += item.w;
  let acc = 0;
  for (const item of list) { item.start = acc / total; acc += item.w; item.end = acc / total; }
  return list;
}

function drawMorph(g: CanvasRenderingContext2D, tn: number, time: number, W: number, H: number, unit: number, pool: MorphPool, slots: MorphSlot[], P: Params) {
  const { frames, stat, N } = pool; const M = frames.length;
  const cx = W / 2, cy = H / 2;
  const diag = Math.sqrt(W * W + H * H);
  const burstBase = (P.mTransDisp / 100) * diag * 0.5;
  const tAmp = (P.turb / 100) * 70 * unit;
  const tf = ((P.tscale / 100) * 0.02 + 0.003) / (unit / (window.devicePixelRatio || 1));
  const spFlow = P.flow / 50;
  const idleAmp = (P.idle / 100) * 9 * unit;
  const baseOp = P.opacity / 100, sizeBase = P.size * unit, sizeVarF = P.sizeVar / 100;
  const colMode = P.colorMode;
  const cc = colMode === "custom" ? hexToRgb(P.customColor) : null;
  const shape = P.shape;
  const dur = P.bookend ? (slots.reduce((s, sl, i) => {
    s += Math.max(0.05, sl.hold);
    if (i < slots.length - 1) s += Math.max(0.1, sl.trans);
    return s;
  }, 0) + Math.max(0.1, slots[slots.length - 1].trans)) : undefined;

  const T = P.bookend && dur ? dur + P.introSec + P.outroSec : undefined;
  const iS = P.bookend ? P.introSec : 0, oS = P.bookend ? P.outroSec : 0;
  const tSec = tn * (T ?? (dur ?? P.dur));
  let u: number;
  if (P.bookend && tSec < iS) u = 0;
  else if (T && P.bookend && tSec > (T ?? 0) - oS) u = 1;
  else {
    const aD = (T ?? (dur ?? P.dur)) - iS - oS;
    u = Math.max(0, Math.min(1, (tSec - iS) / (aD || 1)));
    if (!P.bookend && P.exCycle === "pingpong") u = u <= 0.5 ? u * 2 : 2 * (1 - u);
  }

  const segs = morphTimeMap(M, slots, P.bookend);
  let seg = segs[segs.length - 1];
  for (const s of segs) { if (u >= s.start && u < s.end) { seg = s; break; } }
  const k = Math.min(seg.k, M - 1);
  let kb: number, lu: number;
  if (seg.type === "hold") { kb = k; lu = 0; }
  else { kb = seg.wrap ? 0 : Math.min(M - 1, k + 1); lu = Math.max(0, Math.min(1, (u - seg.start) / ((seg.end - seg.start) || 1))); }
  const fA = frames[k], fB = frames[kb];
  const isTrans = seg.type === "trans";
  const easedG = isTrans ? easeVal(lu, P.easing) : 0;
  const waveW = 0.55, maxD = diag * 0.5;

  for (let i = 0; i < N; i++) {
    const ax = fA.x[i], ay = fA.y[i], bx2 = fB.x[i], by2 = fB.y[i];
    const st = stat[i];
    let easedP = easedG, luP = lu;
    if (isTrans && P.morphStyle === "wave") {
      const dx0 = ax - cx, dy0 = ay - cy;
      const dfrac = Math.min(1, Math.sqrt(dx0 * dx0 + dy0 * dy0) / maxD);
      luP = Math.max(0, Math.min(1, (lu - dfrac * waveW) / (1 - waveW)));
      easedP = easeVal(luP, P.easing);
    }
    let px = ax + (bx2 - ax) * easedP, py = ay + (by2 - ay) * easedP;
    if (isTrans) {
      const burst = Math.sin(luP * Math.PI);
      if (burst > 0.001) {
        const mag = burstBase * burst;
        const ddx = px - cx, ddy = py - cy, dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        const rvx = ddx / dl, rvy = ddy / dl;
        let uvx: number, uvy: number;
        if (P.morphStyle === "swirl")   { uvx = -rvy * 0.9 + rvx * 0.35; uvy = rvx * 0.9 + rvy * 0.35; }
        else if (P.morphStyle === "rise")    { uvx = Math.sin(st.seed) * 0.35; uvy = -1; }
        else if (P.morphStyle === "scatter") { uvx = Math.cos(st.seed * 7.13); uvy = Math.sin(st.seed * 7.13); }
        else if (P.morphStyle === "direct")  { uvx = rvx; uvy = rvy; mag * 0.15; uvx = rvx; }
        else { uvx = rvx; uvy = rvy; }
        let ttx = 0, tty = 0;
        if (tAmp > 0) { ttx = Math.sin(py * tf + time * spFlow + st.seed) * tAmp * burst; tty = Math.cos(px * tf + time * spFlow * 0.8 + st.seed * 1.7) * tAmp * burst; }
        px += uvx * mag + ttx; py += uvy * mag + tty;
      }
    }
    if (idleAmp > 0) {
      px += Math.sin(py * tf * 1.7 + time * 0.9 + st.seed) * idleAmp;
      py += Math.cos(px * tf * 1.7 + time * 0.75 + st.seed * 1.3) * idleAmp;
    }
    let cs: string;
    if (colMode === "original") {
      const r = (fA.r[i] + (fB.r[i] - fA.r[i]) * easedP) | 0;
      const gv = (fA.g[i] + (fB.g[i] - fA.g[i]) * easedP) | 0;
      const bl = (fA.b[i] + (fB.b[i] - fA.b[i]) * easedP) | 0;
      cs = `${r},${gv},${bl}`;
    } else if (colMode === "white") cs = "255,255,255";
    else cs = `${cc!.r},${cc!.g},${cc!.b}`;
    const stylec = `rgba(${cs},${baseOp})`;
    let sz = sizeBase * (1 + (st.sz - 1) * sizeVarF); if (sz < 0.6) sz = 0.6;
    if (shape === "square") { g.fillStyle = stylec; g.fillRect(px - sz / 2, py - sz / 2, sz, sz); }
    else if (shape === "circle") { g.fillStyle = stylec; g.beginPath(); g.arc(px, py, sz / 2, 0, 6.2832); g.fill(); }
    else if (shape === "diamond") { const h = sz / 2; g.fillStyle = stylec; g.beginPath(); g.moveTo(px, py - h); g.lineTo(px + h, py); g.lineTo(px, py + h); g.lineTo(px - h, py); g.closePath(); g.fill(); }
    else { g.strokeStyle = stylec; g.lineWidth = Math.max(1, sz * 0.32); g.beginPath(); g.arc(px, py, sz / 2, 0, 6.2832); g.stroke(); }
  }
}

function bloomFrom(dst: CanvasRenderingContext2D, srcCanvas: HTMLCanvasElement, amount: number, scale: number) {
  if (amount <= 0) return;
  dst.save();
  dst.globalCompositeOperation = "lighter";
  dst.filter = `blur(${(4 + amount * 0.22) * scale}px)`;
  dst.globalAlpha = Math.min(1, amount / 100 * 0.8);
  dst.drawImage(srcCanvas, 0, 0);
  dst.filter = `blur(${(1.4 + amount * 0.09) * scale}px)`;
  dst.globalAlpha = Math.min(1, amount / 100 * 0.65);
  dst.drawImage(srcCanvas, 0, 0);
  dst.restore();
  dst.filter = "none"; dst.globalAlpha = 1;
}

function animValue(tn: number, P: Params, dur: number): number {
  const T = dur;
  const tSec = tn * T;
  const iS = P.bookend ? P.introSec : 0, oS = P.bookend ? P.outroSec : 0;
  const aD = T - iS - oS;
  if (P.bookend && tSec < iS) return 0;
  if (P.bookend && tSec > T - oS) return 0;
  let u = (tSec - iS) / (aD || 1);
  if (u < 0) u = 0; if (u > 1) u = 1;
  if (P.bookend) return u <= 0.5 ? easeVal(u * 2, P.easing) : easeVal((1 - u) * 2, P.easing);
  if (P.exCycle === "pingpong") return (1 - Math.cos(u * 6.283185307)) / 2;
  return easeVal(u, P.easing);
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ParticleStudio() {
  const [P, setP] = useState<Params>({ ...DEFAULTS });
  const [pcount, setPcount] = useState(0);
  const [hasImage, setHasImage] = useState(false);
  const [morphOn, setMorphOn] = useState(false);
  const [morphSlots, setMorphSlots] = useState<MorphSlot[]>([]);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [dir, setDir] = useState(1);
  const [timeVal, setTimeVal] = useState(0);
  const [totalDur, setTotalDur] = useState(DEFAULTS.dur);
  const [expStatus, setExpStatus] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const morphPoolRef = useRef<MorphPool | null>(null);
  const sourceImgRef = useRef<HTMLImageElement | null>(null);
  const pbRef = useRef({ playing: false, time: 0, dur: DEFAULTS.dur, dir: 1, loop: false, recording: false, _last: null as number | null });
  const pRef = useRef<Params>({ ...DEFAULTS });
  const morphOnRef = useRef(false);
  const morphSlotsRef = useRef<MorphSlot[]>([]);
  const dirtyRef = useRef(true);
  const rafRef = useRef(0);
  const WRef = useRef(0), HRef = useRef(0);

  // keep refs in sync with state
  pRef.current = P;
  pbRef.current.dir = dir;
  pbRef.current.loop = loop;
  pbRef.current.playing = playing;
  morphOnRef.current = morphOn;
  morphSlotsRef.current = morphSlots;

  // ── duration calculation ──────────────────────────────────────────────────
  const calcDur = useCallback((params: Params, slots: MorphSlot[], on: boolean) => {
    if (on && slots.length >= 2) {
      let d = 0;
      for (let k = 0; k < slots.length; k++) {
        d += Math.max(0.05, slots[k].hold);
        if (k < slots.length - 1) d += Math.max(0.1, slots[k].trans);
      }
      if (params.bookend && slots.length >= 2) d += Math.max(0.1, slots[slots.length - 1].trans);
      const extra = params.bookend ? (params.introSec + params.outroSec) : 0;
      return extra + d;
    }
    const extra = params.bookend ? (params.introSec + params.outroSec) : 0;
    return extra + params.dur;
  }, []);

  // ── image sampling ────────────────────────────────────────────────────────
  const resampleImage = useCallback(() => {
    const W = WRef.current, H = HRef.current;
    if (!sourceImgRef.current || W === 0) return;
    particlesRef.current = buildSet(sourceImgRef.current, W, H, pRef.current);
    setPcount(particlesRef.current.length);
    dirtyRef.current = true;
  }, []);

  const rebuildMorphPool = useCallback(() => {
    const W = WRef.current, H = HRef.current;
    if (!morphOnRef.current || morphSlotsRef.current.length < 1) { morphPoolRef.current = null; return; }
    morphPoolRef.current = buildMorphPool(morphSlotsRef.current, W, H, pRef.current);
    dirtyRef.current = true;
  }, []);

  // ── canvas resize ─────────────────────────────────────────────────────────
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
    if (!sceneRef.current) sceneRef.current = document.createElement("canvas");
    sceneRef.current.width = W; sceneRef.current.height = H;
    if (sourceImgRef.current) resampleImage();
    if (morphOnRef.current) rebuildMorphPool();
    dirtyRef.current = true;
  }, [resampleImage, rebuildMorphPool]);

  // ── animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    let animId = 0;
    const frame = (now: number) => {
      animId = requestAnimationFrame(frame);
      const pb = pbRef.current;
      if (pb.recording) return;
      const P = pRef.current;
      const W = WRef.current, H = HRef.current;
      const canvas = canvasRef.current;
      const scene = sceneRef.current;
      if (!canvas || !scene || W === 0) return;
      const ctx = canvas.getContext("2d", { alpha: false });
      const sctx = scene.getContext("2d", { alpha: false });
      if (!ctx || !sctx) return;

      if (pb.playing) {
        if (pb._last == null) pb._last = now;
        const dt = (now - pb._last) / 1000; pb._last = now;
        pb.time += dt * pb.dir;
        const dur = totalDurRef.current;
        if (pb.time >= dur) {
          if (pb.loop) pb.time = pb.time % dur;
          else { pb.time = dur; pb.playing = false; setPlaying(false); }
        } else if (pb.time <= 0) {
          if (pb.loop) pb.time = dur - ((-pb.time) % dur);
          else { pb.time = 0; pb.playing = false; setPlaying(false); }
        }
        dirtyRef.current = true;
      } else {
        pb._last = null;
      }

      const ambient = P.idle > 0;
      const animating = pb.playing;
      if (animating || ambient || dirtyRef.current) {
        const dur = totalDurRef.current;
        const tn = dur > 0 ? pb.time / dur : 0;
        const DPR = Math.min(window.devicePixelRatio || 1, 2);

        sctx.globalCompositeOperation = "source-over";
        sctx.fillStyle = hexToRgba(P.bg, animating ? (1 - P.trail / 100) : 1);
        sctx.fillRect(0, 0, W, H);
        sctx.globalCompositeOperation = P.glow ? "lighter" : "source-over";

        if (morphOnRef.current && morphPoolRef.current && morphSlotsRef.current.length >= 2) {
          drawMorph(sctx, tn, now * 0.001, W, H, DPR, morphPoolRef.current, morphSlotsRef.current, P);
        } else if (particlesRef.current.length > 0) {
          drawParticles(sctx, animValue(tn, P, dur), now * 0.001, W, H, DPR, particlesRef.current, P);
        }

        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(scene, 0, 0);
        if (P.glow) bloomFrom(ctx, scene, P.glowAmt, 1);

        setTimeVal(pb.time);
        if (!animating && !ambient) dirtyRef.current = false;
      }
    };
    animId = requestAnimationFrame(frame);
    rafRef.current = animId;
    return () => cancelAnimationFrame(animId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalDurRef = useRef(DEFAULTS.dur);

  // ── sync totalDur ref and state ───────────────────────────────────────────
  useEffect(() => {
    const d = calcDur(P, morphSlots, morphOn);
    totalDurRef.current = d;
    setTotalDur(d);
    pbRef.current.dur = d;
  }, [P, morphSlots, morphOn, calcDur]);

  // ── init resize ───────────────────────────────────────────────────────────
  useEffect(() => {
    handleResize();
    let tid: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(tid); tid = setTimeout(handleResize, 140); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [handleResize]);

  // ── file load ─────────────────────────────────────────────────────────────
  const loadFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => { sourceImgRef.current = img; setHasImage(true); resampleImage(); setExpStatus("Imagem carregada."); };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  }, [resampleImage]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const morphFileInputRef = useRef<HTMLInputElement>(null);

  // ── drag-drop ─────────────────────────────────────────────────────────────
  const [dragging, setDragging] = useState(false);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) loadFile(f);
  }, [loadFile]);

  // ── param helpers ─────────────────────────────────────────────────────────
  const setParam = useCallback(<K extends keyof Params>(key: K, val: Params[K]) => {
    setP(p => {
      const next = { ...p, [key]: val };
      if (key === "density") {
        setTimeout(() => {
          resampleImage();
          if (morphOnRef.current) rebuildMorphPool();
        }, 0);
      }
      dirtyRef.current = true;
      return next;
    });
  }, [resampleImage, rebuildMorphPool]);

  const applyPreset = useCallback((pr: Preset) => {
    setP(p => {
      const next = { ...p, ...pr.p };
      pRef.current = next;
      setTimeout(() => {
        resampleImage();
        pbRef.current.dir = 1;
        pbRef.current.time = 0;
        pbRef.current.playing = true;
        setDir(1);
        setPlaying(true);
        dirtyRef.current = true;
      }, 0);
      return next;
    });
  }, [resampleImage]);

  // ── morph slots ───────────────────────────────────────────────────────────
  const addMorphSlot = useCallback((file: File) => {
    if (morphSlotsRef.current.length >= 5) { setExpStatus("Máximo de 5 formas."); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const slot: MorphSlot = { img, name: file.name, thumb: ev.target!.result as string, hold: 1.2, trans: 1.0 };
        setMorphSlots(prev => {
          const next = [...prev, slot];
          morphSlotsRef.current = next;
          rebuildMorphPool();
          return next;
        });
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  }, [rebuildMorphPool]);

  // ── transport ─────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const pb = pbRef.current;
    if (!pb.playing) {
      if (pb.dir > 0 && pb.time >= totalDurRef.current - 1e-4) pb.time = 0;
      if (pb.dir < 0 && pb.time <= 1e-4) pb.time = totalDurRef.current;
    }
    pb.playing = !pb.playing;
    setPlaying(pb.playing);
    dirtyRef.current = true;
  }, []);

  const scrubTo = useCallback((frac: number) => {
    pbRef.current.time = Math.max(0, Math.min(1, frac)) * totalDurRef.current;
    dirtyRef.current = true;
  }, []);

  // ── export helpers ────────────────────────────────────────────────────────
  function exportDims(P: Params) {
    const { exFormat: f, exQuality: q } = P;
    if (f === "square") return { w: q, h: q };
    if (f === "portrait") return q === 1080 ? { w: 1080, h: 1920 } : (q === 1440 ? { w: 1440, h: 2560 } : { w: 2160, h: 3840 });
    return q === 1080 ? { w: 1920, h: 1080 } : (q === 1440 ? { w: 2560, h: 1440 } : { w: 3840, h: 2160 });
  }
  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  const exportVideo = useCallback(async (format: "mp4" | "webm") => {
    if (recording) return;
    const curP = pRef.current;
    const isMorph = morphOnRef.current && morphSlotsRef.current.length >= 2;
    if (!sourceImgRef.current && !isMorph) { setExpStatus("Carregue uma imagem primeiro."); return; }
    if (!(window as unknown as Record<string, unknown>)["VideoEncoder"]) { setExpStatus("Navegador sem WebCodecs. Use a sequência PNG."); return; }
    setRecording(true); pbRef.current.recording = true;
    setExpStatus(`Preparando ${format.toUpperCase()}…`); setProgress(0);
    try {
      const d = exportDims(curP);
      const DPR = Math.min(window.devicePixelRatio || 1, 2);
      const { w: EW, h: EH } = d; const fps = curP.fps;
      const dur2 = totalDurRef.current;
      const N = Math.max(2, Math.round(fps * dur2));
      const rs = EH / (HRef.current / DPR || EH), unit = DPR * rs;
      const dim = isMorph
        ? buildMorphPool(morphSlotsRef.current, EW, EH, curP, rs)
        : buildSet(sourceImgRef.current, EW, EH, curP, rs);

      const bitrate = Math.min(120000000, Math.round(EW * EH * fps * 0.3));
      const ec = document.createElement("canvas"); ec.width = EW; ec.height = EH;
      const eg = ec.getContext("2d", { alpha: false })!;
      const fc = document.createElement("canvas"); fc.width = EW; fc.height = EH;
      const fg = fc.getContext("2d", { alpha: false })!;

      // dynamic CDN load (same as original)
      if (format === "mp4" && !(window as unknown as Record<string, unknown>)["Mp4Muxer"]) {
        await new Promise<void>((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.5/build/mp4-muxer.min.js"; s.onload = () => res(); s.onerror = () => rej(); document.head.appendChild(s); });
      }
      if (format === "webm" && !(window as unknown as Record<string, unknown>)["WebMMuxer"]) {
        await new Promise<void>((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/webm-muxer@5.0.3/build/webm-muxer.min.js"; s.onload = () => res(); s.onerror = () => rej(); document.head.appendChild(s); });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const W2 = window as any;
      let muxer: unknown, codecStr: string;
      if (format === "mp4") {
        const cands = ["avc1.640034", "avc1.640033", "avc1.640032", "avc1.640028", "avc1.4D4028", "avc1.42E01E"];
        let cfg = null;
        for (const c of cands) { try { const s = await W2.VideoEncoder.isConfigSupported({ codec: c, width: EW, height: EH, bitrate, framerate: fps }); if (s?.supported) { cfg = { codec: c, width: EW, height: EH, bitrate, framerate: fps }; break; } } catch { /* skip */ } }
        if (!cfg) throw new Error("H.264 não suportado. Tente WebM ou PNG.");
        codecStr = cfg.codec;
        muxer = new W2.Mp4Muxer.Muxer({ target: new W2.Mp4Muxer.ArrayBufferTarget(), video: { codec: "avc", width: EW, height: EH }, fastStart: "in-memory" });
      } else {
        const cands = ["vp09.00.41.08", "vp09.00.31.08", "vp09.00.10.08"];
        let cfg2 = null;
        for (const c of cands) { try { const s = await W2.VideoEncoder.isConfigSupported({ codec: c, width: EW, height: EH, bitrate, framerate: fps }); if (s?.supported) { cfg2 = { codec: c, width: EW, height: EH, bitrate, framerate: fps }; break; } } catch { /* skip */ } }
        if (!cfg2) throw new Error("VP9 não suportado. Tente MP4 ou PNG.");
        codecStr = cfg2.codec;
        muxer = new W2.WebMMuxer.Muxer({ target: new W2.WebMMuxer.ArrayBufferTarget(), video: { codec: "V_VP9", width: EW, height: EH, frameRate: fps } });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = muxer as any;
      const encoder = new W2.VideoEncoder({
        output: (chunk: unknown, meta: unknown) => m.addVideoChunk(chunk, meta),
        error: (e: Error) => setExpStatus("Erro no encoder: " + e.message),
      });
      encoder.configure({ codec: codecStr, width: EW, height: EH, bitrate, framerate: fps, latencyMode: "quality", bitrateMode: "variable" });
      const kInt = Math.max(1, Math.round(fps / 2));
      const pingpong = !curP.bookend && curP.exCycle === "pingpong";

      for (let i = 0; i < N; i++) {
        const tn = pingpong ? i / N : i / (N - 1);
        eg.globalCompositeOperation = "source-over";
        eg.fillStyle = (i === 0) ? curP.bg : hexToRgba(curP.bg, 1 - curP.trail / 100);
        eg.fillRect(0, 0, EW, EH);
        eg.globalCompositeOperation = curP.glow ? "lighter" : "source-over";
        if (isMorph && dim instanceof Object && "frames" in dim) {
          drawMorph(eg, tn, i / fps, EW, EH, unit, dim as MorphPool, morphSlotsRef.current, curP);
        } else if (Array.isArray(dim)) {
          drawParticles(eg, animValue(tn, curP, dur2), i / fps, EW, EH, unit, dim as Particle[], curP);
        }
        fg.globalCompositeOperation = "source-over";
        fg.drawImage(ec, 0, 0);
        if (curP.glow) bloomFrom(fg, ec, curP.glowAmt, unit / DPR);
        const vf = new W2.VideoFrame(fc, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
        encoder.encode(vf, { keyFrame: i % kInt === 0 });
        vf.close();
        setProgress(i / N);
        setExpStatus(`Renderizando ${i + 1}/${N} · ${EW}×${EH} @${fps}fps`);
        if (encoder.encodeQueueSize > 6) await new Promise<void>(r => { const id = setInterval(() => { if (encoder.encodeQueueSize <= 2) { clearInterval(id); r(); } }, 6); });
        else await new Promise<void>(r => setTimeout(r, 0));
      }
      setExpStatus("Finalizando…"); setProgress(0.99);
      await encoder.flush();
      m.finalize();
      const blob = new Blob([m.target.buffer], { type: format === "mp4" ? "video/mp4" : "video/webm" });
      downloadBlob(blob, `upgm-particles.${format === "mp4" ? "mp4" : "webm"}`);
      setProgress(null);
      setExpStatus(`Pronto: ${EW}×${EH} ${format.toUpperCase()}`);
    } catch (err) {
      setProgress(null);
      setExpStatus("Falhou: " + (err as Error).message);
    }
    setRecording(false); pbRef.current.recording = false;
  }, [recording]);

  const exportPNG = useCallback(() => {
    if (recording) return;
    const curP = pRef.current;
    const isMorph = morphOnRef.current && morphSlotsRef.current.length >= 2;
    if (!sourceImgRef.current && !isMorph) { setExpStatus("Carregue uma imagem primeiro."); return; }
    setRecording(true); pbRef.current.recording = true;
    setExpStatus("Renderizando PNG…"); setProgress(0);
    const loadJSZip = (cb: () => void) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).JSZip) return cb();
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = cb;
      s.onerror = () => { setExpStatus("Falha ao carregar JSZip."); setRecording(false); pbRef.current.recording = false; };
      document.head.appendChild(s);
    };
    loadJSZip(() => {
      const DPR = Math.min(window.devicePixelRatio || 1, 2);
      const d = exportDims(curP); const { w: EW, h: EH } = d; const fps = curP.fps;
      const dur2 = totalDurRef.current;
      const N = Math.max(2, Math.round(fps * dur2));
      const rs = EH / (HRef.current / DPR || EH), unit = DPR * rs;
      const dim = isMorph
        ? buildMorphPool(morphSlotsRef.current, EW, EH, curP, rs)
        : buildSet(sourceImgRef.current, EW, EH, curP, rs);
      const ec = document.createElement("canvas"); ec.width = EW; ec.height = EH;
      const eg = ec.getContext("2d")!;
      const fc2 = document.createElement("canvas"); fc2.width = EW; fc2.height = EH;
      const fg2 = fc2.getContext("2d")!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zip = new (window as any).JSZip();
      let i = 0;
      const step = () => {
        if (i >= N) {
          setExpStatus("Compactando…"); setProgress(0.99);
          zip.generateAsync({ type: "blob" }).then((content: Blob) => {
            downloadBlob(content, "upgm-particles-png.zip");
            setRecording(false); pbRef.current.recording = false;
            setProgress(null);
            setExpStatus(`Pronto: ${N} frames PNG ${EW}×${EH}`);
          });
          return;
        }
        const tn = (!curP.bookend && curP.exCycle === "pingpong") ? i / N : i / (N - 1);
        eg.clearRect(0, 0, EW, EH);
        eg.globalCompositeOperation = curP.glow ? "lighter" : "source-over";
        if (isMorph && dim instanceof Object && "frames" in dim) {
          drawMorph(eg, tn, i / fps, EW, EH, unit, dim as MorphPool, morphSlotsRef.current, curP);
        } else if (Array.isArray(dim)) {
          drawParticles(eg, animValue(tn, curP, dur2), i / fps, EW, EH, unit, dim as Particle[], curP);
        }
        fg2.clearRect(0, 0, EW, EH);
        fg2.globalCompositeOperation = "source-over";
        fg2.drawImage(ec, 0, 0);
        if (curP.glow) bloomFrom(fg2, ec, curP.glowAmt, unit / DPR);
        fc2.toBlob(blob => {
          zip.file(`upgm_${String(i).padStart(4, "0")}.png`, blob);
          i++; setProgress(i / N); setExpStatus(`Renderizando ${i}/${N}…`);
          setTimeout(step, 0);
        }, "image/png");
      };
      step();
    });
  }, [recording]);

  // ─── render ───────────────────────────────────────────────────────────────

  const tpFrac = totalDur > 0 ? timeVal / totalDur : 0;
  const isPlaying = playing;

  // Slider, SegmentedRow, PanelSection, Toggle come from the shared design
  // system kit (@/components/ui/panel) — same look as every other studio.

  return (
    <div className="flex flex-1 min-h-0">
      {/* Canvas area */}
      <div
        ref={wrapRef}
        className="flex-1 relative min-w-0 flex items-center justify-center bg-ink"
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
        onDragOver={e => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <canvas ref={canvasRef} className="block w-full h-full" />

        {/* Drop hint */}
        {dragging && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border border-dashed border-red rounded px-10 py-7 mono text-[12px] tracking-widest text-red bg-red/5">
              solte o PNG aqui
            </div>
          </div>
        )}

        {/* Recording badge */}
        {recording && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[rgba(16,16,18,.92)] border border-red rounded-full px-3 py-1.5 mono text-[11px] text-red tracking-widest">
            <span className="w-2 h-2 rounded-full bg-red animate-pulse" />
            {expStatus || "renderizando"}
          </div>
        )}

        {/* No image placeholder */}
        {!hasImage && !morphOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
            <div className="text-center">
              <p className="mono text-[11px] tracking-widest text-muted uppercase">UPGM — Partículas</p>
              <p className="mt-2 text-[13px] text-muted max-w-xs text-center">
                Carregue um PNG com transparência para gerar a nuvem de partículas. Use os presets para explorar os modos.
              </p>
            </div>
          </div>
        )}

        {/* Transport bar */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 flex items-center gap-2
          w-[min(680px,calc(100%-32px))] bg-[rgba(16,16,18,.88)] backdrop-blur-md
          border border-line rounded-lg px-3 py-2">
          <button onClick={togglePlay} disabled={recording}
            className="w-7 h-7 flex items-center justify-center bg-red text-white rounded-full text-[13px] font-bold shrink-0 disabled:opacity-40">
            {isPlaying ? "❚❚" : "▶"}
          </button>
          <button onClick={() => { setPlaying(false); pbRef.current.playing = false; pbRef.current.time = dir > 0 ? 0 : totalDur; dirtyRef.current = true; }} disabled={recording}
            className="w-7 h-7 flex items-center justify-center border border-line text-muted hover:text-[var(--text)] rounded-md text-[13px] shrink-0 disabled:opacity-40">
            ↺
          </button>
          <span className="mono text-[11px] text-muted w-10 text-center shrink-0">{timeVal.toFixed(1)}s</span>
          {/* Scrub bar */}
          <div className="flex-1 relative h-6 cursor-pointer"
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setPlaying(false); pbRef.current.playing = false;
              const r = e.currentTarget.getBoundingClientRect();
              scrubTo((e.clientX - r.left) / r.width);
            }}
            onPointerMove={e => {
              if (e.buttons === 1) {
                const r = e.currentTarget.getBoundingClientRect();
                scrubTo((e.clientX - r.left) / r.width);
              }
            }}>
            <div className="absolute left-0 right-0 h-1 top-1/2 -translate-y-1/2 bg-line rounded" />
            <div className="absolute left-0 h-1 top-1/2 -translate-y-1/2 bg-red/60 rounded" style={{ width: `${tpFrac * 100}%` }} />
            <div className="absolute w-3 h-3 rounded-full bg-[var(--text)] border-2 border-[var(--panel)] top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none shadow"
              style={{ left: `${tpFrac * 100}%` }} />
          </div>
          <span className="mono text-[11px] text-muted w-10 text-center shrink-0">{totalDur.toFixed(1)}s</span>
          <button onClick={() => { setDir(d => { const nd = -d; pbRef.current.dir = nd; return nd; }); }}
            className={`w-7 h-7 flex items-center justify-center border rounded-md text-[13px] transition-colors shrink-0 ${dir < 0 ? "border-red text-red" : "border-line text-muted hover:text-[var(--text)]"}`}>
            ⇄
          </button>
          <button onClick={() => setLoop(l => { pbRef.current.loop = !l; return !l; })}
            className={`w-7 h-7 flex items-center justify-center border rounded-md text-[13px] transition-colors shrink-0 ${loop ? "border-red text-red" : "border-line text-muted hover:text-[var(--text)]"}`}>
            ⟳
          </button>
          <span className="mono text-[10px] text-muted shrink-0 whitespace-nowrap">
            <b className="text-[var(--text)]">{pcount.toLocaleString("pt-BR")}</b> part
          </span>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="glass-sidebar flex w-[310px] shrink-0 flex-col overflow-y-auto">
        {/* Load image */}
        <div className="border-b border-line p-4">
          <button onClick={() => fileInputRef.current?.click()}
            className="w-full rounded border border-line py-2 text-[11px] mono uppercase tracking-widest text-muted hover:border-muted hover:text-[var(--text)] transition-colors">
            ⤓ carregar PNG
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }} />
          {expStatus && !recording && (
            <p className="mt-2 mono text-[10px] text-muted leading-relaxed">{expStatus}</p>
          )}
          {progress !== null && (
            <div className="mt-2 h-0.5 bg-line rounded overflow-hidden">
              <div className="h-full bg-red transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>

        <PanelSection title="Presets">
          <PresetGrid items={PRESETS} onSelect={applyPreset} />
        </PanelSection>

        <PanelSection title="Timeline">
          <Slider label="Duração" min={1} max={30} step={0.5} value={P.dur} fmt={v => v.toFixed(1) + "s"} onChange={v => setParam("dur", v)} />
          <div>
            <label className="text-[12px] text-[var(--text)] mb-1 block">Easing</label>
            <SegmentedRow
              value={P.easing}
              options={(["linear", "in", "out", "inout"] as Easing[]).map(e => ({ value: e, label: e }))}
              onChange={e => { setParam("easing", e); dirtyRef.current = true; }}
            />
          </div>
          <Slider label="Movimento em repouso" min={0} max={100} value={P.idle} fmt={Math.round} onChange={v => setParam("idle", v)} />
          <Slider label="Escalonamento" min={0} max={95} value={P.spread} fmt={Math.round} onChange={v => setParam("spread", v)} />
          <div>
            <label className="text-[12px] text-[var(--text)] mb-1 block">Modo de movimento</label>
            <select value={P.motion} onChange={e => { setParam("motion", e.target.value as Motion); setTimeout(resampleImage, 0); }}
              className="w-full bg-[var(--panel-2)] border border-line text-[var(--text)] mono text-[11px] px-2 py-2 rounded cursor-pointer outline-none">
              <option value="inplace">dissolver no lugar</option>
              <option value="rise">ascender (fumaça)</option>
              <option value="fall">cair (cinzas)</option>
              <option value="drift">deriva lateral</option>
              <option value="radial">radial suave</option>
              <option value="swirl">vórtice lento</option>
              <option value="scatter">espalhar aleatório</option>
            </select>
          </div>
          <KitToggle label="Abrir e fechar na forma original" value={P.bookend} onChange={v => setParam("bookend", v)} />
          {P.bookend && (
            <>
              <Slider label="Forma original no início" min={0} max={10} step={0.5} value={P.introSec} fmt={v => v.toFixed(1) + "s"} onChange={v => setParam("introSec", v)} />
              <Slider label="Forma original no fim" min={0} max={10} step={0.5} value={P.outroSec} fmt={v => v.toFixed(1) + "s"} onChange={v => setParam("outroSec", v)} />
            </>
          )}
        </PanelSection>

        <PanelSection title="Fonte">
          <Slider label="Densidade" min={6} max={100} value={P.density} fmt={Math.round} onChange={v => setParam("density", v)} />
          <Slider label="Tamanho" min={0.5} max={7} step={0.1} value={P.size} fmt={v => v.toFixed(1)} onChange={v => setParam("size", v)} />
          <Slider label="Variação de tamanho" min={0} max={100} value={P.sizeVar} fmt={Math.round} onChange={v => setParam("sizeVar", v)} />
          <div>
            <label className="text-[12px] text-[var(--text)] mb-1 block">Formato da partícula</label>
            <SegmentedRow
              value={P.shape}
              options={(["circle", "square", "diamond", "ring"] as Shape[]).map(s => ({ value: s, label: s }))}
              onChange={s => setParam("shape", s)}
            />
          </div>
        </PanelSection>

        <PanelSection title="Movimento">
          <Slider label="Dispersão" min={0} max={100} value={P.disp} fmt={Math.round} onChange={v => setParam("disp", v)} />
          <Slider label="Turbulência" min={0} max={100} value={P.turb} fmt={Math.round} onChange={v => setParam("turb", v)} />
          <Slider label="Escala de turbulência" min={1} max={100} value={P.tscale} fmt={Math.round} onChange={v => setParam("tscale", v)} />
          <Slider label="Fluxo" min={0} max={100} value={P.flow} fmt={Math.round} onChange={v => setParam("flow", v)} />
          <Slider label="Gravidade ↓" min={-40} max={40} value={P.grav} fmt={Math.round} onChange={v => setParam("grav", v)} />
          <Slider label="Vento →" min={-40} max={40} value={P.wind} fmt={Math.round} onChange={v => setParam("wind", v)} />
          <Slider label="Foco central" min={0} max={100} value={P.centerBias} fmt={Math.round} onChange={v => setParam("centerBias", v)} />
        </PanelSection>

        <PanelSection title="Aparência">
          <div>
            <label className="text-[12px] text-[var(--text)] mb-1 block">Cor das partículas</label>
            <SegmentedRow
              value={P.colorMode}
              options={(["original", "white", "custom"] as ColorMode[]).map(c => ({ value: c, label: c }))}
              onChange={c => setParam("colorMode", c)}
            />
          </div>
          {P.colorMode === "custom" && (
            <div className="flex items-center gap-2">
              <input type="color" value={P.customColor} onChange={e => setParam("customColor", e.target.value)}
                className="w-8 h-7 border border-line rounded cursor-pointer bg-none p-0.5" />
              <span className="mono text-[10px] text-muted">{P.customColor}</span>
            </div>
          )}
          <Slider label="Opacidade" min={0} max={100} value={P.opacity} fmt={Math.round} onChange={v => setParam("opacity", v)} />
          <Slider label="Fade" min={0} max={100} value={P.fade} fmt={Math.round} onChange={v => setParam("fade", v)} />
          <Slider label="Rastro" min={0} max={95} value={P.trail} fmt={Math.round} onChange={v => setParam("trail", v)} />
          <KitToggle label="Brilho (glow)" value={P.glow} onChange={v => setParam("glow", v)} />
          {P.glow && <Slider label="Intensidade do brilho" min={0} max={100} value={P.glowAmt} fmt={Math.round} onChange={v => setParam("glowAmt", v)} />}
          <div className="flex items-center gap-2">
            <label className="text-[12px] text-[var(--text)]">Fundo</label>
            <input type="color" value={P.bg} onChange={e => setParam("bg", e.target.value)}
              className="w-8 h-7 border border-line rounded cursor-pointer bg-none p-0.5" />
            <span className="mono text-[10px] text-muted">{P.bg}</span>
          </div>
        </PanelSection>

        <PanelSection
          title="Morph (opcional)"
          headerRight={
            <button onClick={() => {
              const next = !morphOn;
              setMorphOn(next);
              morphOnRef.current = next;
              if (next) {
                if (morphSlots.length === 0 && sourceImgRef.current) {
                  const slot: MorphSlot = { img: sourceImgRef.current, name: "imagem atual", thumb: sourceImgRef.current.src, hold: 1.2, trans: 1.0 };
                  setMorphSlots([slot]);
                  morphSlotsRef.current = [slot];
                }
                rebuildMorphPool();
              } else {
                morphPoolRef.current = null;
              }
              dirtyRef.current = true;
            }}
              className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${morphOn ? "bg-red/25" : "bg-line"}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${morphOn ? "left-4 bg-red" : "left-0.5 bg-muted"}`} />
            </button>
          }
        >
          {morphOn && (
            <>
              <div className="flex flex-col gap-1.5 mb-3">
                {morphSlots.map((sl, idx) => (
                  <div key={idx} className="bg-[var(--panel-2)] border border-line rounded p-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="mono text-[10px] text-red w-4">{idx + 1}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sl.thumb} alt="" className="w-7 h-7 rounded object-contain bg-black border border-line" />
                      <span className="mono text-[10px] text-muted flex-1 truncate">{sl.name}</span>
                      <button onClick={() => setMorphSlots(prev => {
                        const next = prev.filter((_, i) => i !== idx);
                        morphSlotsRef.current = next;
                        setTimeout(rebuildMorphPool, 0);
                        return next;
                      })} className="text-muted hover:text-red text-[14px] leading-none">×</button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="mono text-[9px] text-muted uppercase">pausa</label>
                      <input type="number" min="0.1" step="0.1" value={sl.hold}
                        onChange={e => setMorphSlots(prev => { const next = [...prev]; next[idx] = { ...next[idx], hold: parseFloat(e.target.value) || 1 }; morphSlotsRef.current = next; return next; })}
                        className="w-12 bg-ink border border-line text-[var(--text)] mono text-[11px] px-1.5 py-1 rounded outline-none" />
                      <span className="mono text-[9px] text-muted">s</span>
                      {(idx < morphSlots.length - 1 || (P.bookend && morphSlots.length >= 2)) && (
                        <>
                          <label className="mono text-[9px] text-muted uppercase">{idx === morphSlots.length - 1 ? "volta" : "troca"}</label>
                          <input type="number" min="0.1" step="0.1" value={sl.trans}
                            onChange={e => setMorphSlots(prev => { const next = [...prev]; next[idx] = { ...next[idx], trans: parseFloat(e.target.value) || 1 }; morphSlotsRef.current = next; return next; })}
                            className="w-12 bg-ink border border-line text-[var(--text)] mono text-[11px] px-1.5 py-1 rounded outline-none" />
                          <span className="mono text-[9px] text-muted">s</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => morphFileInputRef.current?.click()} disabled={morphSlots.length >= 5}
                className="w-full rounded border border-line py-1.5 text-[11px] mono uppercase tracking-widest text-muted hover:border-muted hover:text-[var(--text)] transition-colors disabled:opacity-40">
                {morphSlots.length >= 5 ? "limite de 5 formas" : "+ adicionar forma"}
              </button>
              <input ref={morphFileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) addMorphSlot(f); e.target.value = ""; }} />
            </>
          )}
        </PanelSection>

        <PanelSection title="Exportar">
          <div>
            <label className="text-[12px] text-[var(--text)] mb-1 block">Formato</label>
            <SegmentedRow
              value={P.exFormat}
              options={(["landscape", "portrait", "square"] as ExFormat[]).map(f => ({ value: f, label: f === "landscape" ? "16:9" : f === "portrait" ? "9:16" : "1:1" }))}
              onChange={f => setParam("exFormat", f)}
            />
          </div>
          <div>
            <label className="text-[12px] text-[var(--text)] mb-1 block">Qualidade</label>
            <SegmentedRow
              value={String(P.exQuality)}
              options={[1080, 1440, 2160].map(q => ({ value: String(q), label: `${q}p` }))}
              onChange={q => setParam("exQuality", Number(q) as Params["exQuality"])}
            />
          </div>
          <div>
            <label className="text-[12px] text-[var(--text)] mb-1 block">FPS</label>
            <SegmentedRow
              value={String(P.fps)}
              options={[24, 30, 60].map(f => ({ value: String(f), label: String(f) }))}
              onChange={f => setParam("fps", Number(f) as Params["fps"])}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => exportVideo("mp4")} disabled={recording}
              className="flex-1 rounded border border-line py-2 text-[11px] mono uppercase tracking-widest text-muted hover:border-red hover:text-red transition-colors disabled:opacity-40">
              MP4
            </button>
            <button onClick={() => exportVideo("webm")} disabled={recording}
              className="flex-1 rounded border border-line py-2 text-[11px] mono uppercase tracking-widest text-muted hover:border-red hover:text-red transition-colors disabled:opacity-40">
              WebM
            </button>
            <button onClick={exportPNG} disabled={recording}
              className="flex-1 rounded border border-line py-2 text-[11px] mono uppercase tracking-widest text-muted hover:border-red hover:text-red transition-colors disabled:opacity-40">
              PNG
            </button>
          </div>
        </PanelSection>

        <PanelSection title="Ações" className="border-b-0">
          <div className="flex gap-2">
            <button onClick={() => {
              const motions: Motion[] = ["inplace", "rise", "fall", "drift", "radial", "swirl"];
              const rnd = (a: number, b: number) => Math.round(a + Math.random() * (b - a));
              setP(p => ({
                ...p,
                disp: rnd(15, 55), turb: rnd(15, 55), tscale: rnd(30, 70),
                flow: rnd(15, 45), grav: rnd(-10, 10), wind: rnd(-10, 10),
                fade: rnd(55, 90), spread: rnd(55, 85),
                size: rnd(12, 28) / 10,
                motion: motions[rnd(0, motions.length - 1)],
              }));
              setTimeout(resampleImage, 0);
              pbRef.current.dir = 1; pbRef.current.time = 0; pbRef.current.playing = true;
              setDir(1); setPlaying(true); dirtyRef.current = true;
            }}
              className="flex-1 rounded border border-line py-2 text-[11px] mono uppercase tracking-widest text-muted hover:border-muted hover:text-[var(--text)] transition-colors">
              Aleatorizar
            </button>
            <button onClick={() => {
              setP({ ...DEFAULTS });
              setMorphOn(false); morphOnRef.current = false;
              morphPoolRef.current = null;
              setPlaying(false); pbRef.current.playing = false;
              pbRef.current.time = 0; dirtyRef.current = true;
            }}
              className="flex-1 rounded border border-line py-2 text-[11px] mono uppercase tracking-widest text-muted hover:border-muted hover:text-[var(--text)] transition-colors">
              Resetar
            </button>
          </div>
          <p className="mt-3 mono text-[10px] text-muted leading-relaxed">
            espaço = play/pause · arraste um PNG direto no canvas
          </p>
        </PanelSection>
      </aside>
    </div>
  );
}
