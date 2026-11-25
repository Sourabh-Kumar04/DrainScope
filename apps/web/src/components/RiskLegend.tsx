"use client";

const ITEMS = [
  { label: "Critical (>80 cm)", color: "bg-[#F87171]" },
  { label: "High (30–80 cm)", color: "bg-[#2563EB]" },
  { label: "Moderate (10–30 cm)", color: "bg-[#22C5E5]" },
  { label: "Trunk Drains", color: "bg-[#38BDF8]" },
];

export default function RiskLegend() {
  return (
    <div className="pointer-events-none absolute bottom-4 right-14 z-10 hidden items-center gap-3 rounded-md border border-[#263445] bg-[#151D29]/95 px-3 py-1.5 shadow-md xl:flex">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
        Legend
      </span>
      <span className="h-3 w-px bg-[#263445]" />
      {ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-[11px]">
          <span className={`h-2 w-2 rounded-full ${item.color}`} />
          <span className="text-[#CBD5E1]">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
