"use client";

import { useState } from "react";
import Link from "next/link";
import { Crosshair, Download, ExternalLink, Play, Sparkles } from "lucide-react";
import { screenPortfolioSites } from "@/lib/api";
import { downloadFile, toCsv } from "@/lib/export";
import type { PortfolioScreenResponse, ProjectionYear, RiskTier, ScreenSiteInput } from "@/lib/types";

const SAMPLE_CSV = `Moolchand Crossing,28.5644,77.2342
Defence Colony Market,28.5714,77.2330
Lajpat Nagar Central,28.5677,77.2432
Chirag Delhi Junction,28.5389,77.2323
AIIMS Flyover South,28.5703,77.2098
Nehru Place District,28.5493,77.2530
Saket Select Citywalk,28.5285,77.2190`;

const TIER_PILL: Record<RiskTier, string> = {
  Critical: "border-rose-400/50 bg-rose-500/20 text-rose-300",
  High: "border-orange-400/50 bg-orange-500/20 text-orange-300",
  Moderate: "border-cyan-400/50 bg-cyan-500/20 text-cyan-200",
  Low: "border-emerald-400/50 bg-emerald-500/20 text-emerald-300",
};

interface ParseResult {
  valid: ScreenSiteInput[];
  errors: string[];
  truncatedCount: number;
}

function parseSitesCsv(text: string): ParseResult {
  const valid: ScreenSiteInput[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(",").map((s) => s.trim());
    if (parts.length < 3 || !parts[0]) {
      errors.push(`Line ${idx + 1}: expected "Name,lat,lng"`);
      return;
    }
    const lat = Number(parts[1]);
    const lng = Number(parts[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      errors.push(`Line ${idx + 1} (${parts[0]}): invalid latitude/longitude range`);
      return;
    }
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (seen.has(key)) {
      errors.push(`Line ${idx + 1} (${parts[0]}): duplicate coordinate skipped`);
      return;
    }
    seen.add(key);
    valid.push({ name: parts[0], lat, lng });
  });

  const truncatedCount = Math.max(0, valid.length - 100);
  return { valid: valid.slice(0, 100), errors, truncatedCount };
}

