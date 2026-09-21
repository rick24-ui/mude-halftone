"use client";

import {
  AsciiParams,
  CHARSETS,
  COLOR_THEMES,
  AsciiMode,
  DitherType,
  ColorMode,
  InputSourceType,
} from "@/lib/ascii";
import { AVAILABLE_FIGLET_FONTS } from "@/lib/asciiFonts";
import {
  PanelSection as Section,
  SegmentedRow as Segmented,
  SegmentedGrid,
  Toggle,
  ColorField,
  PanelSlider as Slider,
} from "@/components/ui/panel";

interface AsciiControlsProps {
  params: AsciiParams;
  onParamChange: <K extends keyof AsciiParams>(key: K, value: AsciiParams[K]) => void;
  inputSource: InputSourceType;
  onInputSourceChange: (source: InputSourceType) => void;
  figletText: string;
  onFigletTextChange: (text: string) => void;
  figletFont: string;
  onFigletFontChange: (font: string) => void;
  figletGradient: boolean;
  onFigletGradientChange: (v: boolean) => void;
  figletGradFrom: string;
  onFigletGradFromChange: (c: string) => void;
  figletGradTo: string;
  onFigletGradToChange: (c: string) => void;
  figletGradDir: "horizontal" | "vertical" | "diagonal";
  onFigletGradDirChange: (d: "horizontal" | "vertical" | "diagonal") => void;
  showLoupe: boolean;
  onShowLoupeChange: (v: boolean) => void;
  compareMode: boolean;
  onCompareModeChange: (v: boolean) => void;
  comparePos: number;
  onComparePosChange: (v: number) => void;
  onAutoThreshold: () => void;
  onResetParams: () => void;
  exportScale: 1 | 2 | 4;
  onExportScaleChange: (scale: 1 | 2 | 4) => void;
  onDownloadPng: () => void;
  onDownloadSvg: () => void;
  onDownloadTxt: () => void;
  onDownloadJson: () => void;
  onCopyPng: () => void;
  onCopyText: () => void;
  onCopyDiscord: () => void;
  onCopySocial: () => void;
  onCopyHtml: () => void;
  copiedState: string | null;
  hasContent: boolean;
}

