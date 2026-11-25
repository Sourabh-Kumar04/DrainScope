"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, IndianRupee, Trees } from "lucide-react";
import { simulateOrganicZones } from "@/lib/api";
import type { CatchmentSummary, ProjectionYear, ZoneProperties } from "@/lib/types";

interface ParkRoiRow {
  parkName: string;
  areaHa: number;
  capacityKl: number;
  zonesServed: number;
  estCapexLakhs: number;
  inrPerKl: number;
  sampleZoneId: string;
}

export default function AnalyticsRoiPage() {
  const [rain, setRain] = useState(60);
  const [stressYr, setStressYr] = useState<ProjectionYear>(5);
  const [nbsPct, setNbsPct] = useState(25);
  const [parkDetention, setParkDetention] = useState(false);
  const [costInput, setCostInput] = useState("3200");
  const parsedCost = Number(costInput);
  const isCostValid = costInput.trim() !== "" && Number.isFinite(parsedCost) && parsedCost >= 500 && parsedCost <= 50000;
  const bioswaleCostPerM3 = isCostValid ? parsedCost : null;

  const [baseSummary, setBaseSummary] = useState<CatchmentSummary | null>(null);
  const [stressSummary, setStressSummary] = useState<CatchmentSummary | null>(null);
  const [nbsSummary, setNbsSummary] = useState<CatchmentSummary | null>(null);
  const [zones, setZones] = useState<ZoneProperties[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      simulateOrganicZones(
        "barapullah",
        { rainfall_mm_hr: rain, projection_years: 0, nbs_impervious_reduction_pct: 0, park_detention_enabled: false },
        controller.signal
      ),
      simulateOrganicZones(
        "barapullah",
        { rainfall_mm_hr: rain, projection_years: stressYr, nbs_impervious_reduction_pct: 0, park_detention_enabled: false },
        controller.signal
      ),
      simulateOrganicZones(
        "barapullah",
        { rainfall_mm_hr: rain, projection_years: stressYr, nbs_impervious_reduction_pct: nbsPct, park_detention_enabled: parkDetention },
        controller.signal
      ),
    ])
      .then(([b, s, n]) => {
        setBaseSummary(b.summary);
        setStressSummary(s.summary);
        setNbsSummary(n.summary);
        setZones(s.zones_geojson.features.map((f) => f.properties));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [rain, stressYr, nbsPct, parkDetention]);

  const topParks = useMemo<ParkRoiRow[]>(() => {
    const map = new Map<string, { areaSqm: number; capKl: number; zones: number; sampleZoneId: string }>();
    const EXCLUDED_NAMES = new Set(["none mapped", "public park", "unnamed park"]);
    for (const z of zones) {
      const pname = (z.park_name || "").trim();
      const lower = pname.toLowerCase();
      if (!pname || EXCLUDED_NAMES.has(lower) || lower.includes("river") || lower.includes("nallah") || lower.includes("drain")) continue;
      if (z.park_capacity_kl <= 0 || z.nearest_park_m > 350) continue;
      const prev = map.get(pname);
      if (prev) {
        prev.zones += 1;
      } else {
        map.set(z.park_name, {
          areaSqm: z.park_area_sqm,
          capKl: z.park_capacity_kl,
          zones: 1,
          sampleZoneId: z.zone_id,
        });
      }
    }
    return [...map.entries()]
      .map(([parkName, info]) => {
        // 1 KL = 1 m³ of shallow bioswale detention
        const estCapexInr = bioswaleCostPerM3 !== null ? info.capKl * bioswaleCostPerM3 : 0;
        return {
          parkName,
          areaHa: Number((info.areaSqm / 10000).toFixed(2)),
          capacityKl: info.capKl,
          zonesServed: info.zones,
          estCapexLakhs: bioswaleCostPerM3 !== null ? Number((estCapexInr / 100000).toFixed(1)) : -1,
          inrPerKl: bioswaleCostPerM3 ?? 0,
          sampleZoneId: info.sampleZoneId,
        };
      })
      .sort((a, b) => b.capacityKl - a.capacityKl)
      .slice(0, 12);
  }, [zones, bioswaleCostPerM3]);

  const totalDetentionKl = useMemo(
    () => Math.round(topParks.reduce((acc, p) => acc + p.capacityKl, 0)),
    [topParks]
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#C8FF00]">
            Decision Economics &amp; Adaptation Scenarios
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">NbS ROI &amp; Scenario Comparison</h1>
          <p className="mt-1 text-xs text-slate-400">
            Compare Baseline vs. What-If Stress vs. Nature-based Solutions (NbS) relief, and rank public parks by screening stormwater detention capacity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <select
            value={rain}
            onChange={(e) => setRain(Number(e.target.value))}
            className="rounded-xl border border-white/10 bg-[#0C121A] px-3 py-2 text-white outline-none"
          >
            <option value={40}>40 mm/hr</option>
            <option value={60}>60 mm/hr (Heavy)</option>
            <option value={100}>100 mm/hr (Extreme)</option>
            <option value={140}>140 mm/hr (Burst)</option>
          </select>
          <select
            value={stressYr}
            onChange={(e) => setStressYr(Number(e.target.value) as ProjectionYear)}
            className="rounded-xl border border-white/10 bg-[#0C121A] px-3 py-2 text-white outline-none"
          >
            <option value={2}>+2 Yr Stress</option>
            <option value={5}>+5 Yr Stress</option>
            <option value={10}>+10 Yr Stress</option>
          </select>
          <select
            value={nbsPct}
            onChange={(e) => setNbsPct(Number(e.target.value))}
            className="rounded-xl border border-white/10 bg-[#0C121A] px-3 py-2 text-[#22C5E5] outline-none"
          >
            <option value={0}>NbS: 0% Concrete</option>
            <option value={15}>NbS: -15% Concrete</option>
            <option value={25}>NbS: -25% Concrete</option>
            <option value={35}>NbS: -35% Concrete</option>
          </select>
          <button
            onClick={() => setParkDetention((v) => !v)}
            className={`rounded-xl border px-3 py-2 font-mono text-xs transition ${
              parkDetention
                ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
                : "border-white/10 bg-[#0C121A] text-slate-400 hover:text-white"
            }`}
          >
            Park Detention: {parkDetention ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* 3-Column Scenario A vs B vs C Comparison */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { title: "1. Baseline (Now)", sub: `${rain} mm/hr · No intervention`, data: baseSummary, border: "border-white/10" },
          { title: `2. +${stressYr} Yr Stress (What-If)`, sub: `${rain} mm/hr · Unmitigated stress`, data: stressSummary, border: "border-rose-400/35" },
          { title: `3. +${stressYr} Yr + NbS Relief`, sub: `-${nbsPct}% concrete${parkDetention ? " + park detention" : " (parks off)"}`, data: nbsSummary, border: "border-[#C8FF00]/45" },
        ].map((card) => (
          <div key={card.title} className={`rounded-2xl border ${card.border} bg-[#0C121A] p-5`}>
            <p className="text-xs font-bold text-white">{card.title}</p>
            <p className="text-[11px] text-slate-400">{card.sub}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 font-mono">
              <div>
                <p className="font-sans text-[10px] text-slate-400">Critical</p>
                <p className="text-xl font-bold text-rose-400">{card.data?.critical_count ?? "—"}</p>
              </div>
              <div>
                <p className="font-sans text-[10px] text-slate-400">High</p>
                <p className="text-xl font-bold text-orange-400">{card.data?.high_count ?? "—"}</p>
              </div>
              <div>
                <p className="font-sans text-[10px] text-slate-400">Mean WSI</p>
                <p className="text-xl font-bold text-[#C8FF00]">
                  {card.data ? `${Math.round(card.data.mean_wsi * 100)}%` : "—"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Editable Screening Cost Parameter + Park Detention ROI Table */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-[#0C121A] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <Trees className="h-5 w-5 text-[#C8FF00]" />
            <div>
              <h2 className="text-sm font-bold text-white">
                Top NbS Park Detention Candidates (&le;350m From Flood Zones)
              </h2>
              <p className="text-[11px] text-slate-400">
                Assumes 15% of mapped park area retrofitted as a 30 cm shallow bioswale · Combined top-12 capacity:{" "}
                <strong className="font-mono text-[#C8FF00]">{totalDetentionKl.toLocaleString()} KL</strong>
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${isCostValid ? "border-white/10 bg-white/[0.03]" : "border-rose-500/60 bg-rose-950/30"}`}>
              <IndianRupee className="h-3.5 w-3.5 text-cyan-300" />
              <span className="text-slate-400">Bioswale Unit Cost:</span>
              <input
                type="text"
                inputMode="numeric"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                aria-invalid={!isCostValid}
                className="w-24 rounded-md border border-white/15 bg-[#080B10] px-2 py-0.5 font-mono text-white outline-none"
              />
              <span className="font-mono text-[11px] text-slate-400">/ KL</span>
              <button
                type="button"
                onClick={() => setCostInput("3200")}
                className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/10"
              >
                Reset
              </button>
            </div>
            {!isCostValid && (
              <p className="text-[10px] text-rose-400">Enter a valid unit cost between ₹500 and ₹50,000 / KL.</p>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-400">
              <tr className="border-b border-white/10">
                <th className="py-2.5 pr-4">Public Park (OSM)</th>
                <th className="px-3 py-2.5">Park Area</th>
                <th className="px-3 py-2.5">Adjacent Zones</th>
                <th className="px-3 py-2.5">Screening Detention</th>
                <th className="px-3 py-2.5">Est. Screening CapEx</th>
                <th className="py-2.5 pl-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {topParks.map((p) => (
                <tr key={p.parkName} className="hover:bg-white/[0.03]">
                  <td className="py-3 pr-4 font-semibold text-white">{p.parkName}</td>
                  <td className="px-3 py-3 font-mono text-slate-300">{p.areaHa} ha</td>
                  <td className="px-3 py-3 font-mono text-cyan-300">{p.zonesServed} zones</td>
                  <td className="px-3 py-3 font-mono font-bold text-[#C8FF00]">{p.capacityKl.toLocaleString()} KL</td>
                  <td className="px-3 py-3 font-mono text-slate-200">{p.estCapexLakhs >= 0 ? `₹${p.estCapexLakhs} Lakh` : "—"}</td>
                  <td className="py-3 pl-3 text-right">
                    <Link
                      href={`/workspace?zone=${encodeURIComponent(p.sampleZoneId)}&rain=${rain}&yr=${stressYr}&nbs=${nbsPct}&park=1`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:underline"
                    >
                      View <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500">
          <BarChart3 className="h-3.5 w-3.5" />
          Indicative screening CapEx only (editable unit cost). Detailed civil BoQ requires field survey and geotechnical soil infiltration testing.
        </p>
      </div>
    </div>
  );
}
