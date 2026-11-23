"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  Flame,
  Grid2x2,
  Info,
  Layers,
  MapPin,
  Satellite,
  Search,
  Share2,
  Trees,
  Waves,
} from "lucide-react";
import type { BasemapMode, DisplayMode, MetricMode, ZoneProperties } from "@/lib/types";

export interface LandmarkTarget {
  label: string;
  subtitle: string;
  lng: number;
  lat: number;
  zoom: number;
}

const BARAPULLAH_LANDMARKS: LandmarkTarget[] = [
  { label: "Moolchand Underpass", subtitle: "Ring Rd · Chronic dip", lng: 77.2342, lat: 28.5642, zoom: 15.6 },
  { label: "Chirag Delhi Crossing", subtitle: "Outer Ring Rd · Nallah", lng: 77.2286, lat: 28.5396, zoom: 15.4 },
  { label: "Lajpat Nagar Central", subtitle: "Dense concrete cover", lng: 77.2432, lat: 28.5677, zoom: 15.2 },
  { label: "Defence Colony", subtitle: "Barapullah trunk drain", lng: 77.2324, lat: 28.5733, zoom: 15.2 },
  { label: "Andrews Ganj", subtitle: "South Ex · Ring Rd", lng: 77.2266, lat: 28.5625, zoom: 15.3 },
];

interface TopBarProps {
  metric: MetricMode;
  onMetricChange: (m: MetricMode) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (d: DisplayMode) => void;
  basemap: BasemapMode;
  is3D: boolean;
  onToggle3D: () => void;
  onOpen3DFluidSim: () => void;
  onOpenStreet3D: () => void;
  onBasemapChange: (b: BasemapMode) => void;
  contourOpacity: number;
  onOpacityChange: (v: number) => void;
  showDrains: boolean;
  onToggleDrains: () => void;
  showParks: boolean;
  onToggleParks: () => void;
  showIncidents: boolean;
  onToggleIncidents: () => void;
  incidentCount: number;
  selectedZoneId: string | null;
  onBackToBasin: () => void;
  topZones: ZoneProperties[];
  onSelectZone: (zone: ZoneProperties) => void;
  onJumpLandmark: (target: LandmarkTarget) => void;
  onOpenMethodology: () => void;
  onCopyShareLink: () => void;
  copiedLink: boolean;
}