export default function SiteScreenerPage() {
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [rain, setRain] = useState(60);
  const [yr, setYr] = useState<ProjectionYear>(0);
  const [nbsPct, setNbsPct] = useState(0);
  const [result, setResult] = useState<PortfolioScreenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const handleRun = async () => {
    const parsed = parseSitesCsv(csvText);
    const warnings = [...parsed.errors];
    if (parsed.truncatedCount > 0) {
      warnings.push(`${parsed.truncatedCount} extra row(s) exceeded the 100-site limit and were not sent.`);
    }
    setParseWarnings(warnings);
    const sites = parsed.valid;
    if (sites.length === 0) {
      setError("No valid rows found. Use format: Site Name,lat,lng (e.g., Moolchand,28.5644,77.2342).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await screenPortfolioSites("barapullah", {
        sites,
        rainfall_mm_hr: rain,
        projection_years: yr,
        nbs_impervious_reduction_pct: nbsPct,
        park_detention_enabled: nbsPct > 0,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screening failed");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!result) return;
    const rows = result.sites.map((s) => ({
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      in_catchment: s.in_catchment,
      screening_score_100: s.screening_score_100,
      risk_tier: s.risk_tier,
      est_ponding_cm: s.est_ponding_cm,
      rain_to_flood_mm_hr: s.rain_to_flood_mm ?? "",
      matched_zone_id: s.matched_zone_id ?? "",
      nearest_osm_drain: s.nearest_drain_name ?? "",
      nearest_drain_m: s.nearest_drain_m ?? "",
      nearest_nbs_park: s.park_name ?? "",
      top_driver: s.top_driver,
    }));
    downloadFile(`drainscope_portfolio_screen_${rain}mm.csv`, toCsv(rows), "text/csv;charset=utf-8");
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">
            Property &amp; Portfolio Flood Screening
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Site &amp; Portfolio Screener</h1>
          <p className="mt-1 text-xs text-slate-400">
            Screen up to 100 Barapullah coordinates at once for 0–100 flood susceptibility, Rain-to-Flood thresholds, and nearest drainage/NbS access.
          </p>
        </div>

        {result && (
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5 text-[#C8FF00]" />
            Export Screened CSV
          </button>
        )}
      </div>

      {/* Input Panel */}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0C121A] p-5 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-bold text-white">
              <Crosshair className="h-4 w-4 text-[#C8FF00]" />
              Paste Sites (`Name,lat,lng` — one per line)
            </label>
            <button
              onClick={() => { setCsvText(SAMPLE_CSV); setError(null); setParseWarnings([]); }}
              className="text-[11px] font-semibold text-cyan-300 hover:underline"
            >
              Load 7 South Delhi Samples
            </button>
          </div>
          <textarea
            rows={7}
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setError(null); setParseWarnings([]); }}
            className="w-full rounded-xl border border-white/10 bg-[#080B10] p-3 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400/50"
          />
          {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
          {parseWarnings.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-400/40 bg-amber-950/30 p-2.5 text-[11px] text-amber-200">
              <p className="font-semibold">Input validation notices ({parseWarnings.length}):</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {parseWarnings.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0C121A] p-5">
          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Storm &amp; Scenario</h2>

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-400">Rainfall Intensity</span>
                <span className="font-mono font-bold text-[#C8FF00]">{rain} mm/hr</span>
              </div>
              <input
                type="range"
                min={10}
                max={150}
                step={5}
                value={rain}
                onChange={(e) => setRain(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            <div>
              <span className="mb-1 block text-xs text-slate-400">Stress Scenario (What-If)</span>
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-white/[0.04] p-1">
                {([0, 2, 5, 10] as const).map((y) => (
                  <button
                    key={y}
                    onClick={() => setYr(y)}
                    className={`rounded-lg py-1 font-mono text-[11px] font-semibold ${
                      yr === y ? "bg-cyan-400 text-[#06131A]" : "text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {y === 0 ? "Now" : `+${y}Y`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-400">On-Site Bio-Retention</span>
                <span className="font-mono text-[#C8FF00]">-{nbsPct}% concrete</span>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                step={5}
                value={nbsPct}
                onChange={(e) => setNbsPct(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>
          </div>

          <button
            onClick={handleRun}
            disabled={loading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#C8FF00] py-2.5 text-xs font-bold text-[#080C12] shadow-[0_0_20px_rgba(200,255,0,0.3)] transition hover:brightness-105 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {loading ? "Screening Sites…" : "Run Portfolio Screen"}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-[#0C121A] p-4">
              <p className="text-[11px] text-slate-400">In-Catchment Mean Score</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#C8FF00]">{result.mean_score_100} / 100</p>
              {result.in_catchment_count < result.total_sites && (
                <p className="mt-0.5 text-[10px] text-amber-300">
                  Excludes {result.total_sites - result.in_catchment_count} out-of-area site(s)
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0C121A] p-4">
              <p className="text-[11px] text-slate-400">Critical Sites</p>
              <p className="mt-1 font-mono text-2xl font-bold text-rose-400">{result.critical_count}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0C121A] p-4">
              <p className="text-[11px] text-slate-400">High-Risk Sites</p>
              <p className="mt-1 font-mono text-2xl font-bold text-orange-400">{result.high_count}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0C121A] p-4">
              <p className="text-[11px] text-slate-400">Inside Barapullah AOI</p>
              <p className="mt-1 font-mono text-2xl font-bold text-white">
                {result.in_catchment_count} / {result.total_sites}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0C121A]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Site</th>
                  <th className="px-3 py-3">Score (0–100)</th>
                  <th className="px-3 py-3">Tier</th>
                  <th className="px-3 py-3">Depth</th>
                  <th className="px-3 py-3">Floods At</th>
                  <th className="px-3 py-3">Top Driver</th>
                  <th className="px-3 py-3">OSM Trunk Drain</th>
                  <th className="px-4 py-3 text-right">Map</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {result.sites.map((s, idx) => (
                  <tr key={`${s.name}-${idx}`} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{s.name}</p>
                      <p className="font-mono text-[10px] text-slate-500">
                        {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                      </p>
                    </td>
                    <td className="px-3 py-3 font-mono text-sm font-bold text-white">{s.screening_score_100}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TIER_PILL[s.risk_tier]}`}>
                        {s.risk_tier}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-rose-300">
                      {s.est_ponding_cm > 0 ? `~${s.est_ponding_cm} cm` : "0 cm"}
                    </td>
                    <td className="px-3 py-3 font-mono text-[#C8FF00]">
                      {s.rain_to_flood_mm ? `>=${s.rain_to_flood_mm} mm/hr` : "—"}
                    </td>
                    <td className="px-3 py-3 text-slate-300">{s.top_driver}</td>
                    <td className="px-3 py-3 text-slate-300">
                      {s.nearest_drain_name ? `${s.nearest_drain_name} (${s.nearest_drain_m}m)` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.matched_zone_id ? (
                        <Link
                          href={`/workspace?zone=${encodeURIComponent(s.matched_zone_id)}&rain=${rain}&yr=${yr}`}
                          className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-400/20"
                        >
                          {s.matched_zone_id}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-[11px] text-slate-500">Outside pockets</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0C121A] px-5 py-3.5 text-xs text-slate-400">
            <span>
              Screening scores reflect 30m Copernicus DEM (±30m) and OSM trunk drains; verify minor drains on-site.
            </span>
<span className="font-mono text-[11px] text-slate-400">South Delhi Barapullah Pilot · CSV Export Ready</span>
          </div>
        </div>
      )}
    </div>
  );
}
