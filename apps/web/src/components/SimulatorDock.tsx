"use client";

import { useState } from "react";
import { CalendarClock, ChevronDown, ChevronUp, CloudRain, Info, RotateCcw, Trees } from "lucide-react";
import type { ProjectionYear } from "@/lib/types";

interface SimulatorDockProps {
  rainfallMmHr: number;
  onRainfallChange: (mm: number) => void;
  projectionYears: ProjectionYear;
  onProjectionChange: (yr: ProjectionYear) => void;
  nbsPct: number;
  onNbsPctChange: (v: number) => void;
  parkDetention: boolean;
  onToggleParkDetention: () => void;
  zoneOnlyFix: boolean;
  selectedZoneId: string | null;
  onReset: () => void;
  onOpenMethodology: () => void;
  loading: boolean;
}

const SCENARIOS: { yr: ProjectionYear; label: string; note: string }[] = [
  { yr: 0, label: "Baseline", note: "Observed 30m DEM & 10m land cover (what-if baseline)" },
  { yr: 2, label: "+2 Yr", note: "What-if stress: +2.5% concrete · +4% rain · 5% drain loss" },
  { yr: 5, label: "+5 Yr", note: "What-if stress: +6.0% concrete · +10% rain · 12% drain loss" },
  { yr: 10, label: "+10 Yr", note: "What-if stress: +11.5% concrete · +18% rain · 22% drain loss" },
];

const RAIN_PRESETS = [
  { label: "Light", mm: 25 },
  { label: "Heavy", mm: 60 },
  { label: "Extreme", mm: 100 },
  { label: "Burst", mm: 140 },
];

export default function SimulatorDock({
  rainfallMmHr,
  onRainfallChange,
  projectionYears,
  onProjectionChange,
  nbsPct,
  onNbsPctChange,
  parkDetention,
  onToggleParkDetention,
  zoneOnlyFix,
  selectedZoneId,
  onReset,
  onOpenMethodology,
  loading,
}: SimulatorDockProps) {
  const [collapsed, setCollapsed] = useState(true);
  const isModified = rainfallMmHr !== 60 || projectionYears !== 0 || nbsPct !== 0 || parkDetention;
  const activeScenario = SCENARIOS.find((t) => t.yr === projectionYears) ?? SCENARIOS[0];

  return (
    <div className="absolute bottom-4 left-4 z-20 max-h-[48vh] w-[330px] overflow-y-auto rounded-md border border-[#263445] bg-[#151D29] p-3 shadow-lg">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E5E7EB]">
            Rainfall &amp; Stress Simulator
          </h2>
          {collapsed ? (
            <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[#22C5E5]">
              {activeScenario.label} · {rainfallMmHr} mm/hr · -{nbsPct}% NbS
            </p>
          ) : zoneOnlyFix && selectedZoneId ? (
            <p className="mt-0.5 font-mono text-[10px] text-[#A3E635]">
              Isolating NbS fix to {selectedZoneId}
            </p>
          ) : (
            <p className="mt-0.5 text-[10px] text-[#94A3B8]">
              Deterministic what-if screening scenarios
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {loading && <span className="font-mono text-[10px] text-[#22C5E5] animate-pulse">Sync…</span>}
          {isModified && (
            <button
              onClick={onReset}
              title="Reset to Baseline · 60 mm/hr"
              className="rounded p-1 text-[#94A3B8] transition hover:bg-[#111925] hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand Simulator" : "Collapse Simulator"}
            className="rounded p-1 text-[#94A3B8] transition hover:bg-[#111925] hover:text-white"
          >
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-3 space-y-3.5 border-t border-[#263445] pt-3">
          {/* 1. Stress Scenarios */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#CBD5E1]">
              <span className="flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-[#22C5E5]" />
                Urban Stress Horizon
              </span>
              <button
                onClick={onOpenMethodology}
                className="text-[10px] text-[#94A3B8] hover:text-[#22C5E5]"
                title="View scenario assumptions"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1 rounded bg-[#0B1018] p-1">
              {SCENARIOS.map((s) => (
                <button
                  key={s.yr}
                  onClick={() => onProjectionChange(s.yr)}
                  className={`rounded py-1 text-[11px] font-medium transition ${
                    projectionYears === s.yr
                      ? "bg-[#151D29] text-[#22C5E5] ring-1 ring-[#263445]"
                      : "text-[#94A3B8] hover:text-[#E5E7EB]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-[#94A3B8]">{activeScenario.note}</p>
          </div>

          {/* 2. Rainfall Intensity */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-[#CBD5E1]">
                <CloudRain className="h-3.5 w-3.5 text-[#22C5E5]" />
                Rainfall Intensity (1-hr)
              </span>
              <span className="font-mono font-semibold tabular-nums text-white">{rainfallMmHr} mm/hr</span>
            </div>
            <input
              type="range"
              min={10}
              max={150}
              step={5}
              value={rainfallMmHr}
              onChange={(e) => onRainfallChange(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
            <div className="mt-1.5 grid grid-cols-4 gap-1">
              {RAIN_PRESETS.map((p) => (
                <button
                  key={p.mm}
                  onClick={() => onRainfallChange(p.mm)}
                  className={`rounded border py-1 text-[10px] font-medium transition ${
                    rainfallMmHr === p.mm
                      ? "border-[#22C5E5]/60 bg-[#22C5E5]/15 text-[#22C5E5]"
                      : "border-[#263445] bg-[#0B1018] text-[#94A3B8] hover:text-[#E5E7EB]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Nature-Based Solutions */}
          <div className="border-t border-[#263445] pt-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-[#CBD5E1]">
                <Trees className="h-3.5 w-3.5 text-emerald-400" />
                Permeable Retrofit (NbS)
              </span>
              <span className="font-mono font-semibold tabular-nums text-emerald-400">-{nbsPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              step={5}
              value={nbsPct}
              onChange={(e) => onNbsPctChange(Number(e.target.value))}
              className="w-full cursor-pointer"
            />

            <button
              onClick={onToggleParkDetention}
              className={`mt-2.5 flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-[11px] font-medium transition ${
                parkDetention
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : "border-[#263445] bg-[#0B1018] text-[#94A3B8] hover:text-[#E5E7EB]"
              }`}
            >
              <span>Park Bioswale Detention</span>
              <span className="font-mono text-[10px]">{parkDetention ? "ENABLED" : "OFF"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
