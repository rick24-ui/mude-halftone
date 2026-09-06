"use client";

import type { ReactNode } from "react";

// ─── Shared design-system primitives ───────────────────────────────────────
// Used by ControlsPanel (Pontilhismo/Texto), TrackerStudio and ParticleStudio
// so every functionality's config sidebar looks and behaves the same way.

/** Section header — mono uppercase label with a red bullet, used to open a
 * group of controls inside any sidebar. */
export function PanelSection({
  title,
  children,
  className = "",
  headerRight,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
}) {
  return (
    <section className={`border-b border-line px-4 py-4 last:border-b-0 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="mono flex items-center gap-2 text-[10px] uppercase tracking-[.18em] text-muted">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red shadow-[0_0_6px_rgba(208,0,0,0.7)]" />
          {title}
        </h3>
        {headerRight}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** On/off switch, red when active. */
export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="label">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          value ? "border-red/30 bg-red/[0.08]" : "border-line bg-white/[0.03]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--text)] transition-all ${
            value ? "left-4 shadow-[0_0_6px_rgba(208,0,0,0.6)]" : "left-0.5 opacity-70"
          }`}
        />
      </button>
    </div>
  );
}

/** Single-row segmented control — bordered container, red fill on the active
 * option. Best for 2–4 short labels (easing, shape, color mode, format…). */
export function SegmentedRow<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-full border border-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 py-1.5 text-[10px] mono uppercase tracking-wide transition-all ${
            value === o.value ? "seg-active font-semibold" : "seg-idle"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Grid of individually-bordered option buttons — for longer labels or option
 * sets too wide to fit a single row (marker styles, filters, presets…). */
export function SegmentedGrid<T extends string>({
  value,
  options,
  onChange,
  columns = 2,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  columns?: 2 | 3 | 5;
}) {
  const colClass = columns === 3 ? "grid-cols-3" : columns === 5 ? "grid-cols-5" : "grid-cols-2";
  return (
    <div className={`grid gap-1.5 ${colClass}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`truncate rounded-lg px-2 py-1.5 text-[11px] transition-all ${
            value === o.value ? "opt-active" : "opt-idle"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Labeled color swatch + native color input. */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <span className="mono text-[10px] uppercase text-muted">{value}</span>
        <label className="h-6 w-6 cursor-pointer rounded border border-line" style={{ background: value }}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}

/** Labeled range slider with a live value readout — same visuals everywhere
 * via the global `.rng` styles in globals.css. */
export function PanelSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  fmt,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  fmt?: (v: number) => string | number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block select-none">
      <div className="mb-1 flex items-center justify-between">
        <span className="label">{label}</span>
        <span className="mono text-[11px] text-red">
          {fmt ? fmt(value) : Number.isInteger(step) ? value : value.toFixed(step < 0.1 ? 2 : 1)}
          {!fmt && unit}
        </span>
      </div>
      <input
        className="rng w-full"
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

/** 2-column preset button grid — reused for style/preset pickers. */
export function PresetGrid<T extends { name: string; desc?: string }>({
  items,
  isActive,
  onSelect,
}: {
  items: T[];
  isActive?: (item: T) => boolean;
  onSelect: (item: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(item)}
          className={`rounded-lg px-2 py-2 text-left text-[11px] transition-all ${
            isActive?.(item) ? "opt-active" : "opt-idle"
          }`}
        >
          {item.name}
          {item.desc && <span className="mono mt-0.5 block text-[9px] text-muted">{item.desc}</span>}
        </button>
      ))}
    </div>
  );
}
