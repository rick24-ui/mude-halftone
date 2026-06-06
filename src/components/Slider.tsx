"use client";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

export default function Slider({ label, value, min, max, step = 1, unit = "", onChange }: SliderProps) {
  return (
    <label className="block select-none">
      <div className="mb-1 flex items-center justify-between">
        <span className="label">{label}</span>
        <span className="mono text-[11px] text-[var(--text)]">
          {Number.isInteger(step) ? value : value.toFixed(step < 0.1 ? 2 : 1)}
          {unit}
        </span>
      </div>
      <input
        className="rng"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}
