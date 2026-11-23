"use client";

const ITEMS = [
  { label: "Critical", color: "bg-rose-400" },
  { label: "High", color: "bg-orange-400" },
  { label: "Pooling", color: "bg-cyan-600" },
  { label: "OSM Trunk Drains", color: "bg-cyan-300" },
];

export default function RiskLegend() {
  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3.5 rounded-2xl border border-white/10 bg-[#0C121A]/85 px-4 py-2.5 backdrop-blur-xl shadow-2xl">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
        30m Screening (&plusmn;30m)
      </span>
      <span className="h-3 w-px bg-white/15" />
      {ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs">
          <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
          <span className="font-medium text-slate-200">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
