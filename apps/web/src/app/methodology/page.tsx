"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, ShieldCheck, Waves } from "lucide-react";
import { fetchMethodology, fetchValidation } from "@/lib/api";
import type { MethodologyReport, ValidationReport } from "@/lib/types";

export default function MethodologyPage() {
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [methodology, setMethodology] = useState<MethodologyReport | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchValidation("barapullah", controller.signal).then(setValidation).catch(() => {});
    fetchMethodology("barapullah", controller.signal).then(setMethodology).catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <div className="min-h-screen bg-[#080B10] text-slate-200">
      <header className="border-b border-white/10 bg-[#080B10]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-[#C8FF00]" />
            <span className="text-xs font-bold tracking-[0.16em] text-white">DRAINSCOPE</span>
          </Link>
          <Link
            href="/workspace"
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Workspace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#C8FF00]">
            Scientific Transparency &amp; Commercial Compliance
          </p>
          <h1 className="mt-1 text-3xl font-bold text-white">Methodology, Validation &amp; Licenses</h1>
          <p className="mt-2 text-sm text-slate-400">
            Every weight, scope cap, spatial uncertainty caveat, and commercial data license behind the Barapullah screening model.
          </p>
        </div>

        {/* Live Validation Card */}
        <section
          className={`rounded-2xl border p-5 ${
            validation?.validated
              ? "border-emerald-400/35 bg-emerald-500/[0.07]"
              : "border-amber-400/35 bg-amber-500/[0.07]"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            {validation?.validated ? (
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-amber-300" />
            )}
            <span>{validation?.status_label || "Loading validation status…"}</span>
          </div>
          {validation?.source_name && (
            <p className="mt-1 text-xs text-slate-300">Source: {validation.source_name}</p>
          )}
          <p className="mt-1.5 text-xs text-slate-400">{validation?.notes}</p>

          {validation?.validated && (
            <div className="mt-4 grid grid-cols-2 gap-3 font-mono sm:grid-cols-5">
              {[
                ["ROC-AUC", String(validation.roc_auc)],
                ["PR-AUC", String(validation.pr_auc)],
                ["Top-10% Lift", `${validation.lift_top_10_pct}x`],
                ["Top-20% Hit", `${validation.hit_rate_top_20_pct}%`],
                ["Incidents", String(validation.incident_points_in_aoi)],
              ].map(([lbl, val]) => (
                <div key={lbl} className="rounded-xl border border-white/10 bg-[#080B10]/70 p-3">
                  <p className="font-sans text-[10px] text-slate-400">{lbl}</p>
                  <p className="mt-0.5 text-base font-bold text-emerald-300">{val}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {methodology && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-[#0C121A] p-5">
              <h2 className="text-sm font-bold text-white">1. Spatial Uncertainty (30m DEM)</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{methodology.spatial_uncertainty_note}</p>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[#0C121A] p-5">
              <h2 className="text-sm font-bold text-white">2. Rational Method Small-Catchment Cap</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                1-hour runoff volume (KL) and peak discharge (L/s) are strictly restricted to small individual zones
                (&le;{methodology.rational_method_max_area_ha} ha). Merged contours larger than{" "}
                {methodology.rational_method_max_area_ha} ha suppress peak discharge, and Rational Method flows are never
                aggregated across the 78 km² Barapullah basin.
              </p>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[#0C121A] p-5">
              <h2 className="text-sm font-bold text-white">3. OSM Drain Completeness Caveat</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{methodology.osm_drain_caveat}</p>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[#0C121A] p-5">
              <h2 className="text-sm font-bold text-white">
                4. What-If Stress Scenarios &amp; Display Cutoff (WSI &ge; {methodology.display_wsi_cutoff})
              </h2>
              <div className="mt-3 space-y-2 font-mono text-xs">
                {Object.entries(methodology.stress_scenarios).map(([yr, s]) => (
                  <div key={yr} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="font-bold text-white">
                      {s.label}: +{s.imp_creep}% concrete · +{Math.round((s.rain_mult - 1) * 100)}% storm · +
                      {Math.round((s.drain_decay - 1) * 100)}% drain siltation
                    </p>
                    <p className="mt-1 font-sans text-[11px] text-slate-400">{s.rationale}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[#0C121A] p-5">
              <h2 className="text-sm font-bold text-white">5. Commercial Data &amp; Basemap Licensing</h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-slate-300">
                <li>{methodology.dem_license_note}</li>
                <li>Land Cover: ESA WorldCover 10m 2021 (CC BY 4.0 — commercial use permitted with attribution).</li>
                <li>Infrastructure Vectors: &copy; OpenStreetMap contributors (ODbL 1.0).</li>
                <li>
                  Basemaps: CARTO Dark Matter (free commercial tier up to 1M tile requests/month with registered API key
                  &amp; attribution) and Esri World Imagery; supports self-hosted Protomaps/PMTiles via{" "}
                  <code className="text-cyan-300">NEXT_PUBLIC_BASEMAP_STYLE_URL</code>.
                </li>
              </ul>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
