"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import Slider from "@/components/Slider";
import { PanelSection as Section } from "@/components/ui/panel";
import { renderTextToSource, TextAlign } from "@/lib/textRender";

interface FontDef {
  id: string;
  label: string;
  family: string; // família CSS real
  weights: number[];
  def: number;
}

const FONTS: FontDef[] = [
  { id: "barlow", label: "Barlow Condensed", family: '"Barlow Condensed"', weights: [400, 600, 700, 900], def: 900 },
  { id: "oswald", label: "Oswald", family: '"Oswald"', weights: [400, 600, 700], def: 700 },
  { id: "anton", label: "Anton", family: '"Anton"', weights: [400], def: 400 },
  { id: "bebas", label: "Bebas Neue", family: '"Bebas Neue"', weights: [400], def: 400 },
  { id: "archivo", label: "Archivo Black", family: '"Archivo Black"', weights: [400], def: 400 },
  { id: "system", label: "Sistema", family: "system-ui", weights: [400, 700, 900], def: 900 },
];

const WEIGHT_LABEL: Record<number, string> = { 400: "Regular", 600: "SemiBold", 700: "Bold", 900: "Black" };

export default function TextControls() {
  const setSource = useStore((s) => s.setSource);
  const [text, setText] = useState("SAMPLE\nTEXT");
  const [fontId, setFontId] = useState("barlow");
  const [weight, setWeight] = useState(900);
  const [fontSize, setFontSize] = useState(260);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [lineHeight, setLineHeight] = useState(0.92);
  const [align, setAlign] = useState<TextAlign>("center");
  const [uppercase, setUppercase] = useState(true);
  const token = useRef(0);

  const font = FONTS.find((f) => f.id === fontId)!;

  // re-renderiza o texto → source (com debounce)
  useEffect(() => {
    const id = ++token.current;
    const handle = setTimeout(async () => {
      const source = await renderTextToSource({
        text,
        fontFamily: font.family,
        weight,
        fontSize,
        letterSpacing,
        lineHeight,
        align,
        uppercase,
      });
      if (id === token.current) setSource(source, `text-${text.replace(/\s+/g, "_").slice(0, 24) || "rc"}`);
    }, 120);
    return () => clearTimeout(handle);
  }, [text, font, weight, fontSize, letterSpacing, lineHeight, align, uppercase, setSource]);

  return (
    <>
      <Section title="Texto">
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Digite aqui…"
            className="w-full resize-none rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-red/40"
          />
          <p className="label mt-1">Enter = nova linha</p>
        </div>
      </Section>

      <Section title="Fonte">
        <div className="grid grid-cols-2 gap-1.5">
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setFontId(f.id);
                if (!f.weights.includes(weight)) setWeight(f.def);
              }}
              style={{ fontFamily: f.family }}
              className={`truncate rounded-lg px-2 py-2 text-[15px] leading-none transition-all ${
                fontId === f.id ? "opt-active" : "opt-idle"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {font.weights.length > 1 && (
          <div>
            <span className="label">Peso</span>
            <div className="mt-1 flex flex-wrap gap-1 rounded-full border border-line bg-white/[0.03] p-1">
              {font.weights.map((w) => (
                <button
                  key={w}
                  onClick={() => setWeight(w)}
                  className={`flex-1 rounded-full px-2 py-1.5 text-[11px] transition-all ${
                    weight === w ? "seg-active" : "seg-idle"
                  }`}
                >
                  {WEIGHT_LABEL[w] ?? w}
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Layout" className="border-b-0">
        <Slider label="Tamanho" value={fontSize} min={60} max={600} step={2} unit="px" onChange={setFontSize} />
        <Slider label="Espaçamento" value={letterSpacing} min={-20} max={60} step={1} unit="px" onChange={setLetterSpacing} />
        <Slider label="Entrelinha" value={lineHeight} min={0.7} max={2} step={0.01} onChange={setLineHeight} />

        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1 rounded-full border border-line bg-white/[0.03] p-1">
            {(["left", "center", "right"] as TextAlign[]).map((a) => (
              <button
                key={a}
                onClick={() => setAlign(a)}
                className={`flex-1 rounded-full px-2 py-1.5 text-[11px] transition-all ${
                  align === a ? "seg-active" : "seg-idle"
                }`}
              >
                {a === "left" ? "Esq." : a === "center" ? "Centro" : "Dir."}
              </button>
            ))}
          </div>
          <button
            onClick={() => setUppercase((u) => !u)}
            className={`btn-glass px-3 py-2 text-[11px] ${uppercase ? "is-active" : ""}`}
          >
            MAIÚS
          </button>
        </div>
      </Section>
    </>
  );
}
