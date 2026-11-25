"use client";

import type { CatchmentSummary } from "@/lib/types";

interface KpiStripProps {
  summary: CatchmentSummary | null;
  loading: boolean;
}

export default function KpiStrip({ summary, loading }: KpiStripProps) {
  if (!summary) {
    return (
      <div className="absolute left-4 top-16 z-10 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[64px] w-[142px] animate-pulse rounded-md border border-[#263445] bg-[#151D29]"
          />
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Critical Choke Points",
      value: String(summary.critical_count),
      sub: "Immediate field triage",
      dot: "bg-[#F87171]",
      accent: "text-[#F87171]",
    },
    {
      label: "High Risk Zones",
      value: String(summary.high_count),
      sub: "Elevated runoff pooling",
      dot: "bg-[#FBBF24]",
      accent: "text-[#FBBF24]",
    },
    {
      label: "Mean Runoff Risk",
      value: `${Math.round(summary.mean_wsi * 100)}%`,
      sub: `${summary.rainfall_mm_hr} mm/hr scenario`,
      delta: summary.mean_wsi_delta,
      dot: "bg-[#22C5E5]",
      accent: "text-[#E5E7EB]",
    },
  ];

  return (
    <div className="absolute left-4 top-16 z-10 flex flex-wrap gap-2">
      {cards.map((kpi) => (
        <div
          key={kpi.label}
          className={`min-w-[144px] rounded-md border border-[#263445] bg-[#151D29]/95 px-3 py-2 shadow-md transition-opacity ${
            loading ? "opacity-70" : "opacity-100"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${kpi.dot}`} />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">{kpi.label}</p>
          </div>
          <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
            <span className={`text-lg font-bold ${kpi.accent}`}>{kpi.value}</span>
            {kpi.delta !== undefined && kpi.delta !== 0 && (
              <span className={`text-[11px] font-semibold ${kpi.delta < 0 ? "text-emerald-400" : "text-[#F87171]"}`}>
                {kpi.delta > 0 ? `+${Math.round(kpi.delta * 100)}%` : `${Math.round(kpi.delta * 100)}%`}
              </span>
            )}
          </div>
          <p className="text-[10px] text-[#64748B]">{kpi.sub}</p>
        </div>
      ))}
    </div>
  );
}
