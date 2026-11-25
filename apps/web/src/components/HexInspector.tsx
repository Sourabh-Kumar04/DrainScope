"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Droplets,
  Eye,
  ShieldCheck,
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
  Critical: "border-[#F87171]/40 bg-[#F87171]/10 text-[#F87171]",
  High: "border-[#FBBF24]/40 bg-[#FBBF24]/10 text-[#FBBF24]",
  Moderate: "border-[#22C5E5]/40 bg-[#22C5E5]/10 text-[#22C5E5]",
  Low: "border-emerald-400/40 bg-emerald-400/10 text-emerald-400",
};

const DRIVER_BAR_COLOR: Record<string, string> = {
  concrete: "bg-[#F87171]",
  pooling: "bg-[#22C5E5]",
  drain_gap: "bg-[#FBBF24]",
  trap: "bg-[#A3E635]",
};

export default function HexInspector({
  zone,
  zoneOnlyFix,
  onToggleZoneOnlyFix,
  onOpenStreetView,
  onOpen3DSandbox,
  onClose,
}: HexInspectorProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    hydro: true,
    factors: true,
    infra: true,
    evidence: false,
    actions: true,
  });

  const toggle = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <aside className="absolute bottom-0 right-0 top-12 z-20 flex w-[380px] flex-col border-l border-[#263445] bg-[#111925] text-[#E5E7EB] shadow-xl">
      {/* 1. Zone Overview Header */}
      <div className="shrink-0 border-b border-[#263445] bg-[#0B1018] px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
              Selected Risk Zone
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="font-mono text-base font-bold text-white">{zone.zone_id}</h2>
              <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${TIER_BADGE[zone.risk_tier]}`}>
                {zone.risk_tier}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[#94A3B8]">{zone.area_ha} ha</span>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close inspector (Esc)"
            className="rounded p-1 text-[#94A3B8] transition hover:bg-[#151D29] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-xs font-medium text-[#E5E7EB]">{zone.diagnosis_headline}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[#94A3B8]">{zone.diagnosis_summary}</p>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onOpenStreetView}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#263445] bg-[#151D29] py-1.5 text-[11px] font-medium text-[#22C5E5] transition hover:border-[#22C5E5]"
          >
            <Eye className="h-3.5 w-3.5" />
            Street View
          </button>
          <button
            onClick={onOpen3DSandbox}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#263445] bg-[#151D29] py-1.5 text-[11px] font-medium text-[#E5E7EB] transition hover:border-[#22C5E5] hover:text-[#22C5E5]"
          >
            <Box className="h-3.5 w-3.5" />
            3D Fluid Sandbox
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#263445]">
        {/* 2. Hydrological Analysis */}
        <section className="p-4">
          <button
            onClick={() => toggle("hydro")}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#E5E7EB]">
              <Droplets className="h-3.5 w-3.5 text-[#22C5E5]" />
              Hydrological Analysis
            </span>
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#151D29] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#94A3B8]">
                Model Estimate
              </span>
              {openSections.hydro ? <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#94A3B8]" />}
            </div>
          </button>

          {openSections.hydro && (
            <div className="mt-3 space-y-2.5">
              <div className="grid grid-cols-3 gap-2 rounded-md border border-[#263445] bg-[#151D29] p-2.5 font-mono tabular-nums">
                <div>
                  <p className="font-sans text-[10px] text-[#94A3B8]">Screening Depth</p>
                  <p className="mt-0.5 text-sm font-bold text-white">~{zone.est_ponding_cm} cm</p>
                </div>
                <div>
                  <p className="font-sans text-[10px] text-[#94A3B8]">Runoff Vol.</p>
                  <p className="mt-0.5 text-sm font-bold text-white">{zone.runoff_volume_kl} KL</p>
                </div>
                <div>
                  <p className="font-sans text-[10px] text-[#94A3B8]">Peak Flow</p>
                  <p className="mt-0.5 text-sm font-bold text-white">
                    {zone.rational_method_valid && zone.peak_flow_lps !== null ? `${zone.peak_flow_lps} L/s` : "N/A"}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
                <span>Flood onset threshold</span>
                <span className="font-mono font-semibold tabular-nums text-[#E5E7EB]">
                  &ge;{zone.rain_to_flood_mm} mm/hr
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
                <span>Impervious cover · DEM dip</span>
                <span className="font-mono tabular-nums text-[#E5E7EB]">
                  {zone.impervious_pct}% · {zone.sink_max_m} m
                </span>
              </div>
              {zone.rational_scope_note && (
                <p className="rounded border border-[#263445] bg-[#0B1018] px-2.5 py-1.5 text-[10px] leading-relaxed text-[#94A3B8]">
                  {zone.rational_scope_note}
                </p>
              )}
            </div>
          )}
        </section>

        {/* 3. Contributing Factors */}
        <section className="p-4">
          <button
            onClick={() => toggle("factors")}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#E5E7EB]">
              Contributing Factors
            </span>
            {openSections.factors ? <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#94A3B8]" />}
          </button>

          {openSections.factors && (
            <div className="mt-3 space-y-2.5">
              {zone.drivers.map((d) => (
                <div key={d.key}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-[#CBD5E1]">{d.label}</span>
                    <span className="font-mono tabular-nums text-[#94A3B8]">{d.pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0B1018]">
                    <div
                      className={`h-full rounded-full ${DRIVER_BAR_COLOR[d.key] ?? "bg-[#22C5E5]"}`}
                      style={{ width: `${Math.min(100, Math.max(4, d.pct))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 4. Drainage Infrastructure */}
        <section className="p-4">
          <button
            onClick={() => toggle("infra")}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#E5E7EB]">
              Drainage Infrastructure
            </span>
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#151D29] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#22C5E5]">
                OSM / Observed
              </span>
              {openSections.infra ? <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#94A3B8]" />}
            </div>
          </button>

          {openSections.infra && (
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="rounded-md border border-[#263445] bg-[#151D29] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Nearest Trunk Drain</span>
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-[#22C5E5]">
                    {zone.nearest_drain_m} m
                  </span>
                </div>
                <p className="mt-0.5 font-medium text-[#E5E7EB]">{zone.nearest_drain_name}</p>
                <p className="mt-1.5 text-[10px] leading-relaxed text-[#94A3B8]">
                  OSM primarily maps major trunk drains/nallahs; absence in OSM does not establish absence of local roadside storm grates.
                </p>
              </div>

              {zone.nearby_underpasses.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-[#F87171]/30 bg-[#F87171]/10 p-2.5 text-[11px] text-[#FCA5A5]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F87171]" />
                  <span>
                    {zone.nearby_underpasses.length} sunken road underpass dip(s) within 450 m (nearest:{" "}
                    <strong className="text-white">{zone.nearby_underpasses[0].name}</strong>,{" "}
                    {zone.nearby_underpasses[0].dist_m} m).
                  </span>
                </div>
              )}

              {zone.park_name !== "None mapped" && (
                <div className="rounded-md border border-[#263445] bg-[#151D29] p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Nearest Detention Park</span>
                    <span className="font-mono text-[11px] tabular-nums text-emerald-400">
                      {zone.nearest_park_m} m
                    </span>
                  </div>
                  <p className="mt-0.5 font-medium text-[#E5E7EB]">{zone.park_name}</p>
                  <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[#94A3B8]">
                    Est. storage: {zone.park_capacity_kl} KL ({zone.park_offset_pct}% runoff offset)
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 5. Evidence & Confidence */}
        <section className="p-4">
          <button
            onClick={() => toggle("evidence")}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#E5E7EB]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#22C5E5]" />
              Evidence &amp; Confidence
            </span>
            {openSections.evidence ? <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#94A3B8]" />}
          </button>

          {openSections.evidence && (
            <div className="mt-3 space-y-2 text-[11px] text-[#94A3B8]">
              <div className="flex justify-between">
                <span>Elevation Source</span>
                <span className="font-mono text-[#E5E7EB]">Copernicus GLO-30 (30m)</span>
              </div>
              <div className="flex justify-between">
                <span>Land Cover</span>
                <span className="font-mono text-[#E5E7EB]">ESA WorldCover (10m)</span>
              </div>
              <div className="flex justify-between">
                <span>Spatial Tolerance</span>
                <span className="font-mono text-[#E5E7EB]">&plusmn;30m Screening</span>
              </div>
              <p className="rounded border border-[#263445] bg-[#0B1018] p-2 text-[10px] leading-relaxed">
                Screening depths and runoff volumes are deterministic model estimates, not field-gauged flood measurements. Pair with street-mapped inlet pins for field verification.
              </p>
            </div>
          )}
        </section>

        {/* 6. Recommended Actions */}
        <section className="p-4">
          <button
            onClick={() => toggle("actions")}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#E5E7EB]">
              <Wrench className="h-3.5 w-3.5 text-[#22C5E5]" />
              Recommended Actions
            </span>
            {openSections.actions ? <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#94A3B8]" />}
          </button>

          {openSections.actions && (
            <div className="mt-3 space-y-2">
              {zone.recommended_actions.map((act, idx) => (
                <div key={idx} className="flex items-start gap-2 text-[11px] leading-relaxed text-[#CBD5E1]">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22C5E5]" />
                  <span>{act}</span>
                </div>
              ))}

              <button
                onClick={onToggleZoneOnlyFix}
                className={`mt-2 w-full rounded-md border px-3 py-2 text-[11px] font-medium transition ${
                  zoneOnlyFix
                    ? "border-[#A3E635]/60 bg-[#A3E635]/15 text-[#A3E635]"
                    : "border-[#263445] bg-[#151D29] text-[#E5E7EB] hover:border-[#22C5E5]"
                }`}
              >
                {zoneOnlyFix
                  ? `Isolating NbS Intervention to ${zone.zone_id} (Active)`
                  : `Test Localized NbS Intervention on ${zone.zone_id}`}
              </button>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
