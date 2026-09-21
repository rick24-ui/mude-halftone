// ─── Motor Central de ASCII & Braille Art — UPGM Lab ─────────────────────────

export type AsciiMode = "ascii" | "braille";
export type DitherType = "none" | "atkinson" | "fs" | "ordered";
export type ColorMode = "mono" | "rgb" | "gradient";
export type InputSourceType = "image" | "camera" | "text";

export interface AsciiParams {
  mode: AsciiMode;
  width: number; // quantidade de colunas de caracteres (ex: 40 a 240)
  fontSize: number; // tamanho da fonte em px (ex: 6 a 24)
  lineHeight: number; // proporção de entrelinha (0.7 a 1.4)
  scaleX: number; // deformação horizontal
  scaleY: number; // deformação vertical
  aspectRatioCorrection: number; // proporção da célula mono (padrão 0.50)
  brightness: number; // -100 a +100
  contrast: number; // 0.2 a 3.0
  gamma: number; // 0.5 a 2.5
  invert: boolean;
  charset: string;
  edgeDetection: boolean;
  edgeStrength: number; // 0 a 100
  dither: DitherType;
  threshold: number; // 0 a 255 (para Braille / Dithering)
  fillBlanks: boolean; // preenche espaços vazios Braille
  colorMode: ColorMode;
  textColor: string;
  bgColor: string;
  gradientColor1: string;
  gradientColor2: string;
  gradientAngle: number;
  scanlines: boolean;
  glow: boolean;
  themePreset: string;
}

