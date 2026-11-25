"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchFlowPaths,
  fetchMethodology,
  fetchOverlay,
  fetchValidation,
  simulateH3Grid,
  simulateOrganicZones,
} from "@/lib/api";
import type {
  BasemapMode,
  CatchmentSummary,
  DisplayMode,
  FlowPathItem,
  GenericFeatureCollection,
  HexFeature,
  MethodologyReport,
  MetricMode,
  MicroDrainProperties,
  ProjectionYear,
  ValidationReport,
  ZoneFeatureCollection,
  ZoneProperties,
} from "@/lib/types";
import CatchmentMap from "./CatchmentMap";
import TopBar, { type LandmarkTarget } from "./TopBar";
import KpiStrip from "./KpiStrip";
import SimulatorDock from "./SimulatorDock";
import HexInspector from "./HexInspector";
import StormPlaybackBar from "./StormPlaybackBar";
import StreetViewModal from "./StreetViewModal";
import MethodologyModal from "./MethodologyModal";
import FlowSandbox3DModal from "./FlowSandbox3DModal";
import MicroDrainEvidenceCard from "./MicroDrainEvidenceCard";
import RiskLegend from "./RiskLegend";

const SLUG = "barapullah";

function parseYear(raw: string | null): ProjectionYear {
  const n = Number(raw);
  if (n === 2 || n === 5 || n === 10) return n;
  return 0;
}

