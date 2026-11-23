"use client";

import type { CatchmentSummary } from "@/lib/types";

interface KpiStripProps {
  summary: CatchmentSummary | null;
  loading: boolean;
}

export default function KpiStrip({ summary, loading }: KpiStripProps) {
  if (!summary) {
    return (
      <div className="absolute right-4 top-4 z-10 flex gap-2.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[74px] w-[122px] animate-pulse rounded-2xl border border-white/10 bg-[#0C121A]/80 backdrop-blur-xl"
          />
        ))}
      </div>
    );
  }

  const cards = [
    { label: "Critical Choke Points", value: String(summary.critical_count), dot: "bg-rose-400", accent: "text-rose-400" },
    { label: "High Risk Spots", value: String(summary.high_count), dot: "bg-orange-400", accent: "text-orange-400" },
    {
      label: "Mean Runoff Risk",
      value: `${Math.round(summary.mean_wsi * 100)}%`,
      delta: summary.mean_wsi_delta,
      dot: "bg-[#C8FF00]",
      accent: "text-[#C8FF00]",
    },
  ];

  return (
    <div className="absolute right-4 top-4 z-10 flex gap-2.5">
      {cards.map((kpi) => (
        <div
          key={kpi.label}
          className={`min-w-[126px] rounded-2xl border border-white/10 bg-[#0C121A]/85 px-4 py-3 backdrop-blur-xl shadow-2xl transition-opacity ${
            loading ? "opacity-70" : "opacity-100"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${kpi.dot}`} />
            <p className="text-[11px] font-medium text-slate-300">{kpi.label}</p>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular-nums">
            <span className={`text-xl font-bold ${kpi.accent}`}>{kpi.value}</span>
            {kpi.delta !== undefined && kpi.delta !== 0 && (
              <span className={`text-xs font-medium ${kpi.delta < 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {kpi.delta > 0 ? `+${Math.round(kpi.delta * 100)}%` : `${Math.round(kpi.delta * 100)}%`}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
