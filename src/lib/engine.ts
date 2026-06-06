import { Dot, PointillismParams } from "./types";

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

// Campo de ruído suave (-1..1) para movimento orgânico.
function flowNoise(x: number, y: number): number {
  return (
    Math.sin(x) * Math.cos(y * 1.3) +
    Math.sin(x * 0.5 + 2.1) * Math.cos(y * 0.7 + 1.1) +
    Math.sin((x + y) * 0.6 + 0.5)
  ) / 3;
}

// Random determinístico por célula (jitter estável entre frames).
function hashRand(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) >>> 0;
  h = (Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// ----------------------------------------------------------------------------
// Carregar imagem → ImageData numa resolução de trabalho
// ----------------------------------------------------------------------------

export interface SourceData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function imageToSource(img: HTMLImageElement, maxDim = 1000): SourceData {
  const ratio = img.naturalWidth / img.naturalHeight || 1;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (Math.max(w, h) > maxDim) {
    if (w >= h) {
      w = maxDim;
      h = Math.round(maxDim / ratio);
    } else {
      h = maxDim;
      w = Math.round(maxDim * ratio);
    }
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

// ----------------------------------------------------------------------------
// Amostragem → lista de pontos
// ----------------------------------------------------------------------------

export function sampleDots(src: SourceData, p: PointillismParams): Dot[] {
  const { data, width: W, height: H } = src;
  const dots: Dot[] = [];

  const sample = (px: number, py: number) => {
    const x = clamp(Math.round(px), 0, W - 1);
    const y = clamp(Math.round(py), 0, H - 1);
    const idx = (y * W + x) * 4;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
  };

  const contrastF = (259 * (p.contrast * 1.28 + 255)) / (255 * (259 - p.contrast * 1.28));

  const evalPoint = (px: number, py: number, i: number, j: number) => {
    const { r, g, b, a } = sample(px, py);
    if (a < 8) return; // fundo transparente → sem ponto

    let lum = 0.299 * r + 0.587 * g + 0.114 * b; // 0..255
    lum = lum + p.brightness * 2.55;
    lum = contrastF * (lum - 128) + 128;
    let n = clamp(lum / 255);
    n = Math.pow(n, p.gamma);
    if (p.invert) n = 1 - n;
    const bright = n * 255;
    if (bright < p.thresholdLow || bright > p.thresholdHigh) return;

    const v = clamp(1 - n); // escuridão → tamanho
    let radius = (p.minSize + (p.maxSize - p.minSize) * v) * p.sizeScale;
    if (radius < 0.15) return;

    // movimento / fluxo
    let dx = 0;
    let dy = 0;
    if (p.flow > 0) {
      const fx = (px / 100) * p.flowScale;
      const fy = (py / 100) * p.flowScale;
      const ang =
        (p.flowAngle * Math.PI) / 180 +
        flowNoise(fx, fy) * Math.PI * 2 +
        p.wave * Math.sin((px + py) * 0.04);
      const mag = p.flow * (0.5 + 0.5 * flowNoise(fx + 10, fy + 10));
      dx = Math.cos(ang) * mag;
      dy = Math.sin(ang) * mag;
    }
    // jitter
    if (p.jitter > 0) {
      dx += (hashRand(i, j) - 0.5) * p.jitter * p.spacing;
      dy += (hashRand(i + 7919, j + 104729) - 0.5) * p.jitter * p.spacing;
    }

    let color: string;
    if (p.colorMode === "sample") color = rgbToHex(r, g, b);
    else if (p.colorMode === "duotone") color = lerpColor(p.color2, p.color1, v);
    else color = p.color1;

    dots.push({ x: px + dx, y: py + dy, r: radius, v, color });
  };

  if (p.grid === "concentric") {
    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.hypot(W, H) / 2;
    let ring = 0;
    for (let rad = 0; rad <= maxR; rad += p.spacing, ring++) {
      const count = Math.max(1, Math.round((2 * Math.PI * rad) / p.spacing));
      for (let k = 0; k < count; k++) {
        const ang = (k / count) * Math.PI * 2 + (ring % 2 ? Math.PI / count : 0);
        evalPoint(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, ring, k);
      }
    }
  } else {
    const stepX = p.spacing;
    const stepY = p.grid === "hex" ? p.spacing * 0.866 : p.spacing;
    const offsetRows = p.grid === "hex" || p.hexOffset;
    let row = 0;
    for (let py = stepY / 2; py < H; py += stepY, row++) {
      const xOff = offsetRows && row % 2 ? stepX / 2 : 0;
      for (let px = stepX / 2 + xOff; px < W; px += stepX) {
        evalPoint(px, py, Math.round(px / stepX), row);
      }
    }
  }

  return dots;
}

// ----------------------------------------------------------------------------
// Desenho de uma forma no canvas
// ----------------------------------------------------------------------------

function drawShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  shape: PointillismParams["shape"],
  rot: number
) {
  if (shape === "circle") {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (shape === "ring") {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(0.6, r * 0.4);
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.beginPath();
  if (shape === "square") {
    ctx.rect(-r, -r, r * 2, r * 2);
  } else if (shape === "diamond") {
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
  } else if (shape === "triangle") {
    const s = r * 1.4;
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.866, s * 0.5);
    ctx.lineTo(-s * 0.866, s * 0.5);
    ctx.closePath();
  } else if (shape === "hexagon") {
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k;
      const fx = Math.cos(a) * r;
      const fy = Math.sin(a) * r;
      if (k === 0) ctx.moveTo(fx, fy);
      else ctx.lineTo(fx, fy);
    }
    ctx.closePath();
  } else if (shape === "cross") {
    const t = r * 0.42;
    ctx.rect(-t, -r, t * 2, r * 2);
    ctx.rect(-r, -t, r * 2, t * 2);
  }
  ctx.fill();
  ctx.restore();
}

// ----------------------------------------------------------------------------
// Render para canvas (preview e export PNG)
// ----------------------------------------------------------------------------

export function renderCanvas(
  ctx: CanvasRenderingContext2D,
  dots: Dot[],
  p: PointillismParams,
  W: number,
  H: number,
  scale = 1
) {
  const w = W * scale;
  const h = H * scale;
  ctx.clearRect(0, 0, w, h);
  if (p.background === "solid") {
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalAlpha = p.opacity;

  if (p.connection === "cell") {
    renderCells(ctx, dots, p, w, h, scale);
    ctx.globalAlpha = 1;
    return;
  }

  if (p.connection === "links") {
    drawLinks(ctx, dots, p, scale);
  }

  for (const d of dots) {
    ctx.fillStyle = d.color;
    ctx.strokeStyle = d.color;
    drawShape(ctx, d.x * scale, d.y * scale, d.r * scale, p.shape, p.rotation);
  }
  ctx.globalAlpha = 1;
}

function drawLinks(ctx: CanvasRenderingContext2D, dots: Dot[], p: PointillismParams, scale: number) {
  const maxD = p.connectDistance * p.spacing;
  if (maxD <= 0) return;
  const cell = maxD;
  const buckets = new Map<string, Dot[]>();
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  for (const d of dots) {
    const k = key(d.x, d.y);
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(d);
  }
  ctx.lineWidth = p.linkWidth * scale;
  ctx.lineCap = "round";
  const maxD2 = maxD * maxD;
  for (const d of dots) {
    const bx = Math.floor(d.x / cell);
    const by = Math.floor(d.y / cell);
    for (let gx = bx; gx <= bx + 1; gx++) {
      for (let gy = by - 1; gy <= by + 1; gy++) {
        const arr = buckets.get(`${gx},${gy}`);
        if (!arr) continue;
        for (const o of arr) {
          if (o === d) continue;
          const dist2 = (o.x - d.x) ** 2 + (o.y - d.y) ** 2;
          if (dist2 > maxD2 || dist2 === 0) continue;
          if (o.x < d.x || (o.x === d.x && o.y <= d.y)) continue; // evita duplicar
          ctx.globalAlpha = p.opacity * (1 - Math.sqrt(dist2) / maxD);
          ctx.strokeStyle = d.color;
          ctx.beginPath();
          ctx.moveTo(d.x * scale, d.y * scale);
          ctx.lineTo(o.x * scale, o.y * scale);
          ctx.stroke();
        }
      }
    }
  }
  ctx.globalAlpha = p.opacity;
}

// Efeito "célula" — desenha as formas borradas e aplica threshold de alpha,
// fazendo bolinhas próximas se fundirem com pescoços elásticos (gooey).
function renderCells(
  ctx: CanvasRenderingContext2D,
  dots: Dot[],
  p: PointillismParams,
  w: number,
  h: number,
  scale: number
) {
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(w));
  off.height = Math.max(1, Math.round(h));
  const o = off.getContext("2d", { willReadFrequently: true })!;
  o.filter = `blur(${Math.max(0.01, p.elasticity * scale)}px)`;
  for (const d of dots) {
    o.fillStyle = d.color;
    o.strokeStyle = d.color;
    drawShape(o, d.x * scale, d.y * scale, d.r * scale * 1.15, p.shape, p.rotation);
  }
  o.filter = "none";

  const img = o.getImageData(0, 0, off.width, off.height);
  const px = img.data;
  const T = 150;
  for (let i = 3; i < px.length; i += 4) {
    px[i] = px[i] >= T ? 255 : 0;
  }
  o.putImageData(img, 0, 0);
  ctx.drawImage(off, 0, 0);
}

// ----------------------------------------------------------------------------
// Geração de SVG vetorial
// ----------------------------------------------------------------------------

function shapeSVG(d: Dot, p: PointillismParams): string {
  const x = d.x;
  const y = d.y;
  const r = d.r;
  const fill = `fill="${d.color}"`;
  const rot = p.rotation ? ` transform="rotate(${p.rotation} ${x.toFixed(2)} ${y.toFixed(2)})"` : "";
  switch (p.shape) {
    case "square":
      return `<rect x="${(x - r).toFixed(2)}" y="${(y - r).toFixed(2)}" width="${(r * 2).toFixed(2)}" height="${(r * 2).toFixed(2)}" ${fill}${rot}/>`;
    case "ring":
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="none" stroke="${d.color}" stroke-width="${Math.max(0.6, r * 0.4).toFixed(2)}"/>`;
    case "diamond": {
      const pts = `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;
      return `<polygon points="${pts}" ${fill}${rot}/>`;
    }
    case "triangle": {
      const s = r * 1.4;
      const pts = `${x},${y - s} ${x + s * 0.866},${y + s * 0.5} ${x - s * 0.866},${y + s * 0.5}`;
      return `<polygon points="${pts}" ${fill}${rot}/>`;
    }
    case "hexagon": {
      const pts: string[] = [];
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        pts.push(`${(x + Math.cos(a) * r).toFixed(2)},${(y + Math.sin(a) * r).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(" ")}" ${fill}${rot}/>`;
    }
    case "cross": {
      const t = r * 0.42;
      return `<g ${fill}${rot}><rect x="${(x - t).toFixed(2)}" y="${(y - r).toFixed(2)}" width="${(t * 2).toFixed(2)}" height="${(r * 2).toFixed(2)}"/><rect x="${(x - r).toFixed(2)}" y="${(y - t).toFixed(2)}" width="${(r * 2).toFixed(2)}" height="${(t * 2).toFixed(2)}"/></g>`;
    }
    default:
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" ${fill}/>`;
  }
}

export function buildSVG(
  dots: Dot[],
  p: PointillismParams,
  W: number,
  H: number,
  scale = 1
): string {
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${(W * scale).toFixed(0)}" height="${(H * scale).toFixed(0)}" viewBox="0 0 ${W} ${H}">`
  );

  if (p.connection === "cell") {
    out.push(
      `<defs><filter id="goo"><feGaussianBlur in="SourceGraphic" stdDeviation="${p.elasticity}" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"/></filter></defs>`
    );
  }

  if (p.background === "solid") {
    out.push(`<rect width="${W}" height="${H}" fill="${p.bgColor}"/>`);
  }

  const op = p.opacity < 1 ? ` opacity="${p.opacity}"` : "";

  if (p.connection === "links") {
    const maxD = p.connectDistance * p.spacing;
    if (maxD > 0) {
      const maxD2 = maxD * maxD;
      out.push(`<g stroke-linecap="round"${op}>`);
      for (let a = 0; a < dots.length; a++) {
        for (let b = a + 1; b < dots.length; b++) {
          const dx = dots[a].x - dots[b].x;
          const dy = dots[a].y - dots[b].y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 > maxD2 || dist2 === 0) continue;
          out.push(
            `<line x1="${dots[a].x.toFixed(2)}" y1="${dots[a].y.toFixed(2)}" x2="${dots[b].x.toFixed(2)}" y2="${dots[b].y.toFixed(2)}" stroke="${dots[a].color}" stroke-width="${p.linkWidth}" stroke-opacity="${(1 - Math.sqrt(dist2) / maxD).toFixed(2)}"/>`
          );
        }
      }
      out.push(`</g>`);
    }
  }

  const wrapOpen = p.connection === "cell" ? `<g filter="url(#goo)"${op}>` : `<g${op}>`;
  out.push(wrapOpen);
  for (const d of dots) out.push(shapeSVG(d, p));
  out.push(`</g>`);

  out.push(`</svg>`);
  return out.join("");
}
