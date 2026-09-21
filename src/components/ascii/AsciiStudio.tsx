"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  AsciiParams,
  AsciiRenderResult,
  DEFAULT_ASCII_PARAMS,
  InputSourceType,
  renderImageToAscii,
  renderImageToBraille,
  computeOtsuThreshold,
} from "@/lib/ascii";
import { renderFiglet, applyColorGradient } from "@/lib/asciiFonts";
import {
  downloadPng,
  copyPngToClipboard,
  downloadSvg,
  downloadTxt,
  downloadJson,
  copyText,
  copyDiscord,
  copySocialSafe,
  copyHtmlFormatted,
} from "@/lib/asciiExport";
import AsciiCanvas from "./AsciiCanvas";
import AsciiControls from "./AsciiControls";

export default function AsciiStudio() {
  const [params, setParams] = useState<AsciiParams>(() => ({
    ...DEFAULT_ASCII_PARAMS,
  }));
  const [inputSource, setInputSource] = useState<InputSourceType>("image");

  // Imagem carregada
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState<string>("wave_ascii.jpg");

  // Câmera ao vivo
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const animFrameRef = useRef<number | null>(null);

  // FIGlet Texto
  const [figletText, setFigletText] = useState("UPGM LAB");
  const [figletFont, setFigletFont] = useState("Standard");
  const [figletGradient, setFigletGradient] = useState(true);
  const [figletGradFrom, setFigletGradFrom] = useState("#d00000");
  const [figletGradTo, setFigletGradTo] = useState("#ffffff");
  const [figletGradDir, setFigletGradDir] = useState<"horizontal" | "vertical" | "diagonal">("horizontal");

  // Viewport & UI
  const [zoom, setZoom] = useState(1.0);
  const [showLoupe, setShowLoupe] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePos, setComparePos] = useState(50);
  const [exportScale, setExportScale] = useState<1 | 2 | 4>(2);
  const [copiedState, setCopiedState] = useState<string | null>(null);

  // Resultado da Renderização
  const [result, setResult] = useState<AsciiRenderResult | null>(null);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Atualizador genérico de parâmetros
  const handleParamChange = useCallback(
    <K extends keyof AsciiParams>(key: K, value: AsciiParams[K]) => {
      setParams((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // ─── Carregamento de Imagem ───────────────────────────────────────────────
  const loadImageFromFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(img);
      setImageName(file.name);
      setInputSource("image");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  const loadSampleImage = useCallback(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(img);
      setImageName("wave_ascii.jpg");
    };
    img.src = "/samples/wave_ascii.jpg";
  }, []);

  // Carrega imagem de exemplo automaticamente ao montar
  useEffect(() => {
    loadSampleImage();
  }, [loadSampleImage]);

  // Suporte a Paste (Ctrl+V / Cmd+V) para imagens
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith("image/")) {
          loadImageFromFile(file);
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [loadImageFromFile]);

  // ─── Gerenciamento de Câmera ao Vivo (Webcam) ─────────────────────────────
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      alert("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
      setInputSource("image");
    }
  }, [stopCamera]);

  useEffect(() => {
    if (inputSource === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [inputSource, startCamera, stopCamera]);

  // ─── Pipeline de Renderização ─────────────────────────────────────────────
  const renderCurrentState = useCallback(() => {
    if (inputSource === "text") {
      const plainAscii = renderFiglet(figletText, {
        font: figletFont,
        width: params.width,
      });

      const html = figletGradient
        ? applyColorGradient(plainAscii, figletGradFrom, figletGradTo, figletGradDir)
        : plainAscii;

      const lines = plainAscii.split("\n");
      const rows = lines.length;
      const cols = lines.reduce((max, l) => Math.max(max, l.length), 0);

      const grid = lines.map((line) =>
        [...line].map((char) => ({
          char,
          r: 242,
          g: 242,
          b: 244,
        }))
      );

      setResult({
        text: plainAscii,
        html,
        grid,
        cols,
        rows,
        timeMs: 2,
      });
      return;
    }

    // Se for câmera
    if (inputSource === "camera" && videoRef.current && cameraActive) {
      const v = videoRef.current;
      if (v.readyState >= 2 && v.videoWidth > 0) {
        const res =
          params.mode === "braille"
            ? renderImageToBraille(v, v.videoWidth, v.videoHeight, params)
            : renderImageToAscii(v, v.videoWidth, v.videoHeight, params);
        setResult(res);
      }
      return;
    }

    // Se for imagem
    if (inputSource === "image" && image) {
      const res =
        params.mode === "braille"
          ? renderImageToBraille(image, image.naturalWidth, image.naturalHeight, params)
          : renderImageToAscii(image, image.naturalWidth, image.naturalHeight, params);
      setResult(res);
    }
  }, [
    inputSource,
    image,
    cameraActive,
    params,
    figletText,
    figletFont,
    figletGradient,
    figletGradFrom,
    figletGradTo,
    figletGradDir,
  ]);

  // Loop contínuo da webcam
  useEffect(() => {
    if (inputSource !== "camera" || !cameraActive) return;

    let isMounted = true;
    const loop = () => {
      if (!isMounted) return;
      renderCurrentState();
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      isMounted = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [inputSource, cameraActive, renderCurrentState]);

  // Atualização reativa para Imagem e Texto com requestAnimationFrame (60fps suave)
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (inputSource === "camera") return;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      renderCurrentState();
      rafRef.current = null;
    });

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [inputSource, renderCurrentState]);

  // ─── Auto Limiar de Otsu ──────────────────────────────────────────────────
  const handleAutoThreshold = useCallback(() => {
    if (!image && !videoRef.current) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const source = inputSource === "camera" && videoRef.current ? videoRef.current : image;
    if (!source) return;

    const W = 160;
    const H = 120;
    canvas.width = W;
    canvas.height = H;
    ctx.drawImage(source, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;

    const lum = new Float32Array(W * H);
    for (let i = 0, pIdx = 0; i < W * H; i++, pIdx += 4) {
      lum[i] =
        (0.299 * data[pIdx] + 0.587 * data[pIdx + 1] + 0.114 * data[pIdx + 2]) /
        255;
    }

    const otsu = computeOtsuThreshold(lum);
    handleParamChange("threshold", otsu);
  }, [image, inputSource, handleParamChange]);

  // Reset de Parâmetros
  const handleResetParams = useCallback(() => {
    setParams({ ...DEFAULT_ASCII_PARAMS });
  }, []);

  // ─── Feedback de Cópia ────────────────────────────────────────────────────
  const showCopiedFeedback = (type: string) => {
    setCopiedState(type);
    setTimeout(() => setCopiedState(null), 2000);
  };

  // ─── Handlers de Exportação ───────────────────────────────────────────────
  const handleDownloadPng = async () => {
    if (!result) return;
    await downloadPng(result, exportScale, {
      fontSize: params.fontSize,
      lineHeight: params.lineHeight,
      bgColor: params.bgColor,
    });
  };

  const handleDownloadSvg = () => {
    if (!result) return;
    downloadSvg(result, {
      fontSize: params.fontSize,
      lineHeight: params.lineHeight,
      bgColor: params.bgColor,
    });
  };

  const handleDownloadTxt = () => {
    if (!result) return;
    downloadTxt(result);
  };

  const handleDownloadJson = () => {
    if (!result) return;
    downloadJson(result);
  };

  const handleCopyPng = async () => {
    if (!result) return;
    const ok = await copyPngToClipboard(result, {
      fontSize: params.fontSize,
      lineHeight: params.lineHeight,
      bgColor: params.bgColor,
    });
    if (ok) showCopiedFeedback("png");
  };

  const handleCopyText = async () => {
    if (!result) return;
    const ok = await copyText(result.text);
    if (ok) showCopiedFeedback("text");
  };

  const handleCopyDiscord = async () => {
    if (!result) return;
    const ok = await copyDiscord(result.text);
    if (ok) showCopiedFeedback("discord");
  };

  const handleCopySocial = async () => {
    if (!result) return;
    const ok = await copySocialSafe(result.text);
    if (ok) showCopiedFeedback("social");
  };

  const handleCopyHtml = async () => {
    if (!result) return;
    const ok = await copyHtmlFormatted(result, params.bgColor);
    if (ok) showCopiedFeedback("html");
  };

  // Drag-and-drop sobre a área de trabalho
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      loadImageFromFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <main
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="flex flex-1 overflow-hidden"
    >
      {/* Vídeo oculto para streaming de webcam */}
      <video ref={videoRef} playsInline muted className="hidden" />

      {/* Input de arquivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            loadImageFromFile(e.target.files[0]);
          }
        }}
      />

      {/* Área Central de Visualização */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-ink">
        {/* Header HUD do Estúdio */}
        <div className="glass absolute top-3 left-4 right-4 z-20 flex items-center justify-between rounded-xl px-4 py-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="mono text-[10px] uppercase tracking-[.18em] text-red font-bold">
              06 / ASCII ART
            </span>
            <span className="h-3 w-px bg-line" />
            <span className="mono text-[11px] text-muted truncate max-w-[160px]">
              {inputSource === "camera"
                ? "Câmera ao vivo (60fps)"
                : inputSource === "text"
                ? `FIGlet (${figletFont})`
                : imageName}
            </span>
            {result && (
              <span className="mono rounded bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted">
                {result.cols} × {result.rows} chars · {result.timeMs}ms
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {inputSource === "image" && image && (
              <button
                onClick={() => setCompareMode((v) => !v)}
                className={`btn-glass px-2.5 py-1 text-[10px] mono uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                  compareMode
                    ? "border-red/60 bg-red/[0.12] text-[var(--text)] font-semibold shadow-[0_0_12px_rgba(208,0,0,0.25)]"
                    : "text-muted"
                }`}
                title="Comparar com a imagem original (ON / OFF)"
              >
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${compareMode ? "bg-red animate-pulse" : "bg-muted/40"}`} />
                Comparar: <b className={compareMode ? "text-red" : "text-muted"}>{compareMode ? "ON" : "OFF"}</b>
              </button>
            )}
            <button
              onClick={() => setShowLoupe((v) => !v)}
              className={`btn-glass px-2.5 py-1 text-[10px] mono uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                showLoupe
                  ? "border-red/60 bg-red/[0.12] text-[var(--text)] font-semibold shadow-[0_0_12px_rgba(208,0,0,0.25)]"
                  : "text-muted"
              }`}
              title="Ativar/Desativar lupa de inspeção dos caracteres (ON / OFF)"
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${showLoupe ? "bg-red animate-pulse" : "bg-muted/40"}`} />
              Lupa: <b className={showLoupe ? "text-red" : "text-muted"}>{showLoupe ? "ON" : "OFF"}</b>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-glass px-2.5 py-1 text-[10px] mono uppercase tracking-wider"
              title="Carregar nova imagem"
            >
              Upload
            </button>
            <button
              onClick={loadSampleImage}
              className="btn-glass px-2.5 py-1 text-[10px] mono uppercase tracking-wider"
              title="Carregar imagem modelo"
            >
              Exemplo
            </button>
            <button
              onClick={handleCopyText}
              disabled={!result}
              className="btn-glass px-2.5 py-1 text-[10px] mono uppercase tracking-wider"
              title="Copiar texto rápido"
            >
              {copiedState === "text" ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>

        {/* Viewport Interativo com Zoom, Pan e Loupe */}
        <AsciiCanvas
          result={result}
          params={params}
          originalImage={inputSource === "image" ? image : null}
          loading={loading}
          zoom={zoom}
          onZoomChange={setZoom}
          showLoupe={showLoupe}
          onToggleLoupe={() => setShowLoupe((v) => !v)}
          compareMode={compareMode}
          onToggleCompare={() => setCompareMode((v) => !v)}
          comparePos={comparePos}
          onComparePosChange={setComparePos}
        />
      </div>

      {/* Painel Lateral de Parâmetros e Exportações */}
      <AsciiControls
        params={params}
        onParamChange={handleParamChange}
        inputSource={inputSource}
        onInputSourceChange={setInputSource}
        figletText={figletText}
        onFigletTextChange={setFigletText}
        figletFont={figletFont}
        onFigletFontChange={setFigletFont}
        figletGradient={figletGradient}
        onFigletGradientChange={setFigletGradient}
        figletGradFrom={figletGradFrom}
        onFigletGradFromChange={setFigletGradFrom}
        figletGradTo={figletGradTo}
        onFigletGradToChange={setFigletGradTo}
        figletGradDir={figletGradDir}
        onFigletGradDirChange={setFigletGradDir}
        showLoupe={showLoupe}
        onShowLoupeChange={setShowLoupe}
        compareMode={compareMode}
        onCompareModeChange={setCompareMode}
        comparePos={comparePos}
        onComparePosChange={setComparePos}
        onAutoThreshold={handleAutoThreshold}
        onResetParams={handleResetParams}
        exportScale={exportScale}
        onExportScaleChange={setExportScale}
        onDownloadPng={handleDownloadPng}
        onDownloadSvg={handleDownloadSvg}
        onDownloadTxt={handleDownloadTxt}
        onDownloadJson={handleDownloadJson}
        onCopyPng={handleCopyPng}
        onCopyText={handleCopyText}
        onCopyDiscord={handleCopyDiscord}
        onCopySocial={handleCopySocial}
        onCopyHtml={handleCopyHtml}
        copiedState={copiedState}
        hasContent={!!result}
      />
    </main>
  );
}
