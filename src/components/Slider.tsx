"use client";

import { PanelSlider } from "@/components/ui/panel";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

// Thin forward to the shared kit — kept as a separate import path so
// Pontilhismo/Texto don't need to change their imports, but the actual
// rendering (and look) is the exact same component every studio uses.
export default function Slider(props: SliderProps) {
  return <PanelSlider {...props} />;
}