export default function CatchmentWorkspace() {
  const searchParams = useSearchParams();
  const initialRain = Math.min(150, Math.max(10, Number(searchParams.get("rain")) || 60));
  const initialYr = parseYear(searchParams.get("yr"));
  const initialNbs = Math.min(40, Math.max(0, Number(searchParams.get("nbs")) || 0));
  const initialPark = searchParams.get("park") === "1";
  const initialZoneParam = searchParams.get("zone");

  const [metric, setMetric] = useState<MetricMode>("ips_score");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("contours");
  const [basemap, setBasemap] = useState<BasemapMode>("dark");
  const [is3D, setIs3D] = useState<boolean>(true);
  const [showFlow, setShowFlow] = useState<boolean>(true);
  const [stormMinute, setStormMinute] = useState<number>(60);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [contourOpacity, setContourOpacity] = useState<number>(0.85);
  const [rainfallMmHr, setRainfallMmHr] = useState<number>(initialRain);
  const [projectionYears, setProjectionYears] = useState<ProjectionYear>(initialYr);
  const [nbsPct, setNbsPct] = useState<number>(initialNbs);
  const [parkDetention, setParkDetention] = useState<boolean>(initialPark);
  const [zoneOnlyFix, setZoneOnlyFix] = useState<boolean>(false);
  const [showDrains, setShowDrains] = useState<boolean>(true);
  const [showParks, setShowParks] = useState<boolean>(false);
  const [showIncidents, setShowIncidents] = useState<boolean>(false);
  const [showMicroDrains, setShowMicroDrains] = useState<boolean>(true);

  const [zones, setZones] = useState<ZoneFeatureCollection | null>(null);
  const [hexes, setHexes] = useState<HexFeature[]>([]);
  const [drains, setDrains] = useState<GenericFeatureCollection | null>(null);
  const [parks, setParks] = useState<GenericFeatureCollection | null>(null);
  const [underpasses, setUnderpasses] = useState<GenericFeatureCollection | null>(null);
  const [incidents, setIncidents] = useState<GenericFeatureCollection | null>(null);
  const [microDrains, setMicroDrains] = useState<GenericFeatureCollection | null>(null);
  const [selectedMicroDrain, setSelectedMicroDrain] = useState<MicroDrainProperties | null>(null);
  const [flowPaths, setFlowPaths] = useState<FlowPathItem[]>([]);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [methodology, setMethodology] = useState<MethodologyReport | null>(null);
  const [summary, setSummary] = useState<CatchmentSummary | null>(null);
  const [selectedZone, setSelectedZone] = useState<ZoneProperties | null>(null);
  const [pendingZoneId, setPendingZoneId] = useState<string | null>(initialZoneParam);
  const [flyTarget, setFlyTarget] = useState<LandmarkTarget | null>(null);
  const [streetViewOpen, setStreetViewOpen] = useState<boolean>(false);
  const [sandboxOpen, setSandboxOpen] = useState<boolean>(false);
  const [methodologyOpen, setMethodologyOpen] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const selectedZoneId = selectedZone?.zone_id ?? null;

  const topZones = useMemo(() => {
    if (!zones) return [];
    return [...zones.features]
      .map((f) => f.properties)
      .sort((a, b) => b[metric] - a[metric]);
  }, [zones, metric]);

  // 0 -> 60 min rising flood playback timer
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      setStormMinute((prev) => (prev >= 60 ? 0 : prev + 1));
    }, 160);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (sandboxOpen) setSandboxOpen(false);
        else if (methodologyOpen) setMethodologyOpen(false);
        else if (streetViewOpen) setStreetViewOpen(false);
        else if (selectedZoneId) {
          setSelectedZone(null);
          setZoneOnlyFix(false);
          setFlyTarget(null);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sandboxOpen, methodologyOpen, streetViewOpen, selectedZoneId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchOverlay(SLUG, "drains", controller.signal).then(setDrains).catch(() => {});
    fetchOverlay(SLUG, "parks", controller.signal).then(setParks).catch(() => {});
    fetchOverlay(SLUG, "underpasses", controller.signal).then(setUnderpasses).catch(() => {});
    fetchOverlay(SLUG, "incidents", controller.signal).then(setIncidents).catch(() => {});
    fetchOverlay(SLUG, "micro-drains", controller.signal).then(setMicroDrains).catch(() => {});
    fetchFlowPaths(SLUG, controller.signal).then((r) => setFlowPaths(r.paths)).catch(() => {});
    fetchValidation(SLUG, controller.signal).then(setValidation).catch(() => {});
    fetchMethodology(SLUG, controller.signal).then(setMethodology).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = {
      rainfall_mm_hr: rainfallMmHr,
      projection_years: projectionYears,
      nbs_impervious_reduction_pct: nbsPct,
      park_detention_enabled: parkDetention,
      target_zone_ids: zoneOnlyFix && selectedZoneId ? [selectedZoneId] : null,
    };

    const req =
      displayMode === "h3"
        ? simulateH3Grid(SLUG, params, controller.signal).then((data) => {
            setHexes(data.hexes);
            setSummary(data.summary);
            setError(null);
          })
        : simulateOrganicZones(SLUG, params, controller.signal).then((data) => {
            setZones(data.zones_geojson);
            setSummary(data.summary);
            setError(null);
            if (pendingZoneId) {
              const hit = data.zones_geojson.features.find((f) => f.properties.zone_id === pendingZoneId)?.properties;
              if (hit) setSelectedZone(hit);
              setPendingZoneId(null);
            } else {
              setSelectedZone((prev) =>
                prev
                  ? data.zones_geojson.features.find((f) => f.properties.zone_id === prev.zone_id)?.properties ?? null
                  : null
              );
            }
          });

    req
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [displayMode, rainfallMmHr, projectionYears, nbsPct, parkDetention, zoneOnlyFix, selectedZoneId, pendingZoneId]);

  const handleCopyShareLink = () => {
    const qs = new URLSearchParams();
    qs.set("rain", String(rainfallMmHr));
    qs.set("yr", String(projectionYears));
    qs.set("nbs", String(nbsPct));
    if (parkDetention) qs.set("park", "1");
    if (selectedZoneId) qs.set("zone", selectedZoneId);
    const url = `${window.location.origin}/workspace?${qs.toString()}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  return (
    <div className="relative h-screen flex-1 overflow-hidden bg-[#0B1018]">
      <CatchmentMap
        zones={zones}
        hexes={hexes}
        drains={drains}
        parks={parks}
        underpasses={underpasses}
        incidents={incidents}
        microDrains={microDrains}
        flowPaths={flowPaths}
        metric={metric}
        displayMode={displayMode}
        basemap={basemap}
        is3D={is3D}
        showFlow={showFlow}
        stormMinute={stormMinute}
        rainfallMmHr={rainfallMmHr}
        contourOpacity={contourOpacity}
        showDrains={showDrains}
        showParks={showParks}
        showIncidents={showIncidents}
        showMicroDrains={showMicroDrains}
        selectedZone={selectedZone}
        flyTarget={flyTarget}
        onSelectZone={(z) => {
          setFlyTarget(null);
          setSelectedMicroDrain(null);
          setSelectedZone(z);
        }}
        onSelectMicroDrain={(d) => {
          setSelectedZone(null);
          setSelectedMicroDrain(d);
        }}
      />

      <TopBar
        metric={metric}
        onMetricChange={setMetric}
        displayMode={displayMode}
        onDisplayModeChange={(m) => {
          setDisplayMode(m);
          if (m === "h3") setSelectedZone(null);
        }}
        basemap={basemap}
        onBasemapChange={setBasemap}
        is3D={is3D}
        onToggle3D={() => setIs3D((v) => !v)}
        onOpen3DFluidSim={() => {
          if (!selectedZone && topZones.length > 0) setSelectedZone(topZones[0]);
          setSandboxOpen(true);
        }}
        onOpenStreet3D={() => {
          if (!selectedZone && topZones.length > 0) setSelectedZone(topZones[0]);
          setStreetViewOpen(true);
        }}
        contourOpacity={contourOpacity}
        onOpacityChange={setContourOpacity}
        showDrains={showDrains}
        onToggleDrains={() => setShowDrains((v) => !v)}
        showParks={showParks}
        onToggleParks={() => setShowParks((v) => !v)}
        showIncidents={showIncidents}
        onToggleIncidents={() => setShowIncidents((v) => !v)}
        incidentCount={incidents?.features.length ?? 0}
        showMicroDrains={showMicroDrains}
        onToggleMicroDrains={() => setShowMicroDrains((v) => !v)}
        microDrainCount={microDrains?.features.length ?? 0}
        selectedZoneId={selectedZoneId}
        onBackToBasin={() => {
          setSelectedZone(null);
          setZoneOnlyFix(false);
          setStreetViewOpen(false);
          setSandboxOpen(false);
          setFlyTarget(null);
        }}
        topZones={topZones}
        onSelectZone={(z) => {
          setDisplayMode("contours");
          setFlyTarget(null);
          setSelectedZone(z);
        }}
        onJumpLandmark={(lm) => {
          setSelectedZone(null);
          setZoneOnlyFix(false);
          setFlyTarget(lm);
        }}
        onOpenMethodology={() => setMethodologyOpen(true)}
        onCopyShareLink={handleCopyShareLink}
        copiedLink={copiedLink}
      />

      <KpiStrip summary={summary} loading={loading} />

      <SimulatorDock
        rainfallMmHr={rainfallMmHr}
        onRainfallChange={setRainfallMmHr}
        projectionYears={projectionYears}
        onProjectionChange={setProjectionYears}
        nbsPct={nbsPct}
        onNbsPctChange={setNbsPct}
        parkDetention={parkDetention}
        onToggleParkDetention={() => setParkDetention((v) => !v)}
        zoneOnlyFix={zoneOnlyFix}
        selectedZoneId={selectedZoneId}
        onReset={() => {
          setRainfallMmHr(60);
          setProjectionYears(0);
          setNbsPct(0);
          setParkDetention(false);
          setZoneOnlyFix(false);
        }}
        onOpenMethodology={() => setMethodologyOpen(true)}
        loading={loading}
      />

      <StormPlaybackBar
        stormMinute={stormMinute}
        onMinuteChange={(m) => {
          setIsPlaying(false);
          setStormMinute(m);
        }}
        isPlaying={isPlaying}
        onTogglePlay={() => {
          setIsPlaying((prev) => {
            if (!prev && stormMinute >= 60) setStormMinute(0);
            return !prev;
          });
        }}
        showFlow={showFlow}
        onToggleFlow={() => setShowFlow((v) => !v)}
        is3D={is3D}
        rainfallMmHr={rainfallMmHr}
      />

      {!selectedZone && !selectedMicroDrain && <RiskLegend />}

      {selectedMicroDrain && (
        <MicroDrainEvidenceCard
          drain={selectedMicroDrain}
          onClose={() => setSelectedMicroDrain(null)}
        />
      )}

      {selectedZone && displayMode === "contours" && (
        <HexInspector
          zone={selectedZone}
          zoneOnlyFix={zoneOnlyFix}
          onToggleZoneOnlyFix={() => setZoneOnlyFix((v) => !v)}
          onOpenStreetView={() => setStreetViewOpen(true)}
          onOpen3DSandbox={() => setSandboxOpen(true)}
          onClose={() => {
            setSelectedZone(null);
            setZoneOnlyFix(false);
          }}
        />
      )}

      {streetViewOpen && selectedZone && (
        <StreetViewModal zone={selectedZone} onClose={() => setStreetViewOpen(false)} />
      )}

      {sandboxOpen && selectedZone && (
        <FlowSandbox3DModal
          zone={selectedZone}
          initialRainfallMmHr={rainfallMmHr}
          onClose={() => setSandboxOpen(false)}
        />
      )}

      {methodologyOpen && (
        <MethodologyModal
          methodology={methodology}
          validation={validation}
          onClose={() => setMethodologyOpen(false)}
        />
      )}

      {error && (
        <div className="absolute left-1/2 top-16 z-30 max-w-lg -translate-x-1/2 rounded-md border border-rose-500/40 bg-[#1F1216] px-4 py-2 text-xs text-rose-200 shadow-md">
          {error}
        </div>
      )}
    </div>
  );
}