export const CHARSETS: Record<string, { label: string; chars: string }> = {
  standard: { label: "Padrão", chars: " .:-=+*#%@" },
  detailed: { label: "70 Níveis", chars: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. " },
  blocks: { label: "Blocos", chars: " ░▒▓█" },
  binary: { label: "Binário", chars: " 01" },
  minimal: { label: "Minimal", chars: " .oO@" },
  lines: { label: "Linhas", chars: " ─│┌┐└┘├┤┬┴┼" },
  katakana: { label: "Matrix", chars: " ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ" },
  cyberpunk: { label: "Cyber", chars: " :;=!*#%@" },
  simple: { label: "Simples", chars: " .*" },
};

export const COLOR_THEMES: Record<
  string,
  { label: string; text: string; bg: string; grad1: string; grad2: string; glow: boolean; scanlines: boolean }
> = {
  upgm: {
    label: "UPGM Carmesim",
    text: "#f2f2f4",
    bg: "#0d0d0f",
    grad1: "#d00000",
    grad2: "#ffffff",
    glow: true,
    scanlines: false,
  },
  matrix: {
    label: "Cyber Matrix",
    text: "#00ff66",
    bg: "#040c06",
    grad1: "#003b14",
    grad2: "#00ff88",
    glow: true,
    scanlines: true,
  },
  amber: {
    label: "Âmbar Retro",
    text: "#ffb000",
    bg: "#0f0a02",
    grad1: "#7a4100",
    grad2: "#ffcc44",
    glow: true,
    scanlines: true,
  },
  cyan: {
    label: "Tokyo Cyan",
    text: "#00f0ff",
    bg: "#040914",
    grad1: "#002a66",
    grad2: "#38bdf8",
    glow: true,
    scanlines: false,
  },
  ice: {
    label: "Ice White",
    text: "#f2f2f4",
    bg: "#0a0a0c",
    grad1: "#475569",
    grad2: "#f8fafc",
    glow: false,
    scanlines: false,
  },
  paper: {
    label: "Papel Invertido",
    text: "#0d0d0f",
    bg: "#f4f4f6",
    grad1: "#0d0d0f",
    grad2: "#94a3b8",
    glow: false,
    scanlines: false,
  },
};

export const DEFAULT_ASCII_PARAMS: AsciiParams = {
  mode: "ascii",
  width: 110,
  fontSize: 9,
  lineHeight: 1.0,
  scaleX: 1.0,
  scaleY: 1.0,
  aspectRatioCorrection: 0.50,
  brightness: 0,
  contrast: 1.0,
  gamma: 1.0,
  invert: false,
  charset: CHARSETS.standard.chars,
  edgeDetection: true,
  edgeStrength: 35,
  dither: "none",
  threshold: 128,
  fillBlanks: true,
  colorMode: "mono",
  textColor: "#f2f2f4",
  bgColor: "#0d0d0f",
  gradientColor1: "#d00000",
  gradientColor2: "#ffffff",
  gradientAngle: 90,
  scanlines: false,
  glow: false,
  themePreset: "upgm",
};

export interface AsciiCharData {
  char: string;
  r: number;
  g: number;
  b: number;
}

export interface AsciiRenderResult {
  text: string;
  html: string;
  grid: AsciiCharData[][];
  cols: number;
  rows: number;
  timeMs: number;
}

// ─── Matriz de Pontos Braille Unicode (2x4) ─────────────────────────────────
// Padrão Braille: 2 colunas x 4 linhas por caractere Unicode (0x2800..0x28FF)
const BRAILLE_DOT_MAP: number[][] = [
  [1, 2, 4, 64],   // coluna 0 (dots 1, 2, 3, 7)
  [8, 16, 32, 128], // coluna 1 (dots 4, 5, 6, 8)
];

// Matriz de Bayer 4x4 para Ordered Dithering
const BAYER_4X4: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// ─── Limiar de Otsu Automático ──────────────────────────────────────────────
export function computeOtsuThreshold(luminance: Float32Array): number {
  const hist = new Int32Array(256);
  const total = luminance.length;
  if (total === 0) return 128;

  for (let i = 0; i < total; i++) {
    const val = Math.min(255, Math.max(0, Math.floor(luminance[i] * 255)));
    hist[val]++;
  }

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  return threshold;
}

// ─── Dithering: Atkinson ────────────────────────────────────────────────────
function ditherAtkinson(data: Float32Array, W: number, H: number, thresholdNorm: number) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const oldVal = data[idx];
      const newVal = oldVal > thresholdNorm ? 1 : 0;
      data[idx] = newVal;
      const err = (oldVal - newVal) / 8;

      if (x + 1 < W) data[idx + 1] += err;
      if (x + 2 < W) data[idx + 2] += err;
      if (y + 1 < H) {
        if (x - 1 >= 0) data[(y + 1) * W + (x - 1)] += err;
        data[(y + 1) * W + x] += err;
        if (x + 1 < W) data[(y + 1) * W + (x + 1)] += err;
      }
      if (y + 2 < H) {
        data[(y + 2) * W + x] += err;
      }
    }
  }
}

// ─── Dithering: Floyd-Steinberg ─────────────────────────────────────────────
function ditherFloydSteinberg(data: Float32Array, W: number, H: number, thresholdNorm: number) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const oldVal = data[idx];
      const newVal = oldVal > thresholdNorm ? 1 : 0;
      data[idx] = newVal;
      const err = oldVal - newVal;

      if (x + 1 < W) data[idx + 1] += (err * 7) / 16;
      if (y + 1 < H) {
        if (x - 1 >= 0) data[(y + 1) * W + (x - 1)] += (err * 3) / 16;
        data[(y + 1) * W + x] += (err * 5) / 16;
        if (x + 1 < W) data[(y + 1) * W + (x + 1)] += (err * 1) / 16;
      }
    }
  }
}

// ─── Dithering: Bayer 4x4 ──────────────────────────────────────────────────
function ditherBayer(data: Float32Array, W: number, H: number, thresholdNorm: number) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const bayerVal = BAYER_4X4[y % 4][x % 4] / 16 - 0.5;
      data[idx] = data[idx] + bayerVal * 0.45 > thresholdNorm ? 1 : 0;
    }
  }
}

// ─── Detecção de Bordas Direcionais (Sobel) ─────────────────────────────────
function getDirectionalEdgeChar(angle: number): string {
  let a = angle;
  if (a < 0) a += Math.PI;
  if (a < Math.PI * 0.125 || a >= Math.PI * 0.875) return "—";
  if (a < Math.PI * 0.375) return "/";
  if (a < Math.PI * 0.625) return "|";
  return "\\";
}

