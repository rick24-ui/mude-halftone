export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
      <p className="label mb-3">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="label">{label}</span>
      <button onClick={() => onChange(!value)} className={`relative h-5 w-9 rounded-full transition-colors ${value ? "bg-red" : "bg-[var(--line)]"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "left-4" : "left-0.5"}`} />
      </button>
    </div>
  );
}
