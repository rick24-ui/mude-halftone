import { Dot, PointillismParams, INK } from "./types";
import { buildSVG, renderCanvas, sampleDots, imageToSource } from "./engine";
import { applyAnimation } from "./animation";

export function timestampName(prefix = "mude-pontilhismo", ext = "png"): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${prefix}_${stamp}.${ext}`;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function exportPNG(
  dots: Dot[],
  params: PointillismParams,
  W: number,
  H: number,
  scale: number
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d")!;
  renderCanvas(ctx, dots, params, W, H, scale);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    triggerDownload(url, timestampName("mude-pontilhismo", "png"));
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

export function exportSVG(dots: Dot[], params: PointillismParams, W: number, H: number) {
  const svg = buildSVG(dots, params, W, H);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, timestampName("mude-pontilhismo", "svg"));
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderToCanvas(dots: Dot[], params: PointillismParams, W: number, H: number, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d")!;
  renderCanvas(ctx, dots, params, W, H, scale);
  return canvas;
}

export async function exportPDF(
  dots: Dot[],
  params: PointillismParams,
  W: number,
  H: number,
  scale: number
) {
  const { jsPDF } = await import("jspdf");
  const canvas = renderToCanvas(dots, params, W, H, scale);
  const png = canvas.toDataURL("image/png");
  const orientation = W >= H ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height] });
  pdf.addImage(png, "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(timestampName("mude-pontilhismo", "pdf"));
}

export interface BatchItem {
  file: File;
  status: "pending" | "done" | "error";
}

export async function processBatch(
  files: File[],
  params: PointillismParams,
  format: "png" | "svg",
  scale: number,
  maxDim: number,
  onProgress?: (done: number, total: number, name: string) => void
): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let done = 0;

  for (const file of files) {
    try {
      const img = await fileToImage(file);
      const source = imageToSource(img, maxDim);
      const dots = sampleDots(source, params);
      const base = file.name.replace(/\.[^.]+$/, "");
      if (format === "svg") {
        zip.file(`${base}.svg`, buildSVG(dots, params, source.width, source.height));
      } else {
        const canvas = renderToCanvas(dots, params, source.width, source.height, scale);
        const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
        if (blob) zip.file(`${base}.png`, blob);
      }
      URL.revokeObjectURL(img.src);
    } catch {
      /* pula arquivo com erro */
    }
    done++;
    onProgress?.(done, files.length, file.name);
  }

  return zip.generateAsync({ type: "blob" });
}

// ----------------------------------------------------------------------------
// Export animado (GIF / MP4 / WebM) — loop perfeito
// ----------------------------------------------------------------------------

interface H264Encoder {
  width: number;
  height: number;
  frameRate: number;
  kbps: number;
  speed: number;
  groupOfPictures: number;
  quantizationParameter: number;
  outputFilename: string;
  initialize(): void;
  addFrameRgba(data: Uint8Array | Uint8ClampedArray): void;
  finalize(): void;
  delete(): void;
  FS: { readFile(path: string): Uint8Array };
}
interface HMEModule {
  createH264MP4Encoder(): Promise<H264Encoder>;
}

export interface AnimExportOpts {
  fps?: number;
  loops?: number;     // nº de ciclos no arquivo (duração = loops * 2.5s base não — ver duration)
  duration?: number;  // segundos
  scale?: number;
  onProgress?: (done: number, total: number) => void;
}

function evenDim(v: number) {
  return Math.max(2, Math.round(v / 2) * 2);
}

// params com fundo forçado sólido (GIF/MP4 não lidam bem com alpha)
function opaqueParams(p: PointillismParams): PointillismParams {
  return {
    ...p,
    background: "solid",
    bgColor: p.background === "solid" ? p.bgColor : INK,
  };
}

export async function exportGIF(
  dots: Dot[],
  params: PointillismParams,
  W: number,
  H: number,
  opts: AnimExportOpts = {}
) {
  const { fps = 18, duration = 2.5, scale = 1, onProgress } = opts;
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const w = evenDim(W * scale);
  const h = evenDim(H * scale);
  const sc = w / W;
  const ep = opaqueParams(params);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const frames = Math.max(2, Math.round(fps * duration));
  const delay = Math.round(1000 / fps);
  const gif = GIFEncoder();

  for (let i = 0; i < frames; i++) {
    const phase = i / frames;
    const frame = applyAnimation(dots, params, phase);
    renderCanvas(ctx, frame, ep, W, H, sc);
    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, w, h, { palette, delay });
    onProgress?.(i + 1, frames);
    if (i % 4 === 0) await new Promise((r) => setTimeout(r)); // cede a thread
  }
  gif.finish();
  const gifBytes = gif.bytes() as unknown as BlobPart;
  downloadBlob(new Blob([gifBytes], { type: "image/gif" }), timestampName("mude-pontilhismo", "gif"));
}

// bitrate generoso para manter as bordas dos pontos nítidas
function videoBitrate(w: number, h: number, fps: number) {
  return Math.min(50_000_000, Math.max(12_000_000, Math.round(w * h * fps * 0.45)));
}

// carrega o encoder H.264 (WASM) servido em /public — funciona em qualquer navegador
let hmePromise: Promise<HMEModule> | null = null;
function loadHME(): Promise<HMEModule> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem window"));
  const win = window as unknown as { HME?: HMEModule };
  if (win.HME) return Promise.resolve(win.HME);
  if (hmePromise) return hmePromise;
  hmePromise = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "/vendor/h264-mp4-encoder.web.js";
    s.async = true;
    s.onload = () => (win.HME ? res(win.HME) : rej(new Error("HME ausente")));
    s.onerror = () => rej(new Error("falha ao carregar encoder MP4"));
    document.head.appendChild(s);
  });
  return hmePromise;
}

export async function exportVideo(
  dots: Dot[],
  params: PointillismParams,
  W: number,
  H: number,
  opts: AnimExportOpts = {}
): Promise<"mp4"> {
  const { fps = 30, duration = 2.5, scale = 1, onProgress } = opts;
  // limita a maior dimensão a 1920 (performance + compatibilidade de codec)
  const cap = Math.min(scale, 1920 / Math.max(W, H));
  const w = evenDim(W * cap);
  const h = evenDim(H * cap);
  const sc = w / W;
  const ep = opaqueParams(params);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const frames = Math.max(2, Math.round(fps * duration));
  const bitrate = videoBitrate(w, h, fps);

  const hasWebCodecs =
    typeof window !== "undefined" && typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== "undefined";

  // 1) Caminho rápido: WebCodecs (H.264 por hardware) → MP4
  if (hasWebCodecs) {
    try {
      const candidates = ["avc1.640034", "avc1.420034", "avc1.4d0034", "avc1.640028", "avc1.42002a", "avc1.42001f"];
      let codec = "";
      for (const c of candidates) {
        try {
          const s = await VideoEncoder.isConfigSupported({ codec: c, width: w, height: h, bitrate, framerate: fps });
          if (s.supported) {
            codec = c;
            break;
          }
        } catch {
          /* próximo */
        }
      }
      if (!codec) throw new Error("sem codec AVC");

      const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: "avc", width: w, height: h },
        fastStart: "in-memory",
      });
      let encError: unknown = null;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => (encError = e),
      });
      encoder.configure({ codec, width: w, height: h, bitrate, framerate: fps, latencyMode: "quality" });

      for (let i = 0; i < frames; i++) {
        if (encError) throw encError;
        renderCanvas(ctx, applyAnimation(dots, params, i / frames), ep, W, H, sc);
        const vf = new VideoFrame(canvas, { timestamp: (i * 1e6) / fps, duration: 1e6 / fps });
        encoder.encode(vf, { keyFrame: i % Math.max(1, Math.round(fps / 3)) === 0 });
        vf.close();
        onProgress?.(i + 1, frames);
        if (i % 6 === 0) await new Promise((r) => setTimeout(r));
      }
      await encoder.flush();
      if (encError) throw encError;
      muxer.finalize();
      downloadBlob(new Blob([muxer.target.buffer], { type: "video/mp4" }), timestampName("mude-pontilhismo", "mp4"));
      return "mp4";
    } catch (e) {
      console.warn("WebCodecs indisponível, usando encoder WASM:", e);
    }
  }

  // 2) Fallback universal: encoder H.264 em WASM → MP4 (Safari/Firefox/etc.)
  // Encoder por software é lento → resolução/fps menores; GOP curto = mais
  // keyframes (melhor seek/compatibilidade com QuickTime).
  const wasmCap = Math.min(scale, 880 / Math.max(W, H));
  const ww = evenDim(W * wasmCap);
  const wh = evenDim(H * wasmCap);
  const wsc = ww / W;
  const wfps = Math.min(fps, 24);
  const wframes = Math.max(2, Math.round(wfps * duration));
  const wcanvas = document.createElement("canvas");
  wcanvas.width = ww;
  wcanvas.height = wh;
  const wctx = wcanvas.getContext("2d", { willReadFrequently: true })!;

  const HME = await loadHME();
  const enc = await HME.createH264MP4Encoder();
  enc.width = ww;
  enc.height = wh;
  enc.frameRate = wfps;
  enc.kbps = Math.round(videoBitrate(ww, wh, wfps) / 1000);
  enc.speed = 6; // mais rápido (software)
  enc.groupOfPictures = Math.max(2, Math.round(wfps / 3)); // ~8 → keyframes frequentes
  enc.initialize();
  for (let i = 0; i < wframes; i++) {
    wctx.clearRect(0, 0, ww, wh);
    renderCanvas(wctx, applyAnimation(dots, params, i / wframes), ep, W, H, wsc);
    const img = wctx.getImageData(0, 0, ww, wh);
    enc.addFrameRgba(new Uint8Array(img.data.buffer));
    onProgress?.(i + 1, wframes);
    if (i % 3 === 0) await new Promise((r) => setTimeout(r));
  }
  enc.finalize();
  const out = enc.FS.readFile(enc.outputFilename);
  const bytes = out.slice() as unknown as BlobPart;
  enc.delete();
  downloadBlob(new Blob([bytes], { type: "video/mp4" }), timestampName("mude-pontilhismo", "mp4"));
  return "mp4";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("erro"));
    img.src = url;
  });
}

export async function copyPNGToClipboard(
  dots: Dot[],
  params: PointillismParams,
  W: number,
  H: number,
  scale: number
): Promise<boolean> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext("2d")!;
    renderCanvas(ctx, dots, params, W, H, scale);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (!blob) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
