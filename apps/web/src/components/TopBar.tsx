"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  Eye,
  Info,
  Layers,
  MapPin,
  Search,
  Share2,
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
  showMicroDrains?: boolean;
  onToggleMicroDrains?: () => void;
  microDrainCount?: number;
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
  showMicroDrains = true,
  onToggleMicroDrains,
  microDrainCount = 0,
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
    <header className="absolute inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-[#263445] bg-[#0B1018] px-4">
      {/* Left: Brand & Catchment Context */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-[0.12em] text-[#E5E7EB]">DRAINSCOPE</span>
          <span className="text-[#263445]">/</span>
          <span className="truncate text-xs font-medium text-[#94A3B8]">
            Barapullah Sub-Catchment · South Delhi
          </span>
        </div>
        <span className="hidden items-center gap-1.5 rounded border border-[#263445] bg-[#151D29] px-2 py-0.5 font-mono text-[10px] text-[#94A3B8] lg:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          30m DEM · Open Data
        </span>
        {selectedZoneId && (
          <button
            onClick={onBackToBasin}
            className="flex items-center gap-1 rounded border border-[#263445] bg-[#151D29] px-2 py-1 text-[11px] font-medium text-[#E5E7EB] transition hover:border-[#22C5E5] hover:text-[#22C5E5]"
          >
            <ArrowLeft className="h-3 w-3" />
            Basin View
          </button>
        )}
      </div>

      {/* Center: Search by Zone, Hotspot, or Landmark */}
      <div className="relative mx-3 hidden w-full max-w-[300px] md:block">
        <div className="flex items-center gap-2 rounded-md border border-[#263445] bg-[#111925] px-2.5 py-1.5 text-xs focus-within:border-[#22C5E5]">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
          <input
            type="text"
            value={query}
            onFocus={() => {
              setJumpOpen(true);
              setLayersOpen(false);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setJumpOpen(true);
            }}
            placeholder="Search zone ID, drain, or landmark..."
            className="w-full bg-transparent text-xs text-[#E5E7EB] placeholder-[#64748B] outline-none"
          />
          <button
            onClick={() => {
              setJumpOpen((v) => !v);
              setLayersOpen(false);
            }}
            className="text-[#94A3B8] hover:text-[#E5E7EB]"
            aria-label="Toggle search dropdown"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {jumpOpen && (
          <div className="absolute left-0 top-10 z-50 w-full rounded-md border border-[#263445] bg-[#111925] p-2 shadow-xl">
            <div className="mb-1 flex items-center justify-between px-2 py-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Priority Zones
              </span>
              <button
                onClick={() => setJumpOpen(false)}
                className="text-[10px] text-[#94A3B8] hover:text-[#E5E7EB]"
              >
                Close
              </button>
            </div>
            <div className="space-y-0.5">
              {filteredZones.map((z) => (
                <button
                  key={z.zone_id}
                  onClick={() => {
                    onSelectZone(z);
                    setJumpOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition hover:bg-[#151D29]"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-mono font-semibold text-[#E5E7EB]">{z.zone_id}</span>
                    <p className="truncate text-[10px] text-[#94A3B8]">{z.diagnosis_headline}</p>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-[10px] font-semibold ${
                      z.risk_tier === "Critical"
                        ? "text-[#F87171]"
                        : z.risk_tier === "High"
                        ? "text-[#FBBF24]"
                        : "text-[#22C5E5]"
                    }`}
                  >
                    {z.risk_tier}
                  </span>
                </button>
              ))}
            </div>

            {filteredLandmarks.length > 0 && (
              <>
                <div className="my-1.5 h-px bg-[#263445]" />
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Corridor Landmarks
                </p>
                <div className="space-y-0.5">
                  {filteredLandmarks.map((lm) => (
                    <button
                      key={lm.label}
                      onClick={() => {
                        onJumpLandmark(lm);
                        setJumpOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition hover:bg-[#151D29]"
                    >
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-[#22C5E5]" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[#E5E7EB]">{lm.label}</p>
                        <p className="truncate text-[10px] text-[#94A3B8]">{lm.subtitle}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right: Map Controls & Actions */}
      <div className="relative flex items-center gap-1.5">
        <button
          onClick={onToggle3D}
          title="Toggle 2D / 3D Terrain"
          className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
            is3D
              ? "border-[#22C5E5]/60 bg-[#22C5E5]/15 text-[#22C5E5]"
              : "border-[#263445] bg-[#151D29] text-[#94A3B8] hover:text-[#E5E7EB]"
          }`}
        >
          <Box className="h-3.5 w-3.5" />
          {is3D ? "3D" : "2D"}
        </button>

        <button
          onClick={() => {
            setLayersOpen((v) => !v);
            setJumpOpen(false);
          }}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
            layersOpen
              ? "border-[#22C5E5] bg-[#151D29] text-[#22C5E5]"
              : "border-[#263445] bg-[#151D29] text-[#E5E7EB] hover:border-[#384c63]"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Layers
        </button>

        <button
          onClick={onOpenStreet3D}
          title="Open Street-Level Flood Depth Viewer"
          className="hidden items-center gap-1.5 rounded-md border border-[#263445] bg-[#151D29] px-2.5 py-1 text-[11px] font-medium text-[#E5E7EB] transition hover:border-[#22C5E5] hover:text-[#22C5E5] sm:flex"
        >
          <Eye className="h-3.5 w-3.5" />
          Street 3D
        </button>

        <button
          onClick={onOpen3DFluidSim}
          title="Open 3D Terrain Fluid Sandbox"
          className="hidden items-center gap-1.5 rounded-md border border-[#263445] bg-[#151D29] px-2.5 py-1 text-[11px] font-medium text-[#E5E7EB] transition hover:border-[#22C5E5] hover:text-[#22C5E5] lg:flex"
        >
          <Waves className="h-3.5 w-3.5" />
          Fluid Sim
        </button>

        <div className="mx-0.5 h-4 w-px bg-[#263445]" />

        <button
          onClick={onOpenMethodology}
          title="Data Provenance & Methodology"
          className="rounded-md border border-transparent p-1.5 text-[#94A3B8] transition hover:border-[#263445] hover:bg-[#151D29] hover:text-[#E5E7EB]"
        >
          <Info className="h-4 w-4" />
        </button>

        <button
          onClick={onCopyShareLink}
          title="Copy Shareable Scenario URL"
          className="flex items-center gap-1 rounded-md border border-[#263445] bg-[#151D29] px-2.5 py-1 text-[11px] font-medium text-[#E5E7EB] transition hover:border-[#22C5E5] hover:text-[#22C5E5]"
        >
          {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Share2 className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{copiedLink ? "Copied" : "Share"}</span>
        </button>

        {/* Layers & Display Popover */}
        {layersOpen && (
          <div className="absolute right-0 top-10 z-50 w-[290px] rounded-md border border-[#263445] bg-[#111925] p-3.5 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-[#263445] pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#E5E7EB]">
                Map Layers &amp; Display
              </span>
              <button
                onClick={() => setLayersOpen(false)}
                className="text-[10px] text-[#94A3B8] hover:text-[#E5E7EB]"
              >
                Done
              </button>
            </div>

            {/* Metric Mode */}
            <div className="mb-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Scoring Metric
              </p>
              <div className="grid grid-cols-2 gap-1 rounded bg-[#0B1018] p-1">
                <button
                  onClick={() => onMetricChange("ips_score")}
                  className={`rounded py-1 text-[11px] font-medium transition ${
                    metric === "ips_score" ? "bg-[#151D29] text-[#22C5E5]" : "text-[#94A3B8] hover:text-[#E5E7EB]"
                  }`}
                >
                  Fix First (IPS)
                </button>
                <button
                  onClick={() => onMetricChange("wsi_score")}
                  className={`rounded py-1 text-[11px] font-medium transition ${
                    metric === "wsi_score" ? "bg-[#151D29] text-[#22C5E5]" : "text-[#94A3B8] hover:text-[#E5E7EB]"
                  }`}
                >
                  Susceptibility
                </button>
              </div>
            </div>

            {/* Geometry & Basemap */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Surface</p>
                <div className="grid grid-cols-2 gap-1 rounded bg-[#0B1018] p-0.5">
                  <button
                    onClick={() => onDisplayModeChange("contours")}
                    className={`rounded py-1 text-[10px] font-medium ${
                      displayMode === "contours" ? "bg-[#151D29] text-[#E5E7EB]" : "text-[#94A3B8]"
                    }`}
                  >
                    Zones
                  </button>
                  <button
                    onClick={() => onDisplayModeChange("h3")}
                    className={`rounded py-1 text-[10px] font-medium ${
                      displayMode === "h3" ? "bg-[#151D29] text-[#E5E7EB]" : "text-[#94A3B8]"
                    }`}
                  >
                    H3 Grid
                  </button>
                </div>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Basemap</p>
                <div className="grid grid-cols-2 gap-1 rounded bg-[#0B1018] p-0.5">
                  <button
                    onClick={() => onBasemapChange("dark")}
                    className={`rounded py-1 text-[10px] font-medium ${
                      basemap === "dark" ? "bg-[#151D29] text-[#E5E7EB]" : "text-[#94A3B8]"
                    }`}
                  >
                    Vector
                  </button>
                  <button
                    onClick={() => onBasemapChange("satellite")}
                    className={`rounded py-1 text-[10px] font-medium ${
                      basemap === "satellite" ? "bg-[#151D29] text-[#E5E7EB]" : "text-[#94A3B8]"
                    }`}
                  >
                    Satellite
                  </button>
                </div>
              </div>
            </div>

            {/* Opacity Slider */}
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-[#94A3B8]">Flood Layer Opacity</span>
                <span className="font-mono tabular-nums text-[#E5E7EB]">{Math.round(contourOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1.0}
                step={0.05}
                value={contourOpacity}
                onChange={(e) => onOpacityChange(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            {/* Overlay Toggles */}
            <div className="space-y-1.5 border-t border-[#263445] pt-2.5 text-xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Overlays</p>
              {[
                { label: "OSM Trunk Drains", active: showDrains, onClick: onToggleDrains, dot: "bg-[#22C5E5]" },
                {
                  label: `Street-Mapped Inlets (${microDrainCount})`,
                  active: showMicroDrains,
                  onClick: onToggleMicroDrains,
                  dot: "bg-emerald-400",
                  hidden: !onToggleMicroDrains || microDrainCount === 0,
                },
                { label: "Parks & NbS Detention", active: showParks, onClick: onToggleParks, dot: "bg-emerald-500" },
                {
                  label: `Historical Incidents (${incidentCount})`,
                  active: showIncidents,
                  onClick: onToggleIncidents,
                  dot: "bg-[#FBBF24]",
                },
              ]
                .filter((i) => !i.hidden)
                .map((item) => (
                  <button
                    key={item.label}
                    onClick={item.onClick}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition hover:bg-[#151D29]"
                  >
                    <span className="flex items-center gap-2 text-[#E5E7EB]">
                      <span className={`h-2 w-2 rounded-full ${item.active ? item.dot : "bg-[#384c63]"}`} />
                      {item.label}
                    </span>
                    <span className={`font-mono text-[10px] ${item.active ? "text-[#22C5E5]" : "text-[#64748B]"}`}>
                      {item.active ? "ON" : "OFF"}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