export default function TopBar({
  metric,
  onMetricChange,
  displayMode,
  onDisplayModeChange,
  basemap,
  is3D,
  onToggle3D,
  onOpen3DFluidSim,
  onOpenStreet3D,
  onBasemapChange,
  contourOpacity,
  onOpacityChange,
  showDrains,
  onToggleDrains,
  showParks,
  onToggleParks,
  showIncidents,
  onToggleIncidents,
  incidentCount,
  selectedZoneId,
  onBackToBasin,
  topZones,
  onSelectZone,
  onJumpLandmark,
  onOpenMethodology,
  onCopyShareLink,
  copiedLink,
}: TopBarProps) {
  const [jumpOpen, setJumpOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filteredZones = useMemo(() => {
    if (!q) return topZones.slice(0, 5);
    return topZones
      .filter(
        (z) =>
          z.zone_id.toLowerCase().includes(q) ||
          z.diagnosis_headline.toLowerCase().includes(q) ||
          z.nearest_drain_name.toLowerCase().includes(q) ||
          z.park_name.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [topZones, q]);

  const filteredLandmarks = useMemo(() => {
    if (!q) return BARAPULLAH_LANDMARKS;
    return BARAPULLAH_LANDMARKS.filter(
      (l) => l.label.toLowerCase().includes(q) || l.subtitle.toLowerCase().includes(q)
    );
  }, [q]);

  return (
    <div className="absolute left-4 top-4 z-20 flex flex-col gap-2">
      <div className="w-[348px] rounded-2xl border border-white/10 bg-[#0C121A]/88 p-4 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-[#C8FF00]" />
            <span className="text-xs font-bold tracking-[0.16em] text-[#C8FF00]">DRAINSCOPE</span>
          </div>
          <div className="flex items-center gap-1.5">
            {selectedZoneId && (
              <button
                onClick={onBackToBasin}
                className="flex items-center gap-1 rounded-full border border-[#C8FF00]/40 bg-[#C8FF00]/15 px-2.5 py-1 text-[11px] font-semibold text-[#DFFF66] transition hover:bg-[#C8FF00]/25"
              >
                <ArrowLeft className="h-3 w-3" />
                Basin
              </button>
            )}
            <button
              onClick={onToggle3D}
              title="Toggle 3D Volumetric Flood & Buildings View"
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                is3D
                  ? "border-[#C8FF00]/60 bg-[#C8FF00] text-[#080B10] shadow-[0_0_14px_rgba(200,255,0,0.35)]"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Box className="h-3 w-3" />
              {is3D ? "3D" : "2D"}
            </button>
            <button
              onClick={onCopyShareLink}
              title="Copy shareable scenario link"
              className="rounded-full border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-[#C8FF00]" /> : <Share2 className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setLayersOpen((v) => !v)}
              title="Basemap & Layer Opacity"
              className={`rounded-full border p-1.5 transition ${
                layersOpen
                  ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-300"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onOpenMethodology}
              title="Methodology, Assumptions & Licenses"
              className="rounded-full border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white">
              Pluvial Drainage Studio
            </h1>
            <p className="text-[11px] text-slate-400">Barapullah Sub-Catchment · 3D Terrain</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={onOpenStreet3D}
              className="rounded-xl border border-[#C8FF00]/45 bg-[#C8FF00]/15 px-2 py-1.5 text-[10px] font-bold text-[#DFFF66] transition hover:bg-[#C8FF00]/25"
            >
              Street 3D
            </button>
            <button
              onClick={onOpen3DFluidSim}
              className="rounded-xl border border-cyan-400/45 bg-cyan-400/15 px-2 py-1.5 text-[10px] font-bold text-cyan-200 transition hover:bg-cyan-400/25"
            >
              Fluid Sim
            </button>
          </div>
        </div>

        {/* Primary Controls */}
        <div className="mt-3 flex items-center gap-1.5">
          <div className="flex flex-1 rounded-full bg-white/[0.05] p-1 ring-1 ring-white/10">
            {(
              [
                { id: "ips_score", label: "Fix First" },
                { id: "wsi_score", label: "Susceptibility" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => onMetricChange(tab.id)}
                className={`flex-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-all duration-150 ${
                  metric === tab.id
                    ? "bg-[#F3F0DF] text-[#0A0F16] shadow-sm"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => onDisplayModeChange(displayMode === "contours" ? "h3" : "contours")}
            title="Switch between smoothed 30m contours and unsmoothed H3 grid"
            className={`rounded-full p-1.5 transition ${
              displayMode === "h3"
                ? "border border-[#C8FF00]/50 bg-[#C8FF00]/15 text-[#C8FF00]"
                : "border border-white/10 bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            <Grid2x2 className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={onToggleDrains}
            title="Toggle OSM Trunk Drains"
            className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
              showDrains
                ? "bg-cyan-400 text-[#06131A] shadow-[0_0_16px_rgba(34,211,238,0.4)]"
                : "border border-white/10 bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${showDrains ? "bg-[#06131A]" : "bg-cyan-400"}`} />
            Drains
          </button>

          <button
            onClick={onToggleParks}
            title="Toggle Public Parks (NbS)"
            className={`rounded-full p-1.5 transition ${
              showParks
                ? "border border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
                : "border border-white/10 bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            <Trees className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={onToggleIncidents}
            title={`Toggle Historical Incidents (${incidentCount})`}
            className={`rounded-full p-1.5 transition ${
              showIncidents
                ? "border border-amber-400/60 bg-amber-400/20 text-amber-300"
                : "border border-white/10 bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            <Flame className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Collapsible Basemap & Opacity Tray */}
        {layersOpen && (
          <div className="mt-3 space-y-2.5 border-t border-white/10 pt-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                <Satellite className="h-3.5 w-3.5 text-cyan-400" />
                Basemap Style
              </span>
              <div className="flex rounded-lg bg-white/[0.05] p-0.5 ring-1 ring-white/10">
                {(["dark", "satellite"] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => onBasemapChange(b)}
                    className={`rounded-md px-2.5 py-1 text-[10px] font-semibold capitalize transition ${
                      basemap === b ? "bg-cyan-400 text-[#06131A]" : "text-slate-300 hover:text-white"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-slate-300">Flood Overlay Opacity</span>
                <span className="font-mono text-[#C8FF00]">{Math.round(contourOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                value={Math.round(contourOpacity * 100)}
                onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
                className="w-full cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* Hotspot Quick-Jump Bar */}
      <div className="relative w-[348px]">
        <button
          onClick={() => setJumpOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#0C121A]/85 px-3.5 py-2 text-xs text-slate-200 backdrop-blur-xl shadow-xl transition hover:border-cyan-400/40"
        >
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-[#C8FF00]" />
            <span className="font-medium">Jump to Hotspot or Landmark</span>
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${jumpOpen ? "rotate-180" : ""}`}
          />
        </button>

        {jumpOpen && (
          <div className="mt-2 max-h-[320px] overflow-y-auto rounded-2xl border border-white/15 bg-[#0C121A]/95 p-3 backdrop-blur-xl shadow-2xl">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter zone ID, drain, park, or locality…"
              className="mb-2.5 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400/50"
            />

            <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-300">
              Top Critical Zones
            </p>
            <div className="space-y-1">
              {filteredZones.length === 0 ? (
                <p className="px-2 py-1 text-[11px] text-slate-500">No matching flood zones</p>
              ) : (
                filteredZones.map((z) => (
                  <button
                    key={z.zone_id}
                    onClick={() => {
                      onSelectZone(z);
                      setJumpOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.07]"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-white">{z.zone_id}</span>
                        <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-rose-300">
                          {z.risk_tier}
                        </span>
                      </div>
                      <p className="truncate text-[10px] text-slate-400">{z.diagnosis_headline}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-[#C8FF00]">
                      ~{z.est_ponding_cm}cm
                    </span>
                  </button>
                ))
              )}
            </div>

            <p className="mb-1.5 mt-3 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
              Barapullah Landmarks
            </p>
            <div className="space-y-1">
              {filteredLandmarks.map((lm) => (
                <button
                  key={lm.label}
                  onClick={() => {
                    onJumpLandmark(lm);
                    setJumpOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition hover:bg-white/[0.07]"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200">{lm.label}</p>
                    <p className="text-[10px] text-slate-400">{lm.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
