"use client";

import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Droplets,
  Eye,
  Route,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import type { ZoneProperties } from "@/lib/types";

interface HexInspectorProps {
  zone: ZoneProperties;
  zoneOnlyFix: boolean;
  onToggleZoneOnlyFix: () => void;
  onOpenStreetView: () => void;
  onOpen3DSandbox: () => void;
  onClose: () => void;
}

const TIER_BADGE: Record<ZoneProperties["risk_tier"], string> = {
  Critical: "border-rose-400/50 bg-rose-500/20 text-rose-300",
  High: "border-orange-400/50 bg-orange-500/20 text-orange-300",
  Moderate: "border-cyan-400/50 bg-cyan-500/20 text-cyan-200",
  Low: "border-emerald-400/50 bg-emerald-500/20 text-emerald-300",
};

const DRIVER_BAR_COLOR: Record<string, string> = {
  concrete: "bg-rose-400",
  pooling: "bg-cyan-400",
  drain_gap: "bg-orange-400",
  trap: "bg-[#C8FF00]",
};

export default function HexInspector({
  zone,
  zoneOnlyFix,
  onToggleZoneOnlyFix,
  onOpenStreetView,
  onOpen3DSandbox,
  onClose,
}: HexInspectorProps) {
  return (
    <div className="absolute bottom-5 right-4 top-[100px] z-10 flex w-[376px] flex-col justify-between overflow-y-auto rounded-2xl border border-white/10 bg-[#0C121A]/94 p-4 backdrop-blur-xl shadow-2xl">
      <div className="space-y-3">
        {/* Header + Street View Quick Action */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Local Area X-Ray · 30m DEM (&plusmn;30m)
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <h2 className="font-mono text-base font-bold text-white">{zone.zone_id}</h2>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TIER_BADGE[zone.risk_tier]}`}>
                {zone.risk_tier}
              </span>
              <span className="font-mono text-[11px] text-slate-400">{zone.area_ha} ha</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenStreetView}
              className="flex items-center gap-1.5 rounded-full bg-cyan-400/20 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 ring-1 ring-cyan-400/40 transition hover:bg-cyan-400/30"
            >
              <Eye className="h-3.5 w-3.5" />
              Street View
            </button>
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 1. Zone-Scale Rational Method Screening (<=50 ha cap) */}
        <div className="rounded-xl border border-rose-400/25 bg-rose-500/[0.07] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-300">
            <Droplets className="h-3.5 w-3.5" />
            <span>Zone-Scale Rational Screening (1-hr)</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono tabular-nums">
            <div>
              <p className="font-sans text-[10px] text-slate-400">Screening Depth</p>
              <p className="text-sm font-bold text-white">~{zone.est_ponding_cm} cm</p>
            </div>
            <div>
              <p className="font-sans text-[10px] text-slate-400">Runoff Vol.</p>
              <p className="text-sm font-bold text-white">{zone.runoff_volume_kl} KL</p>
            </div>
            <div>
              <p className="font-sans text-[10px] text-slate-400">Peak Flow</p>
              <p className="text-sm font-bold text-white">
                {zone.rational_method_valid && zone.peak_flow_lps !== null ? `${zone.peak_flow_lps} L/s` : "N/A"}
              </p>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">{zone.rational_scope_note}</p>
        </div>

        {/* 2. Susceptibility Drivers */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs font-bold text-white">{zone.diagnosis_headline}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{zone.diagnosis_summary}</p>
          <div className="mt-2.5 space-y-1.5">
            {zone.drivers.map((d) => (
              <div key={d.key}>
                <div className="mb-0.5 flex justify-between text-[10px]">
                  <span className="font-medium text-slate-300">{d.label}</span>
                  <span className="font-mono text-slate-400">{d.pct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${DRIVER_BAR_COLOR[d.key] || "bg-cyan-400"}`}
                    style={{ width: `${Math.min(100, d.pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Nearest Mapped Trunk Drain (OSM) + Completeness Caveat */}
        <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
              <Route className="h-3.5 w-3.5" />
              Nearest Mapped Trunk Drain (OSM)
            </span>
            <span className="font-mono text-[11px] font-bold text-cyan-200">{zone.nearest_drain_m} m</span>
          </div>
          <p className="mt-1 font-semibold text-white">{zone.nearest_drain_name}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Concrete Cover: <span className="font-mono text-slate-200">{zone.impervious_pct}%</span> · DEM Dip:{" "}
            <span className="font-mono text-slate-200">{zone.sink_max_m.toFixed(2)} m</span>
          </p>
          <p className="mt-1.5 text-[10px] italic text-slate-400">
            Caveat: OSM primarily maps trunk drains/nallahs; roadside and colony storm drains are often unmapped.
          </p>

          {(zone.underpass_trap || zone.nearby_underpasses.length > 0) && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-[11px] text-rose-200 ring-1 ring-rose-400/30">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
              <span>
                {zone.nearby_underpasses.length > 0
                  ? `${zone.nearby_underpasses.length} road underpass dip(s) within 450m (nearest ${zone.nearby_underpasses[0].dist_m}m)`
                  : "OSM layer=-1 road underpass dip detected inside zone"}
              </span>
            </div>
          )}
        </div>

        {/* 4. Nearby NbS Park Relief Capacity */}
        <div className="flex items-start gap-2.5 rounded-xl border border-[#C8FF00]/30 bg-[#C8FF00]/[0.08] px-3 py-2.5 text-xs">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#C8FF00]" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#C8FF00]">
                NbS Park Relief
              </p>
              {zone.park_capacity_kl > 0 && (
                <span className="font-mono text-[10px] font-bold text-[#DFFF66]">
                  ~{zone.park_offset_pct}% runoff offset
                </span>
              )}
            </div>
            <p className="mt-0.5 font-semibold text-white">{zone.park_name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-300">
              {zone.nearest_park_m === 0 ? "Inside zone" : `${zone.nearest_park_m} m away`} ·{" "}
              {(zone.park_area_sqm / 10000).toFixed(2)} ha
              {zone.park_capacity_kl > 0 ? ` · ${zone.park_capacity_kl} KL cap` : ""}
            </p>
          </div>
        </div>

        {/* 5. Site-Specific Recommended Fixes */}
        {zone.recommended_actions.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
              <Wrench className="h-3.5 w-3.5 text-[#C8FF00]" />
              <span>Priority Local Fixes</span>
            </div>
            <ul className="space-y-1.5 text-[11px] leading-snug text-slate-300">
              {zone.recommended_actions.map((act, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="font-mono text-[#C8FF00]">{idx + 1}.</span>
                  <span>{act}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Localized "Test Fix on This Zone" Toggle */}
        <button
          onClick={onToggleZoneOnlyFix}
          className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
            zoneOnlyFix
              ? "border-[#C8FF00]/60 bg-[#C8FF00]/15 text-[#DFFF66]"
              : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10"
          }`}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Test Fix on This Zone Only
          </span>
          <span className="font-mono text-[10px]">{zoneOnlyFix ? "ISOLATED" : "BASIN-WIDE"}</span>
        </button>
      </div>

      {/* Tier 2 Interactive 3D Fluid Physics Sandbox CTA */}
      <button
        onClick={onOpen3DSandbox}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#C8FF00] py-2.5 text-xs font-extrabold text-[#080B10] shadow-[0_0_20px_rgba(200,255,0,0.28)] transition hover:brightness-105"
      >
        <Box className="h-4 w-4" />
        Launch 3D Shallow-Water Sandbox
      </button>

      {/* Phase 2 Gemini CTA */}
      <button
        disabled
        className="mt-3 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#C8FF00] via-cyan-300 to-violet-400 py-2.5 text-xs font-bold text-[#080C12] opacity-85 shadow-lg"
      >
        <Sparkles className="h-4 w-4" />
        Generate Gemini Brief (Phase 2)
      </button>
    </div>
  );
}
