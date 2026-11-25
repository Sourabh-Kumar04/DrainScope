"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Download, ExternalLink, Filter, Search } from "lucide-react";
import { simulateOrganicZones } from "@/lib/api";
import { downloadFile, toCsv } from "@/lib/export";
import type { ProjectionYear, RiskTier, ZoneFeatureCollection, ZoneProperties } from "@/lib/types";

type SortKey = "ips_score" | "wsi_score" | "est_ponding_cm" | "rain_to_flood_mm" | "nearest_drain_m" | "park_offset_pct";

const TIER_PILL: Record<RiskTier, string> = {
  Critical: "border-rose-400/50 bg-rose-500/20 text-rose-300",
  High: "border-orange-400/50 bg-orange-500/20 text-orange-300",
  Moderate: "border-cyan-400/50 bg-cyan-500/20 text-cyan-200",
  Low: "border-emerald-400/50 bg-emerald-500/20 text-emerald-300",
};

export default function HotspotsRegisterPage() {
  const [rain, setRain] = useState(60);
  const [yr, setYr] = useState<ProjectionYear>(0);
  const [zonesFc, setZonesFc] = useState<ZoneFeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("ALL");
  const [underpassOnly, setUnderpassOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("ips_score");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    simulateOrganicZones(
      "barapullah",
      { rainfall_mm_hr: rain, projection_years: yr, nbs_impervious_reduction_pct: 0, park_detention_enabled: false },
      controller.signal
    )
      .then((res) => setZonesFc(res.zones_geojson))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [rain, yr]);

  const rows = useMemo<ZoneProperties[]>(() => {
    if (!zonesFc) return [];
    const q = search.trim().toLowerCase();
    return zonesFc.features
      .map((f) => f.properties)
      .filter((z) => {
        if (tierFilter !== "ALL" && z.risk_tier !== tierFilter) return false;
        if (underpassOnly && !z.underpass_trap) return false;
        if (
          q &&
          !z.zone_id.toLowerCase().includes(q) &&
          !z.diagnosis_headline.toLowerCase().includes(q) &&
          !z.nearest_drain_name.toLowerCase().includes(q) &&
          !z.park_name.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const diff = a[sortBy] - b[sortBy];
        return sortAsc ? diff : -diff;
      });
  }, [zonesFc, search, tierFilter, underpassOnly, sortBy, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc((v) => !v);
    else {
      setSortBy(key);
      setSortAsc(key === "rain_to_flood_mm");
    }
  };

  const handleExportCsv = () => {
    const flat = rows.map((z) => ({
      zone_id: z.zone_id,
      risk_tier: z.risk_tier,
      fix_first_ips: z.ips_score,
      susceptibility_wsi: z.wsi_score,
      area_ha: z.area_ha,
      est_ponding_cm: z.est_ponding_cm,
      rain_to_flood_mm_hr: z.rain_to_flood_mm,
      runoff_volume_kl: z.runoff_volume_kl,
      peak_flow_lps: z.peak_flow_lps ?? "SUPPRESSED_GT_50HA",
      concrete_pct: z.impervious_pct,
      nearest_osm_trunk_drain: z.nearest_drain_name,
      nearest_drain_m: z.nearest_drain_m,
      underpass_trap: z.underpass_trap,
      nbs_park: z.park_name,
      park_offset_pct: z.park_offset_pct,
      lat: z.centroid_lat,
      lng: z.centroid_lng,
    }));
    downloadFile(`barapullah_hotspots_${rain}mm_${yr}yr.csv`, toCsv(flat), "text/csv;charset=utf-8");
  };

  const handleExportGeoJson = () => {
    if (!zonesFc) return;
    const ids = new Set(rows.map((r) => r.zone_id));
    const payload = {
      type: "FeatureCollection",
      metadata: {
        catchment: "barapullah",
        rainfall_mm_hr: rain,
        stress_scenario_yr: yr,
        attribution: "Copernicus GLO-30 DEM | ESA WorldCover 10m (CC BY 4.0) | OpenStreetMap contributors (ODbL)",
      },
      features: zonesFc.features.filter((f) => ids.has(f.properties.zone_id)),
    };
    downloadFile(
      `barapullah_hotspots_${rain}mm_${yr}yr.geojson`,
      JSON.stringify(payload, null, 2),
      "application/geo+json"
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#C8FF00]">
            Triage &amp; Export Register
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Barapullah Waterlogging Hotspots</h1>
          <p className="mt-1 text-xs text-slate-400">
            Rank all 30m screening pockets (±30m), filter by severity or underpass traps, and jump straight to any zone on the map.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5 text-[#C8FF00]" />
            Export CSV ({rows.length})
          </button>
          <button
            onClick={handleExportGeoJson}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export GeoJSON
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#0C121A] p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search zone ID, drain, park, or diagnosis…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400/50"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          {(["ALL", "Critical", "High", "Moderate"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                tierFilter === t ? "bg-[#C8FF00] text-[#080C12]" : "bg-white/[0.04] text-slate-300 hover:bg-white/10"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <button
          onClick={() => setUnderpassOnly((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
            underpassOnly
              ? "border-rose-400/60 bg-rose-500/20 text-rose-200"
              : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10"
          }`}
        >
          Underpass Dips Only
        </button>

        <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
          <select
            value={rain}
            onChange={(e) => setRain(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-[#080B10] px-2.5 py-1.5 text-xs text-white outline-none"
          >
            <option value={25}>25 mm/hr (Light)</option>
            <option value={60}>60 mm/hr (Heavy)</option>
            <option value={100}>100 mm/hr (Extreme)</option>
            <option value={140}>140 mm/hr (Burst)</option>
          </select>
          <select
            value={yr}
            onChange={(e) => setYr(Number(e.target.value) as ProjectionYear)}
            className="rounded-lg border border-white/10 bg-[#080B10] px-2.5 py-1.5 text-xs text-white outline-none"
          >
            <option value={0}>Baseline</option>
            <option value={2}>+2 Yr Stress</option>
            <option value={5}>+5 Yr Stress</option>
            <option value={10}>+10 Yr Stress</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-[#0C121A]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">Zone</th>
              <th className="px-3 py-3">Tier</th>
              <th className="px-3 py-3">
                <button onClick={() => toggleSort("ips_score")} className="inline-flex items-center gap-1 hover:text-white">
                  Fix First <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-3 py-3">
                <button onClick={() => toggleSort("est_ponding_cm")} className="inline-flex items-center gap-1 hover:text-white">
                  Depth <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-3 py-3">
                <button onClick={() => toggleSort("rain_to_flood_mm")} className="inline-flex items-center gap-1 hover:text-white">
                  Floods At <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-3 py-3">
                <button onClick={() => toggleSort("nearest_drain_m")} className="inline-flex items-center gap-1 hover:text-white">
                  OSM Trunk Drain <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-3 py-3">
                <button onClick={() => toggleSort("park_offset_pct")} className="inline-flex items-center gap-1 hover:text-white">
                  NbS Park Relief <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center font-mono text-slate-400">
                  Loading Barapullah zones…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  No zones match your current filters.
                </td>
              </tr>
            ) : (
              rows.map((z) => (
                <tr key={z.zone_id} className="transition hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <p className="font-mono font-bold text-white">{z.zone_id}</p>
                    <p className="max-w-[220px] truncate text-[11px] text-slate-400">{z.diagnosis_headline}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TIER_PILL[z.risk_tier]}`}>
                      {z.risk_tier}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono font-semibold text-white">{Math.round(z.ips_score * 100)}</td>
                  <td className="px-3 py-3 font-mono text-rose-300">~{z.est_ponding_cm} cm</td>
                  <td className="px-3 py-3 font-mono text-[#C8FF00]">&ge;{z.rain_to_flood_mm} mm/hr</td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-200">{z.nearest_drain_name}</p>
                    <p className="font-mono text-[10px] text-cyan-300">{z.nearest_drain_m} m</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="max-w-[160px] truncate text-slate-200">{z.park_name}</p>
                    <p className="font-mono text-[10px] text-emerald-300">~{z.park_offset_pct}% offset</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/workspace?zone=${encodeURIComponent(z.zone_id)}&rain=${rain}&yr=${yr}`}
                      className="inline-flex items-center gap-1 rounded-full border border-[#C8FF00]/40 bg-[#C8FF00]/10 px-3 py-1 text-[11px] font-semibold text-[#DFFF66] transition hover:bg-[#C8FF00]/25"
                    >
                      Inspect
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
