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
    <div className="absolute bottom-4 left-4 z-10 max-h-[46vh] w-[348px] overflow-y-auto rounded-2xl border border-white/10 bg-[#0C121A]/90 p-3.5 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-white">
            Stress Scenario &amp; Rain Simulator
          </h2>
          {collapsed ? (
            <p className="mt-0.5 font-mono text-[10px] text-[#C8FF00]">
              {activeScenario.label} · {rainfallMmHr} mm/hr · -{nbsPct}% NbS
            </p>
          ) : zoneOnlyFix && selectedZoneId ? (
            <p className="mt-0.5 font-mono text-[10px] text-[#C8FF00]">
              Testing NbS fix on {selectedZoneId} only
            </p>
          ) : (
            <p className="mt-0.5 text-[10px] text-slate-400">
              Illustrative what-if scenarios — not calibrated forecasts
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {loading && <span className="font-mono text-[10px] text-[#C8FF00] animate-pulse">Live…</span>}
          {isModified && (
            <button
              onClick={onReset}
              title="Reset to Baseline · 60 mm/hr"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand Simulator" : "Collapse Simulator"}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-3">
          {/* 1. Stress Scenarios (What-If) */}
          <div className="mb-3.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-slate-300">
              <span className="flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-cyan-400" />
                <span>Stress Scenarios (What-If)</span>
              </span>
              <button
                onClick={onOpenMethodology}
                className="flex items-center gap-1 text-[10px] text-cyan-300 hover:underline"
              >
                <Info className="h-3 w-3" />
                Assumptions
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/5">
              {SCENARIOS.map((t) => (
                <button
                  key={t.yr}
                  onClick={() => onProjectionChange(t.yr)}
                  className={`rounded-lg py-1.5 font-mono text-[11px] font-semibold transition-all duration-150 ${
                    projectionYears === t.yr
                      ? "bg-cyan-400 text-[#06131A] shadow-[0_0_12px_rgba(34,211,238,0.4)]"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">{activeScenario.note}</p>
          </div>

          {/* 2. Continuous Variable Rainfall Slider */}
          <div className="mb-3.5">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-slate-300">
                <CloudRain className="h-3.5 w-3.5 text-[#C8FF00]" />
                Rainfall Intensity
              </span>
              <span className="font-mono font-bold tabular-nums text-[#C8FF00]">{rainfallMmHr} mm/hr</span>
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
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {RAIN_PRESETS.map((p) => (
                <button
                  key={p.mm}
                  onClick={() => onRainfallChange(p.mm)}
                  className={`rounded-full py-1 text-[10px] font-semibold transition ${
                    rainfallMmHr === p.mm
                      ? "bg-[#C8FF00] text-[#080C12]"
                      : "bg-white/[0.05] text-slate-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {p.label} {p.mm}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Bio-Retention / Permeable Paving Slider */}
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-slate-300">Bio-Retention (NbS)</span>
              <span className="font-mono tabular-nums text-[#C8FF00]">-{nbsPct}% concrete</span>
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
          </div>

          {/* 4. Park Detention Toggle */}
          <button
            onClick={onToggleParkDetention}
            className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all duration-150 ${
              parkDetention
                ? "border-[#C8FF00]/50 bg-[#C8FF00]/15 text-[#DFFF66]"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10"
            }`}
          >
            <span className="flex items-center gap-2">
              <Trees className="h-4 w-4" />
              Route Runoff to Nearby Parks
            </span>
            <span className="font-mono text-[11px]">{parkDetention ? "ACTIVE" : "OFF"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