export default function AsciiControls({
  params,
  onParamChange,
  inputSource,
  onInputSourceChange,
  figletText,
  onFigletTextChange,
  figletFont,
  onFigletFontChange,
  figletGradient,
  onFigletGradientChange,
  figletGradFrom,
  onFigletGradFromChange,
  figletGradTo,
  onFigletGradToChange,
  figletGradDir,
  onFigletGradDirChange,
  showLoupe,
  onShowLoupeChange,
  compareMode,
  onCompareModeChange,
  comparePos,
  onComparePosChange,
  onAutoThreshold,
  onResetParams,
  exportScale,
  onExportScaleChange,
  onDownloadPng,
  onDownloadSvg,
  onDownloadTxt,
  onDownloadJson,
  onCopyPng,
  onCopyText,
  onCopyDiscord,
  onCopySocial,
  onCopyHtml,
  copiedState,
  hasContent,
}: AsciiControlsProps) {
  const isText = inputSource === "text";
  const isBraille = params.mode === "braille";

  // Aplica tema predefinido
  const applyTheme = (themeKey: string) => {
    const t = COLOR_THEMES[themeKey];
    if (!t) return;
    onParamChange("themePreset", themeKey);
    onParamChange("textColor", t.text);
    onParamChange("bgColor", t.bg);
    onParamChange("gradientColor1", t.grad1);
    onParamChange("gradientColor2", t.grad2);
    onParamChange("glow", t.glow);
    onParamChange("scanlines", t.scanlines);
  };

  return (
    <aside className="glass-sidebar flex w-[320px] shrink-0 flex-col overflow-hidden">
      <div className="thin-scroll flex-1 overflow-y-auto">
        {/* 1. Entrada de Conteúdo */}
        <Section title="Entrada">
          <Segmented
            value={inputSource}
            onChange={(v) => onInputSourceChange(v as InputSourceType)}
            options={[
              { value: "image", label: "Imagem" },
              { value: "camera", label: "Câmera" },
              { value: "text", label: "Texto" },
            ]}
          />
        </Section>

        {/* 2. Controles específicos de Texto FIGlet */}
        {isText ? (
          <Section title="Tipografia FIGlet">
            <div>
              <label className="label mb-1.5 block">Texto do Banner</label>
              <input
                type="text"
                value={figletText}
                onChange={(e) => onFigletTextChange(e.target.value)}
                placeholder="Digite algo…"
                className="w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-xs font-mono text-[var(--text)] outline-none transition-colors focus:border-red/60"
              />
            </div>

            <div>
              <label className="label mb-1.5 block">Fonte FIGlet</label>
              <select
                value={figletFont}
                onChange={(e) => onFigletFontChange(e.target.value)}
                className="w-full rounded-lg border border-line bg-[#161619] px-3 py-2 text-xs font-mono text-[var(--text)] outline-none transition-colors focus:border-red/60"
              >
                {AVAILABLE_FIGLET_FONTS.map((font) => (
                  <option key={font} value={font} className="bg-[#161619] text-white">
                    {font}
                  </option>
                ))}
              </select>
            </div>

            <Toggle
              label="Gradiente de Cores"
              value={figletGradient}
              onChange={onFigletGradientChange}
            />

            {figletGradient && (
              <div className="space-y-2.5 pt-1">
                <ColorField
                  label="Cor Inicial"
                  value={figletGradFrom}
                  onChange={onFigletGradFromChange}
                />
                <ColorField
                  label="Cor Final"
                  value={figletGradTo}
                  onChange={onFigletGradToChange}
                />
                <div>
                  <label className="label mb-1.5 block">Direção</label>
                  <Segmented
                    value={figletGradDir}
                    onChange={(v) => onFigletGradDirChange(v as "horizontal" | "vertical" | "diagonal")}
                    options={[
                      { value: "horizontal", label: "Horizontal" },
                      { value: "vertical", label: "Vertical" },
                      { value: "diagonal", label: "Diagonal" },
                    ]}
                  />
                </div>
              </div>
            )}
          </Section>
        ) : (
          /* Controles de Imagem e Câmera */
          <>
            {/* Modo de Renderização */}
            <Section title="Modo de Arte">
              <Segmented
                value={params.mode}
                onChange={(v) => onParamChange("mode", v as AsciiMode)}
                options={[
                  { value: "ascii", label: "ASCII Art" },
                  { value: "braille", label: "Braille HD" },
                ]}
              />

              {!isBraille ? (
                /* Seleção de Charset para ASCII */
                <div className="pt-2">
                  <label className="label mb-1.5 block">Conjunto de Caracteres</label>
                  <SegmentedGrid
                    value={
                      Object.entries(CHARSETS).find(
                        ([, val]) => val.chars === params.charset
                      )?.[0] || "custom"
                    }
                    onChange={(k) => {
                      if (CHARSETS[k]) onParamChange("charset", CHARSETS[k].chars);
                    }}
                    options={Object.entries(CHARSETS).map(([key, val]) => ({
                      value: key,
                      label: val.label,
                    }))}
                    columns={3}
                  />

                  <div className="mt-2">
                    <input
                      type="text"
                      value={params.charset}
                      onChange={(e) => onParamChange("charset", e.target.value)}
                      className="w-full rounded border border-line bg-white/[0.03] px-2.5 py-1 text-[11px] font-mono text-muted tracking-widest focus:border-red/60"
                      title="Sequência de densidade dos caracteres (do mais escuro para o mais claro)"
                    />
                  </div>
                </div>
              ) : (
                /* Controles específicos de Braille */
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="label mb-1.5 block">Algoritmo de Dithering</label>
                    <SegmentedGrid
                      value={params.dither}
                      onChange={(v) => onParamChange("dither", v as DitherType)}
                      options={[
                        { value: "none", label: "Limiar Fixo" },
                        { value: "atkinson", label: "Atkinson" },
                        { value: "fs", label: "Floyd-St." },
                        { value: "ordered", label: "Bayer 4x4" },
                      ]}
                      columns={2}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Slider
                        label="Limiar (Threshold)"
                        value={params.threshold}
                        min={10}
                        max={245}
                        step={1}
                        onChange={(v) => onParamChange("threshold", Math.round(v))}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={onAutoThreshold}
                      className="btn-glass mt-3 shrink-0 px-2.5 py-1 text-[10px] mono uppercase tracking-wider text-red hover:border-red/40"
                      title="Calcula o limiar ideal automaticamente usando o método de Otsu"
                    >
                      Auto
                    </button>
                  </div>

                  <Toggle
                    label="Preencher vazios (anti-collapse)"
                    value={params.fillBlanks}
                    onChange={(v) => onParamChange("fillBlanks", v)}
                  />
                </div>
              )}
            </Section>

            {/* Bordas Sobel (somente modo ASCII) */}
            {!isBraille && (
              <Section title="Contornos & Bordas">
                <Toggle
                  label="Detecção de Bordas Sobel"
                  value={params.edgeDetection}
                  onChange={(v) => onParamChange("edgeDetection", v)}
                />
                {params.edgeDetection && (
                  <Slider
                    label="Força dos Traços Direcionais"
                    value={params.edgeStrength}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    onChange={(v) => onParamChange("edgeStrength", Math.round(v))}
                  />
                )}
              </Section>
            )}

            {/* Resolução & Proporções */}
            <Section title="Resolução & Grid">
              <Slider
                label="Colunas de Caracteres"
                value={params.width}
                min={30}
                max={220}
                step={2}
                unit=" col"
                onChange={(v) => onParamChange("width", Math.round(v))}
              />
              <Slider
                label="Tamanho da Fonte"
                value={params.fontSize}
                min={5}
                max={20}
                step={0.5}
                unit="px"
                onChange={(v) => onParamChange("fontSize", v)}
              />
              <Slider
                label="Proporção Altura/Largura"
                value={params.aspectRatioCorrection * 100}
                min={30}
                max={70}
                step={1}
                unit="%"
                onChange={(v) => onParamChange("aspectRatioCorrection", v / 100)}
              />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Slider
                  label="Escala X"
                  value={params.scaleX}
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  unit="×"
                  onChange={(v) => onParamChange("scaleX", +v.toFixed(2))}
                />
                <Slider
                  label="Escala Y"
                  value={params.scaleY}
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  unit="×"
                  onChange={(v) => onParamChange("scaleY", +v.toFixed(2))}
                />
              </div>
            </Section>

            {/* Ajustes de Imagem / Fotometria */}
            <Section title="Fotometria">
              <Slider
                label="Brilho"
                value={params.brightness}
                min={-100}
                max={100}
                step={2}
                onChange={(v) => onParamChange("brightness", Math.round(v))}
              />
              <Slider
                label="Contraste"
                value={params.contrast}
                min={0.2}
                max={2.8}
                step={0.05}
                unit="×"
                onChange={(v) => onParamChange("contrast", +v.toFixed(2))}
              />
              <Slider
                label="Gama"
                value={params.gamma}
                min={0.5}
                max={2.2}
                step={0.05}
                onChange={(v) => onParamChange("gamma", +v.toFixed(2))}
              />
              <Toggle
                label="Inverter Luminância"
                value={params.invert}
                onChange={(v) => onParamChange("invert", v)}
              />
            </Section>
          </>
        )}

        {/* 3. Cores e Temas de Estilo */}
        <Section title="Cores & Temas">
          <div>
            <label className="label mb-1.5 block">Temas Visuais</label>
            <SegmentedGrid
              value={params.themePreset}
              onChange={applyTheme}
              options={Object.entries(COLOR_THEMES).map(([k, t]) => ({
                value: k,
                label: t.label,
              }))}
              columns={2}
            />
          </div>

          <div className="pt-2">
            <label className="label mb-1.5 block">Modo de Coloração</label>
            <Segmented
              value={params.colorMode}
              onChange={(v) => onParamChange("colorMode", v as ColorMode)}
              options={[
                { value: "mono", label: "Mono" },
                { value: "rgb", label: "RGB Real" },
                { value: "gradient", label: "Gradiente" },
              ]}
            />
          </div>

          {params.colorMode === "mono" && (
            <div className="space-y-2 pt-1">
              <ColorField
                label="Cor do Texto"
                value={params.textColor}
                onChange={(v) => onParamChange("textColor", v)}
              />
              <ColorField
                label="Cor de Fundo"
                value={params.bgColor}
                onChange={(v) => onParamChange("bgColor", v)}
              />
            </div>
          )}

          {params.colorMode === "gradient" && (
            <div className="space-y-2 pt-1">
              <ColorField
                label="Gradiente (Sombra)"
                value={params.gradientColor1}
                onChange={(v) => onParamChange("gradientColor1", v)}
              />
              <ColorField
                label="Gradiente (Luz)"
                value={params.gradientColor2}
                onChange={(v) => onParamChange("gradientColor2", v)}
              />
              <ColorField
                label="Cor de Fundo"
                value={params.bgColor}
                onChange={(v) => onParamChange("bgColor", v)}
              />
            </div>
          )}
        </Section>

        {/* 4. Efeitos Especiais de Visualização */}
        <Section title="Efeitos do Viewport">
          <Toggle
            label="Lupa de Inspeção (Loupe)"
            value={showLoupe}
            onChange={onShowLoupeChange}
          />
          <Toggle
            label="Linhas CRT (Scanlines)"
            value={params.scanlines}
            onChange={(v) => onParamChange("scanlines", v)}
          />
          <Toggle
            label="Brilho Terminal (Phosphor Glow)"
            value={params.glow}
            onChange={(v) => onParamChange("glow", v)}
          />
          <Toggle
            label="Divisor de Comparação"
            value={compareMode}
            onChange={onCompareModeChange}
          />
          {compareMode && (
            <Slider
              label="Posição do Divisor"
              value={comparePos}
              min={5}
              max={95}
              step={1}
              unit="%"
              onChange={onComparePosChange}
            />
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={onResetParams}
              className="btn-glass w-full py-1.5 text-[10px] mono uppercase tracking-widest text-muted hover:text-[var(--text)]"
            >
              Resetar Padrões
            </button>
          </div>
        </Section>
      </div>

      {/* 5. Painel Fixo Inferior de Exportação */}
      <div className="border-t border-line bg-white/[0.02] px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="label text-[var(--text)]">Exportar</h3>
          <div className="flex gap-1">
            {([1, 2, 4] as const).map((s) => (
              <button
                key={s}
                onClick={() => onExportScaleChange(s)}
                className={`rounded-full px-2 py-0.5 text-[10px] mono ${
                  exportScale === s ? "seg-active" : "seg-idle bg-white/[0.04]"
                }`}
                title={`Multiplicador de resolução ${s}x`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* Downloads */}
        <div className="grid grid-cols-4 gap-1.5 mb-2">
          <button
            onClick={onDownloadPng}
            disabled={!hasContent}
            className="btn-glass py-2 text-[11px] font-medium"
            title="Download imagem PNG em alta resolução"
          >
            PNG
          </button>
          <button
            onClick={onDownloadSvg}
            disabled={!hasContent}
            className="btn-glass py-2 text-[11px] font-medium"
            title="Download arquivo SVG vetorial"
          >
            SVG
          </button>
          <button
            onClick={onDownloadTxt}
            disabled={!hasContent}
            className="btn-glass py-2 text-[11px] font-medium"
            title="Download arquivo texto puro .txt"
          >
            TXT
          </button>
          <button
            onClick={onDownloadJson}
            disabled={!hasContent}
            className="btn-glass py-2 text-[11px] font-medium"
            title="Download matriz estruturada JSON"
          >
            JSON
          </button>
        </div>

        {/* Cópias rápidas para Clipboard */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={onCopyText}
            disabled={!hasContent}
            className="btn-glass py-1.5 text-[10px] mono uppercase tracking-wider"
            title="Copiar texto puro"
          >
            {copiedState === "text" ? "Copiado!" : "Txt"}
          </button>
          <button
            onClick={onCopyDiscord}
            disabled={!hasContent}
            className="btn-glass py-1.5 text-[10px] mono uppercase tracking-wider"
            title="Copiar formatado para Discord (```)"
          >
            {copiedState === "discord" ? "Copiado!" : "Discord"}
          </button>
          <button
            onClick={onCopySocial}
            disabled={!hasContent}
            className="btn-glass py-1.5 text-[10px] mono uppercase tracking-wider"
            title="Copiar caracteres full-width para Twitch e YouTube"
          >
            {copiedState === "social" ? "Copiado!" : "Social"}
          </button>
        </div>

        {/* Copiar Imagem PNG direta */}
        <button
          onClick={onCopyPng}
          disabled={!hasContent}
          className="btn-primary mt-2 w-full py-2 text-xs font-semibold disabled:opacity-40"
        >
          {copiedState === "png" ? "Imagem Copiada!" : "Copiar Imagem PNG"}
        </button>
      </div>
    </aside>
  );
}