// ─── Utilitários de Canvas Offscreen ────────────────────────────────────────
let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

function getOffscreen(width: number, height: number) {
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement("canvas");
    offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
  }
  offscreenCanvas.width = width;
  offscreenCanvas.height = height;
  return { canvas: offscreenCanvas, ctx: offscreenCtx! };
}

function escapeHtml(char: string): string {
  if (char === "<") return "&lt;";
  if (char === ">") return "&gt;";
  if (char === "&") return "&amp;";
  return char;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

// ─── Buffer Pools para evitar GC Thrashing durante movimento de sliders ───
let lumPool: Float32Array = new Float32Array(100000);
let edgeMagPool: Float32Array = new Float32Array(100000);
let edgeAngPool: Float32Array = new Float32Array(100000);
let subLumPool: Float32Array = new Float32Array(250000);

function getLumPool(size: number): Float32Array {
  if (lumPool.length < size) {
    lumPool = new Float32Array(Math.max(size, lumPool.length * 2));
  }
  return lumPool;
}

function getEdgeMagPool(size: number): Float32Array {
  if (edgeMagPool.length < size) {
    edgeMagPool = new Float32Array(Math.max(size, edgeMagPool.length * 2));
  }
  return edgeMagPool;
}

function getEdgeAngPool(size: number): Float32Array {
  if (edgeAngPool.length < size) {
    edgeAngPool = new Float32Array(Math.max(size, edgeAngPool.length * 2));
  }
  return edgeAngPool;
}

function getSubLumPool(size: number): Float32Array {
  if (subLumPool.length < size) {
    subLumPool = new Float32Array(Math.max(size, subLumPool.length * 2));
  }
  return subLumPool;
}

// ─── Renderizador Principal: Imagem para ASCII ──────────────────────────────
export function renderImageToAscii(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  p: AsciiParams
): AsciiRenderResult {
  const startTime = performance.now();

  const cols = Math.max(10, Math.min(300, Math.round(p.width * p.scaleX)));
  const aspect = sourceHeight / sourceWidth;
  const rows = Math.max(
    5,
    Math.round(p.width * aspect * p.aspectRatioCorrection * p.scaleY)
  );

  const { ctx } = getOffscreen(cols, rows);
  ctx.drawImage(source, 0, 0, cols, rows);
  const imgData = ctx.getImageData(0, 0, cols, rows).data;

  const totalPixels = cols * rows;
  const luminance = getLumPool(totalPixels);

  const bFactor = p.brightness / 100;
  const cFactor = p.contrast;
  const gFactor = 1 / p.gamma;

  // 1. Converte para Luminância corrigida
  for (let i = 0, pIdx = 0; i < totalPixels; i++, pIdx += 4) {
    const r = imgData[pIdx];
    const g = imgData[pIdx + 1];
    const b = imgData[pIdx + 2];
    let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Contraste e brilho
    lum = (lum - 0.5) * cFactor + 0.5 + bFactor;
    // Gamma
    if (gFactor !== 1 && lum > 0) lum = Math.pow(lum, gFactor);

    lum = Math.max(0, Math.min(1, p.invert ? 1 - lum : lum));
    luminance[i] = lum;
  }

  // 2. Filtro de Sobel (Detecção de bordas direcionais)
  const edgeMag = getEdgeMagPool(totalPixels);
  const edgeAng = getEdgeAngPool(totalPixels);
  let maxMag = 0;

  if (p.edgeDetection && p.edgeStrength > 0) {
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const c = y * cols + x;
        const tl = luminance[c - cols - 1];
        const tc = luminance[c - cols];
        const tr = luminance[c - cols + 1];
        const ml = luminance[c - 1];
        const mr = luminance[c + 1];
        const bl = luminance[c + cols - 1];
        const bc = luminance[c + cols];
        const br = luminance[c + cols + 1];

        const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
        const mag = Math.sqrt(gx * gx + gy * gy);

        edgeMag[c] = mag;
        edgeAng[c] = Math.atan2(gy, gx);
        if (mag > maxMag) maxMag = mag;
      }
    }
  }

  const edgeThreshold =
    maxMag > 0 ? maxMag * (1 - p.edgeStrength / 100) * 0.65 : Infinity;

  // 3. Montagem dos Caracteres e Cores
  const charset = p.charset && p.charset.length >= 2 ? p.charset : CHARSETS.standard.chars;
  const numChars = charset.length;

  const grad1 = hexToRgb(p.gradientColor1);
  const grad2 = hexToRgb(p.gradientColor2);

  const linesText: string[] = [];
  const linesHtml: string[] = [];
  const grid: AsciiCharData[][] = [];

  for (let y = 0; y < rows; y++) {
    const rowChars: string[] = [];
    const rowSpans: string[] = [];
    const rowData: AsciiCharData[] = [];

    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const pIdx = idx * 4;
      const r = imgData[pIdx];
      const g = imgData[pIdx + 1];
      const b = imgData[pIdx + 2];

      const lum = luminance[idx];
      let char = " ";

      if (p.edgeDetection && edgeMag[idx] >= edgeThreshold && edgeMag[idx] > 0) {
        char = getDirectionalEdgeChar(edgeAng[idx]);
      } else {
        const charIdx = Math.min(numChars - 1, Math.floor(lum * numChars));
        char = charset[charIdx] ?? " ";
      }

      rowChars.push(char);

      // Determina a cor
      let charR = 240,
        charG = 240,
        charB = 244;
      if (p.colorMode === "rgb") {
        charR = r;
        charG = g;
        charB = b;
      } else if (p.colorMode === "gradient") {
        // Mapeia luminância para interpolação entre as duas cores
        charR = Math.round(grad1.r + (grad2.r - grad1.r) * lum);
        charG = Math.round(grad1.g + (grad2.g - grad1.g) * lum);
        charB = Math.round(grad1.b + (grad2.b - grad1.b) * lum);
      } else {
        const mono = hexToRgb(p.textColor);
        charR = mono.r;
        charG = mono.g;
        charB = mono.b;
      }

      rowData.push({ char, r: charR, g: charG, b: charB });

      const safe = escapeHtml(char);
      if (p.colorMode === "mono") {
        rowSpans.push(safe);
      } else {
        rowSpans.push(
          `<span style="color:rgb(${charR},${charG},${charB})">${safe}</span>`
        );
      }
    }

    linesText.push(rowChars.join(""));
    if (p.colorMode !== "mono") {
      linesHtml.push(rowSpans.join(""));
    }
    grid.push(rowData);
  }

  const endTime = performance.now();
  const fullText = linesText.join("\n");

  return {
    text: fullText,
    html: p.colorMode === "mono" ? fullText : linesHtml.join("\n"),
    grid,
    cols,
    rows,
    timeMs: Math.round(endTime - startTime),
  };
}

