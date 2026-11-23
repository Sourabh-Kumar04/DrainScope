"use client";

import { Info, ShieldAlert, X } from "lucide-react";
import type { MethodologyReport, ValidationReport } from "@/lib/types";

interface MethodologyModalProps {
  methodology: MethodologyReport | null;
  validation: ValidationReport | null;
  onClose: () => void;
}

export default function MethodologyModal({ methodology, validation, onClose }: MethodologyModalProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-[#0C121A] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <Info className="h-5 w-5 text-[#C8FF00]" />
            <div>
              <h2 className="text-base font-bold text-white">Methodology, Assumptions &amp; Data Licenses</h2>
              <p className="text-xs text-slate-400">
                Screening susceptibility model — transparent scope &amp; caveats
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs leading-relaxed text-slate-300">
          {/* Validation Status */}
          <div
            className={`rounded-xl border p-3.5 ${
              validation?.validated
                ? "border-emerald-400/35 bg-emerald-500/10"
                : "border-amber-400/35 bg-amber-500/10"
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-white">
              <ShieldAlert className={`h-4 w-4 ${validation?.validated ? "text-emerald-300" : "text-amber-300"}`} />
              <span>{validation?.status_label || "Unvalidated Screening Susceptibility"}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-300">{validation?.notes}</p>
            {validation?.validated && (
              <div className="mt-2.5 grid grid-cols-4 gap-2 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400">ROC-AUC:</span>{" "}
                  <strong className="text-emerald-300">{validation.roc_auc}</strong>
                </div>
                <div>
                  <span className="text-slate-400">PR-AUC:</span>{" "}
                  <strong className="text-emerald-300">{validation.pr_auc}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Top-10% Lift:</span>{" "}
                  <strong className="text-emerald-300">{validation.lift_top_10_pct}x</strong>
                </div>
                <div>
                  <span className="text-slate-400">Incidents:</span>{" "}
                  <strong className="text-white">{validation.incident_points_in_aoi}</strong>
                </div>
              </div>
            )}
          </div>

          {methodology && (
            <>
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                  1. Spatial Uncertainty (30m DEM)
                </h3>
                <p className="mt-1 text-slate-300">{methodology.spatial_uncertainty_note}</p>
              </div>

              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                  2. OSM Drain Completeness Caveat
                </h3>
                <p className="mt-1 text-slate-300">{methodology.osm_drain_caveat}</p>
              </div>

              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                  3. Rational Method Scope Cap (&le;{methodology.rational_method_max_area_ha} ha)
                </h3>
                <p className="mt-1 text-slate-300">
                  1-hour runoff volume and peak discharge (L/s) are computed strictly at small-zone scale
                  (&le;{methodology.rational_method_max_area_ha} ha) and suppressed for larger merged polygons.
                  Peak flows are never summed across the 78 km&sup2; basin.
                </p>
              </div>

              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                  4. Stress Scenarios &amp; Display Cutoff (WSI &ge; {methodology.display_wsi_cutoff})
                </h3>
                <p className="mt-1 text-slate-400">
                  +2 / +5 / +10 Yr tabs are illustrative what-if stress scenarios, not calibrated climate forecasts.
                  Zones below WSI {methodology.display_wsi_cutoff} are hidden from the contour overlay.
                </p>
                <div className="mt-2 space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 font-mono text-[11px]">
                  {Object.entries(methodology.stress_scenarios).map(([yr, s]) => (
                    <div key={yr} className="flex flex-col border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                      <span className="font-bold text-white">
                        {s.label}: +{s.imp_creep}% concrete · {Math.round((s.rain_mult - 1) * 100)}% rain ·{" "}
                        {Math.round((s.drain_decay - 1) * 100)}% drain decay
                      </span>
                      <span className="font-sans text-[10px] text-slate-400">{s.rationale}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                  5. Data &amp; Basemap Licenses
                </h3>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-300">
                  <li>{methodology.dem_license_note}</li>
                  <li>Land Cover: ESA WorldCover 10m 2021 (CC BY 4.0).</li>
                  <li>Vector Infrastructure: &copy; OpenStreetMap contributors (ODbL).</li>
                  <li>
                    Basemap: CARTO Dark Matter (free commercial tier up to 1M tiles/mo with API key &amp; attribution;
                    supports self-hosted Protomaps/PMTiles via NEXT_PUBLIC_BASEMAP_STYLE_URL).
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
