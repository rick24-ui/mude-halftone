// Tipos centrais do motor de pontilhismo MUDE.

export type DotShape = "circle" | "square" | "diamond" | "triangle" | "hexagon" | "ring" | "cross";

export type GridMode = "square" | "hex" | "concentric";

export type ConnectionMode = "none" | "cell" | "links";

export type ColorMode = "solid" | "duotone" | "sample";

export type BackgroundMode = "transparent" | "solid";

export type AnimType = "none" | "pulse" | "wave" | "drift" | "orbit" | "shimmer";

export interface PointillismParams {
  // --- Grid / distribuição ---
  grid: GridMode;
  spacing: number;        // distância entre pontos (px) 3–40
  jitter: number;         // aleatoriedade da posição 0–1
  hexOffset: boolean;     // linhas alternadas (favo)

  // --- Amostragem da fonte ---
  brightness: number;     // -100..100
  contrast: number;       // -100..100
  gamma: number;          // 0.2..3
  invert: boolean;
  thresholdLow: number;   // 0..255 (abaixo: vira fundo limpo)
  thresholdHigh: number;  // 0..255 (acima: vira fundo limpo)

  // --- Tamanho do ponto ---
  shape: DotShape;
  minSize: number;        // raio mínimo px
  maxSize: number;        // raio máximo px
  sizeScale: number;      // multiplicador global 0.2..2.5
  rotation: number;       // rotação das formas (graus)

  // --- Movimento / fluxo ---
  flow: number;           // intensidade do deslocamento 0..40 (px)
  flowScale: number;      // escala do campo de ruído 0.5..12
  flowAngle: number;      // direção base (graus)
  wave: number;           // ondulação 0..1

  // --- Conexões / elasticidade (células) ---
  connection: ConnectionMode;
  elasticity: number;     // 0..30 — força do "grude"/blur das células
  connectDistance: number;// distância máx p/ links (x spacing) 0..3
  linkWidth: number;      // espessura dos links px

  // --- Cores ---
  colorMode: ColorMode;
  color1: string;         // cor principal (áreas escuras)
  color2: string;         // cor secundária (duotone)
  background: BackgroundMode;
  bgColor: string;
  opacity: number;        // 0..1 opacidade dos pontos

  // --- Animação (movimento ao vivo) ---
  animType: AnimType;
  animAmount: number;     // intensidade 0..1
  animSpeed: number;      // ciclos por loop (1..6) — define velocidade e loop perfeito
}

export interface Dot {
  x: number;
  y: number;
  r: number;
  /** escuridão normalizada 0..1 usada para mapear tamanho/cor */
  v: number;
  color: string;
}

export interface Preset {
  id: string;
  name: string;
  params: Partial<PointillismParams>;
}

export const RED = "#E8143C";
export const INK = "#0D0D0D";
export const PAPER = "#F4F1EA";

export const DEFAULT_PARAMS: PointillismParams = {
  grid: "square",
  spacing: 12,
  jitter: 0,
  hexOffset: false,

  brightness: 0,
  contrast: 0,
  gamma: 1,
  invert: false,
  thresholdLow: 0,
  thresholdHigh: 245,

  shape: "circle",
  minSize: 0,
  maxSize: 6,
  sizeScale: 1,
  rotation: 0,

  flow: 0,
  flowScale: 4,
  flowAngle: 0,
  wave: 0,

  connection: "none",
  elasticity: 12,
  connectDistance: 1.4,
  linkWidth: 2,

  colorMode: "solid",
  color1: RED,
  color2: INK,
  background: "transparent",
  bgColor: INK,
  opacity: 1,

  animType: "none",
  animAmount: 0.65,
  animSpeed: 2,
};

export const PRESETS: Preset[] = [
  {
    id: "classico",
    name: "MUDE Clássico",
    params: {
      grid: "square", spacing: 14, jitter: 0, shape: "circle",
      minSize: 0, maxSize: 7, sizeScale: 1, flow: 0,
      connection: "none", colorMode: "solid", color1: INK,
      background: "transparent", thresholdHigh: 245,
    },
  },
  {
    id: "esportivo",
    name: "MUDE Esportivo",
    params: {
      grid: "hex", hexOffset: true, spacing: 9, jitter: 0.05, shape: "circle",
      minSize: 0, maxSize: 5, sizeScale: 1.05, flow: 0,
      connection: "none", colorMode: "solid", color1: RED,
      background: "solid", bgColor: INK, thresholdHigh: 250,
    },
  },
  {
    id: "editorial",
    name: "MUDE Editorial",
    params: {
      grid: "square", spacing: 20, jitter: 0.12, shape: "circle",
      minSize: 0.4, maxSize: 11, sizeScale: 1, flow: 4, flowScale: 5,
      connection: "none", colorMode: "solid", color1: INK,
      background: "transparent", thresholdHigh: 240,
    },
  },
  {
    id: "celula",
    name: "Células",
    params: {
      grid: "hex", hexOffset: true, spacing: 11, jitter: 0.2, shape: "circle",
      minSize: 1, maxSize: 7, sizeScale: 1.1, flow: 6, flowScale: 4,
      connection: "cell", elasticity: 14, colorMode: "duotone",
      color1: RED, color2: "#7A0A1F", background: "solid", bgColor: INK,
    },
  },
  {
    id: "rede",
    name: "Rede / Links",
    params: {
      grid: "square", spacing: 16, jitter: 0.25, shape: "circle",
      minSize: 0.5, maxSize: 4, sizeScale: 1, flow: 3,
      connection: "links", connectDistance: 1.5, linkWidth: 1.4,
      colorMode: "solid", color1: RED, background: "solid", bgColor: INK,
    },
  },
  {
    id: "fluxo",
    name: "Fluxo / Movimento",
    params: {
      grid: "square", spacing: 8, jitter: 0.1, shape: "circle",
      minSize: 0, maxSize: 5, sizeScale: 1, flow: 16, flowScale: 3, wave: 0.4,
      connection: "none", colorMode: "duotone", color1: RED, color2: PAPER,
      background: "solid", bgColor: INK,
      animType: "drift", animAmount: 0.6, animSpeed: 2,
    },
  },
];