// ─── Renderizador Principal: Imagem para Braille ────────────────────────────
export function renderImageToBraille(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  p: AsciiParams
): AsciiRenderResult {
  const startTime = performance.now();

  const cols = Math.max(10, Math.min(240, Math.round(p.width * p.scaleX)));
  const aspect = sourceHeight / sourceWidth;
  const rows = Math.max(
    5,
    Math.round(p.width * aspect * p.aspectRatioCorrection * p.scaleY)
  );

  // Cada caractere Braille representa uma grade 2x4 de subpixels
  const subCols = cols * 2;
  const subRows = rows * 4;

  const { ctx } = getOffscreen(subCols, subRows);
  ctx.drawImage(source, 0, 0, subCols, subRows);
  const imgData = ctx.getImageData(0, 0, subCols, subRows).data;

  const totalSub = subCols * subRows;
  const subLuminance = getSubLumPool(totalSub);

  const bFactor = p.brightness / 100;
  const cFactor = p.contrast;
  const gFactor = 1 / p.gamma;

  for (let i = 0, pIdx = 0; i < totalSub; i++, pIdx += 4) {
    let lum =
      (0.299 * imgData[pIdx] +
        0.587 * imgData[pIdx + 1] +
        0.114 * imgData[pIdx + 2]) /
      255;
    lum = (lum - 0.5) * cFactor + 0.5 + bFactor;
    if (gFactor !== 1 && lum > 0) lum = Math.pow(lum, gFactor);
    lum = Math.max(0, Math.min(1, p.invert ? 1 - lum : lum));
    subLuminance[i] = lum;
  }

  // Dithering no sub-grid 2x4
  const thresholdNorm = p.threshold / 255;
  if (p.dither === "atkinson") {
    ditherAtkinson(subLuminance, subCols, subRows, thresholdNorm);
  } else if (p.dither === "fs") {
    ditherFloydSteinberg(subLuminance, subCols, subRows, thresholdNorm);
  } else if (p.dither === "ordered") {
    ditherBayer(subLuminance, subCols, subRows, thresholdNorm);
  }

  const isDotLit = (subIdx: number) => {
    if (p.dither === "none") {
      return subLuminance[subIdx] > thresholdNorm;
    }
    return subLuminance[subIdx] > 0.5;
  };

  const grad1 = hexToRgb(p.gradientColor1);
  const grad2 = hexToRgb(p.gradientColor2);
  const monoColor = hexToRgb(p.textColor);

  const linesText: string[] = [];
  const linesHtml: string[] = [];
  const grid: AsciiCharData[][] = [];

  for (let y = 0; y < rows; y++) {
    const rowChars: string[] = [];
    const rowSpans: string[] = [];
    const rowData: AsciiCharData[] = [];

    for (let x = 0; x < cols; x++) {
      let mask = 0;
      let sumR = 0,
        sumG = 0,
        sumB = 0,
        litDots = 0;

      // Percorre os 8 pontos da célula 2x4
      for (let bx = 0; bx < 2; bx++) {
        for (let by = 0; by < 4; by++) {
          const sx = x * 2 + bx;
          const sy = y * 4 + by;
          const subIdx = sy * subCols + sx;

          if (isDotLit(subIdx)) {
            mask |= BRAILLE_DOT_MAP[bx][by];
            const pIdx = subIdx * 4;
            sumR += imgData[pIdx];
            sumG += imgData[pIdx + 1];
            sumB += imgData[pIdx + 2];
            litDots++;
          }
        }
      }

      // Código Unicode Braille
      let char = String.fromCodePoint(10240 + mask);
      if (mask === 0 && p.fillBlanks) {
        char = " "; // espaço padrão
      }

      rowChars.push(char);

      // Média de cores dos pontos acesos
      let charR = monoColor.r;
      let charG = monoColor.g;
      let charB = monoColor.b;

      if (p.colorMode === "rgb") {
        if (litDots > 0) {
          charR = Math.round(sumR / litDots);
          charG = Math.round(sumG / litDots);
          charB = Math.round(sumB / litDots);
        } else {
          charR = 40;
          charG = 40;
          charB = 40;
        }
      } else if (p.colorMode === "gradient") {
        const normY = rows > 1 ? y / (rows - 1) : 0;
        charR = Math.round(grad1.r + (grad2.r - grad1.r) * normY);
        charG = Math.round(grad1.g + (grad2.g - grad1.g) * normY);
        charB = Math.round(grad1.b + (grad2.b - grad1.b) * normY);
      }

      rowData.push({ char, r: charR, g: charG, b: charB });

      if (p.colorMode === "mono") {
        rowSpans.push(char);
      } else {
        rowSpans.push(
          `<span style="color:rgb(${charR},${charG},${charB})">${char}</span>`
        );
      }
    }

    linesText.push(rowChars.join(""));
    if (p.colorMode !== "mono") {
      linesHtml.push(rowSpans.join(""));
    }
    grid.push(rowData);
  }

  const endTime = performance.now();
  const fullText = linesText.join("\n");

  return {
    text: fullText,
    html: p.colorMode === "mono" ? fullText : linesHtml.join("\n"),
    grid,
    cols,
    rows,
    timeMs: Math.round(endTime - startTime),
  };
}
