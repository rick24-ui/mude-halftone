import { Dot, PointillismParams } from "./types";

// Fase por ponto, estável e derivada da posição (para cintilação/órbita).
function dotPhase(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * Math.PI * 2;
}

const TAU = Math.PI * 2;

/**
 * Aplica movimento aos pontos em função de `phase` (0..1, um loop completo).
 * Usa apenas funções periódicas em `phase` → loop perfeito para GIF/MP4.
 * Não muta os dots originais.
 */
export function applyAnimation(dots: Dot[], p: PointillismParams, phase: number): Dot[] {
  if (p.animType === "none" || p.animAmount <= 0) return dots;

  const cycles = Math.max(1, Math.round(p.animSpeed));
  const wt = TAU * cycles * phase; // ângulo temporal
  const amt = p.animAmount;
  const sp = p.spacing;

  return dots.map((d) => {
    let { x, y, r } = d;
    const ph = dotPhase(d.x, d.y);

    switch (p.animType) {
      case "pulse": {
        // "respiração": tamanho pulsa em onda que percorre a imagem
        const wave = Math.sin(wt + (d.x + d.y) * 0.03);
        r = r * (1 - amt * 0.5 + amt * 0.5 * wave);
        break;
      }
      case "wave": {
        // onda viajante deslocando na vertical
        const a = amt * sp * 3.2;
        y += Math.sin(wt + d.x * 0.025) * a;
        x += Math.cos(wt + d.y * 0.02) * a * 0.4;
        break;
      }
      case "drift": {
        // deriva orgânica seguindo um campo, oscilando
        const ang = ph + Math.sin(d.x * 0.01 + d.y * 0.01) * 2;
        const a = amt * sp * 2.6 * Math.sin(wt + ph);
        x += Math.cos(ang) * a;
        y += Math.sin(ang) * a;
        break;
      }
      case "orbit": {
        // cada ponto descreve um pequeno círculo
        const a = amt * sp * 1.7;
        x += Math.cos(wt + ph) * a;
        y += Math.sin(wt + ph) * a;
        break;
      }
      case "shimmer": {
        // cintilação: tamanho oscila com fase própria de cada ponto
        r = r * (1 - amt * 0.6 + amt * 0.6 * Math.sin(wt + ph));
        break;
      }
    }

    return r === d.r && x === d.x && y === d.y ? d : { ...d, x, y, r: Math.max(0, r) };
  });
}
