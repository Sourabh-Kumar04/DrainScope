"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Layer } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type {
  BasemapMode,
  DisplayMode,
  FlowPathItem,
  GenericFeatureCollection,
  HexFeature,
  MetricMode,
  MicroDrainProperties,
  ZoneFeatureCollection,
  ZoneProperties,
} from "@/lib/types";
import type { LandmarkTarget } from "./TopBar";

interface CatchmentMapProps {
  zones: ZoneFeatureCollection | null;
  hexes: HexFeature[];
  drains: GenericFeatureCollection | null;
  parks: GenericFeatureCollection | null;
  underpasses: GenericFeatureCollection | null;
  incidents: GenericFeatureCollection | null;
  microDrains: GenericFeatureCollection | null;
  flowPaths: FlowPathItem[];
  metric: MetricMode;
  displayMode: DisplayMode;
  basemap: BasemapMode;
  is3D: boolean;
  showFlow: boolean;
  stormMinute: number;
  rainfallMmHr: number;
  contourOpacity: number;
  showDrains: boolean;
  showParks: boolean;
  showIncidents: boolean;
  showMicroDrains: boolean;
  selectedZone: ZoneProperties | null;
  flyTarget: LandmarkTarget | null;
  onSelectZone: (zone: ZoneProperties) => void;
  onSelectMicroDrain?: (drain: MicroDrainProperties) => void;
}

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

function resolveBasemapStyle(mode: BasemapMode): string | StyleSpecification {
  if (mode === "satellite") {
    return {
      version: 8,
      sources: {
        esri_imagery: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
        },
      },
      layers: [{ id: "esri-imagery-layer", type: "raster", source: "esri_imagery" }],
    };
  }
  const custom = process.env.NEXT_PUBLIC_BASEMAP_STYLE_URL;
  if (custom) return custom;
  const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
  const base = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
  return cartoKey ? `${base}?api_key=${encodeURIComponent(cartoKey)}` : base;
}

function sampleSubPath(coords: [number, number][], tStart: number, tEnd: number): [number, number][] {
  const n = coords.length;
  if (n < 2) return coords;
  const maxIdx = n - 1;
  const interp = (t: number): [number, number] => {
    const clamped = Math.max(0, Math.min(1, t));
    const f = clamped * maxIdx;
    const i = Math.min(maxIdx - 1, Math.floor(f));
    const frac = f - i;
    const a = coords[i];
    const b = coords[i + 1];
    return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
  };

  const out: [number, number][] = [interp(tStart)];
  const startIdx = Math.ceil(tStart * maxIdx);
  const endIdx = Math.floor(tEnd * maxIdx);
  for (let i = startIdx; i <= endIdx; i++) {
    if (i > 0 && i < maxIdx) out.push(coords[i]);
  }
  out.push(interp(tEnd));
  return out;
}

function buildFlowBedsFC(paths: FlowPathItem[]): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: paths.map((p) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: p.path },
      properties: { id: p.id, kind: p.kind, intensity: p.intensity },
    })),
  };
}

function buildFlowPulsesFC(paths: FlowPathItem[], phase: number): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  const tailLen = 0.24;
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    if (p.path.length < 2) continue;
    const offset = (i * 0.371) % 1.0;
    const head = (phase + offset) % 1.0;
    const tail = Math.max(0, head - tailLen);
    if (head - tail < 0.03) continue;
    const seg = sampleSubPath(p.path, tail, head);
    if (seg.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: seg },
        properties: { kind: p.kind },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

function buildSelectionOverlay(
  zone: ZoneProperties | null,
  stormProgress: number
): { lines: FeatureCollection<LineString>; points: FeatureCollection<Point> } {
  if (!zone) {
    return {
      lines: { type: "FeatureCollection", features: [] },
      points: { type: "FeatureCollection", features: [] },
    };
  }
  const origin: [number, number] = [zone.centroid_lng, zone.centroid_lat];
  const lines: Feature<LineString>[] = [];
  const points: Feature<Point>[] = [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: origin },
      properties: { color: "#F8FAFC", label: `~${Math.round(zone.est_ponding_cm * stormProgress)} cm` },
    },
  ];

  if (zone.nearest_drain_coord) {
    lines.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [origin, zone.nearest_drain_coord] },
      properties: { color: "#22D3EE" },
    });
    points.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: zone.nearest_drain_coord },
      properties: { color: "#22D3EE", label: `${zone.nearest_drain_name} (${zone.nearest_drain_m}m)` },
    });
  }

  if (zone.nearest_park_coord && zone.park_name !== "None mapped") {
    lines.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [origin, zone.nearest_park_coord] },
      properties: { color: "#34D399" },
    });
    points.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: zone.nearest_park_coord },
      properties: { color: "#34D399", label: `${zone.park_name} (${zone.nearest_park_m}m)` },
    });
  }

  return {
    lines: { type: "FeatureCollection", features: lines },
    points: { type: "FeatureCollection", features: points },
  };
}

function hexFillColor(v: number, opacity: number): [number, number, number, number] {
  if (v >= 0.68) return [244, 63, 94, Math.round(185 * opacity)];
  if (v >= 0.52) return [14, 165, 233, Math.round(160 * opacity)];
  if (v >= 0.35) return [56, 189, 248, Math.round(110 * opacity)];
  return [16, 185, 129, Math.round(35 * opacity)];
}

export default function CatchmentMap({
  zones,
  hexes,
  drains,
  parks,
  underpasses,
  incidents,
  microDrains,
  flowPaths,
  metric,
  displayMode,
  basemap,
  is3D,
  showFlow,
  stormMinute,
  rainfallMmHr,
  contourOpacity,
  showDrains,
  showParks,
  showIncidents,
  showMicroDrains,
  selectedZone,
  flyTarget,
  onSelectZone,
  onSelectMicroDrain,
}: CatchmentMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const basemapInitRef = useRef<BasemapMode>(basemap);

  const [styleVersion, setStyleVersion] = useState<number>(0);

  const is3DRef = useRef(is3D);
  is3DRef.current = is3D;
  const displayModeRef = useRef(displayMode);
  displayModeRef.current = displayMode;
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const drainsRef = useRef(drains);
  drainsRef.current = drains;
  const parksRef = useRef(parks);
  parksRef.current = parks;
  const underpassesRef = useRef(underpasses);
  underpassesRef.current = underpasses;
  const incidentsRef = useRef(incidents);
  incidentsRef.current = incidents;
  const microDrainsRef = useRef(microDrains);
  microDrainsRef.current = microDrains;
  const flowPathsRef = useRef(flowPaths);
  flowPathsRef.current = flowPaths;
  const rainfallRef = useRef(rainfallMmHr);
  rainfallRef.current = rainfallMmHr;
  const selectedZoneRef = useRef(selectedZone);
  selectedZoneRef.current = selectedZone;
  const onSelectZoneRef = useRef(onSelectZone);
  onSelectZoneRef.current = onSelectZone;
  const onSelectMicroDrainRef = useRef(onSelectMicroDrain);
  onSelectMicroDrainRef.current = onSelectMicroDrain;

  const microDrainsByIdRef = useRef<Map<string, MicroDrainProperties>>(new Map());
  useEffect(() => {
    const m = new Map<string, MicroDrainProperties>();
    if (microDrains) {
      for (const f of microDrains.features) {
        const p = f.properties as unknown as MicroDrainProperties | undefined;
        if (p?.id) m.set(p.id, p);
      }
    }
    microDrainsByIdRef.current = m;
  }, [microDrains]);

  const zonesByIdRef = useRef<Map<string, ZoneProperties>>(new Map());
  useEffect(() => {
    const m = new Map<string, ZoneProperties>();
    if (zones) {
      for (const f of zones.features) {
        m.set(f.properties.zone_id, f.properties);
      }
    }
    zonesByIdRef.current = m;
  }, [zones]);

  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; zone: ZoneProperties } | null>(null);
  const selectedZoneId = selectedZone?.zone_id ?? null;
  const stormProgress = Math.max(0.08, Math.min(1.0, stormMinute / 60.0));

  const installNative3DLayers = (map: maplibregl.Map) => {
    // Find first symbol (label) layer so draped floodwater & 3D buildings sit cleanly BELOW road/place labels
    const styleLayers = map.getStyle()?.layers ?? [];
    const firstSymbolId = styleLayers.find((l) => l.type === "symbol")?.id;

    // 0. Directional Lighting + Atmospheric Sky/Fog for realistic 3D building depth
    try {
      map.setLight({
        anchor: "viewport",
        color: "#e2e8f0",
        intensity: 0.55,
        position: [1.5, 195, 38],
      });
    } catch {
      // ignore
    }
    try {
      if (typeof (map as unknown as { setSky?: (s: Record<string, unknown>) => void }).setSky === "function") {
        (map as unknown as { setSky: (s: Record<string, unknown>) => void }).setSky({
          "sky-color": "#090f1a",
          "sky-horizon-blend": 0.45,
          "horizon-color": "#111c2d",
          "horizon-fog-blend": 0.65,
          "fog-color": "#0b1220",
          "fog-ground-blend": 0.35,
        });
      }
    } catch {
      // ignore if unsupported
    }

    // 1. Dedicated 3D Terrain DEM source (SEPARATE from hillshade to avoid MapLibre v4 black-canvas bug)
    try {
      if (!map.getSource("aws-terrarium-terrain")) {
        map.addSource("aws-terrarium-terrain", {
          type: "raster-dem",
          tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
          tileSize: 256,
          encoding: "terrarium",
          maxzoom: 14,
        });
      }
      if (!map.getSource("aws-terrarium-hillshade")) {
        map.addSource("aws-terrarium-hillshade", {
          type: "raster-dem",
          tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
          tileSize: 256,
          encoding: "terrarium",
          maxzoom: 14,
        });
      }
      if (!map.getLayer("terrain-hillshade")) {
        map.addLayer(
          {
            id: "terrain-hillshade",
            type: "hillshade",
            source: "aws-terrarium-hillshade",
            paint: {
              "hillshade-exaggeration": 0.32,
              "hillshade-shadow-color": "#020617",
              "hillshade-highlight-color": "#38bdf8",
              "hillshade-accent-color": "#0f172a",
            },
          },
          firstSymbolId
        );
      }
    } catch {
      // ignore
    }

    // 2. Parks (NbS) — draped on terrain
    if (!map.getSource("ds-parks")) {
      map.addSource("ds-parks", { type: "geojson", data: (parksRef.current ?? EMPTY_FC) as FeatureCollection });
      map.addLayer(
        {
          id: "ds-parks-fill",
          type: "fill",
          source: "ds-parks",
          paint: { "fill-color": "#10b981", "fill-opacity": 0.2 },
        },
        firstSymbolId
      );
      map.addLayer(
        {
          id: "ds-parks-outline",
          type: "line",
          source: "ds-parks",
          paint: { "line-color": "#34d399", "line-width": 1.1, "line-opacity": 0.55 },
        },
        firstSymbolId
      );
    }

    // 3. Draped, Feathered Floodwater (SCALGO Live style — sits UNDER 3D buildings, never blocky)
    if (!map.getSource("ds-zones")) {
      map.addSource("ds-zones", { type: "geojson", data: (zonesRef.current ?? EMPTY_FC) as FeatureCollection });
      map.addLayer(
        {
          id: "ds-zones-fill",
          type: "fill",
          source: "ds-zones",
          paint: {
            "fill-color": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "est_ponding_cm"], 20],
              10,
              "#38bdf8",
              30,
              "#0284c7",
              55,
              "#2563eb",
              80,
              "#e11d48",
            ],
            "fill-opacity": 0.56,
          },
        },
        firstSymbolId
      );
      map.addLayer(
        {
          id: "ds-zones-feather",
          type: "line",
          source: "ds-zones",
          paint: {
            "line-color": [
              "match",
              ["get", "risk_tier"],
              "Critical",
              "#fb7185",
              "High",
              "#38bdf8",
              "#7dd3fc",
            ],
            "line-width": 4.5,
            "line-blur": 4,
            "line-opacity": 0.48,
          },
        },
        firstSymbolId
      );
      map.addLayer(
        {
          id: "ds-zones-selected-outline",
          type: "line",
          source: "ds-zones",
          filter: ["==", ["get", "zone_id"], "__none__"],
          paint: { "line-color": "#F8FAFC", "line-width": 2.2 },
        },
        firstSymbolId
      );
    }

    // 4. OSM Trunk Drains (sleek hydro channel)
    if (!map.getSource("ds-drains")) {
      map.addSource("ds-drains", { type: "geojson", data: (drainsRef.current ?? EMPTY_FC) as FeatureCollection });
      map.addLayer(
        {
          id: "ds-drains-glow",
          type: "line",
          source: "ds-drains",
          paint: { "line-color": "#0ea5e9", "line-width": 4.5, "line-opacity": 0.28, "line-blur": 2.5 },
        },
        firstSymbolId
      );
      map.addLayer(
        {
          id: "ds-drains-core",
          type: "line",
          source: "ds-drains",
          paint: { "line-color": "#38bdf8", "line-width": 1.6, "line-opacity": 0.9 },
        },
        firstSymbolId
      );
    }

    // 5. Sleek Velocity Streamlines (Road + DEM Overland + Drain currents)
    if (!map.getSource("ds-flow-beds")) {
      map.addSource("ds-flow-beds", { type: "geojson", data: buildFlowBedsFC(flowPathsRef.current) });
      map.addLayer(
        {
          id: "ds-flow-beds-line",
          type: "line",
          source: "ds-flow-beds",
          paint: {
            "line-color": ["match", ["get", "kind"], "road", "#0ea5e9", "drain", "#38bdf8", "#7dd3fc"],
            "line-width": ["match", ["get", "kind"], "road", 1.8, 1.1],
            "line-opacity": ["match", ["get", "kind"], "road", 0.24, 0.16],
          },
        },
        firstSymbolId
      );
    }
    if (!map.getSource("ds-flow-pulses")) {
      map.addSource("ds-flow-pulses", { type: "geojson", data: buildFlowPulsesFC(flowPathsRef.current, 0) });
      map.addLayer(
        {
          id: "ds-flow-pulses-glow",
          type: "line",
          source: "ds-flow-pulses",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["match", ["get", "kind"], "road", "#0284c7", "drain", "#38bdf8", "#7dd3fc"],
            "line-width": ["match", ["get", "kind"], "road", 5.2, 4.2],
            "line-opacity": 0.36,
            "line-blur": 2.2,
          },
        },
        firstSymbolId
      );
      map.addLayer(
        {
          id: "ds-flow-pulses-core",
          type: "line",
          source: "ds-flow-pulses",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["match", ["get", "kind"], "road", "#bae6fd", "drain", "#e0f2fe", "#e0f2fe"],
            "line-width": ["match", ["get", "kind"], "road", 2.1, 1.7],
            "line-opacity": 0.95,
          },
        },
        firstSymbolId
      );
    }

    // 6. Lit 3D OSM Buildings (inserted AFTER floodwater & BEFORE labels so buildings rise cleanly out of water)
    try {
      if (!map.getSource("openfreemap")) {
        map.addSource("openfreemap", {
          type: "vector",
          url: "https://tiles.openfreemap.org/planet",
        });
      }
      if (!map.getLayer("drainscope-3d-buildings")) {
        map.addLayer(
          {
            id: "drainscope-3d-buildings",
            source: "openfreemap",
            "source-layer": "building",
            type: "fill-extrusion",
            minzoom: 12,
            paint: {
              "fill-extrusion-color": [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "render_height"], 10],
                0,
                "#334155",
                18,
                "#475569",
                40,
                "#64748b",
                70,
                "#94a3b8",
              ],
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], 12],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.88,
              "fill-extrusion-vertical-gradient": true,
            },
          },
          firstSymbolId
        );
      }
    } catch {
      // ignore
    }

    // 7. Underpasses & Historical Incidents (above buildings so markers stay clickable/visible)
    if (!map.getSource("ds-underpasses")) {
      map.addSource("ds-underpasses", {
        type: "geojson",
        data: (underpassesRef.current ?? EMPTY_FC) as FeatureCollection,
      });
      map.addLayer({
        id: "ds-underpasses-pts",
        type: "circle",
        source: "ds-underpasses",
        paint: {
          "circle-radius": 4.5,
          "circle-color": "#fb7185",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
    if (!map.getSource("ds-incidents")) {
      map.addSource("ds-incidents", {
        type: "geojson",
        data: (incidentsRef.current ?? EMPTY_FC) as FeatureCollection,
      });
      map.addLayer({
        id: "ds-incidents-pts",
        type: "circle",
        source: "ds-incidents",
        paint: {
          "circle-radius": 6,
          "circle-color": "#facc15",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#080b10",
        },
      });
    }
    if (!map.getSource("ds-micro-drains")) {
      map.addSource("ds-micro-drains", {
        type: "geojson",
        data: (microDrainsRef.current ?? EMPTY_FC) as FeatureCollection,
      });
      map.addLayer({
        id: "ds-micro-drains-pts",
        type: "circle",
        source: "ds-micro-drains",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 4.5, 16, 8],
          "circle-color": [
            "match",
            ["get", "condition"],
            "blocked",
            "#f43f5e",
            "silted",
            "#f59e0b",
            "#10b981",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0E1116",
        },
      });
    }

    // 8. Selected Zone Connectors & Anchors
    if (!map.getSource("ds-sel-lines")) {
      map.addSource("ds-sel-lines", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "ds-sel-lines-layer",
        type: "line",
        source: "ds-sel-lines",
        paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-dasharray": [2, 1.5] },
      });
    }
    if (!map.getSource("ds-sel-pts")) {
      map.addSource("ds-sel-pts", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "ds-sel-pts-layer",
        type: "circle",
        source: "ds-sel-pts",
        paint: {
          "circle-radius": 6.5,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#080b10",
        },
      });
    }
  };

  // Initialize MapLibre
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolveBasemapStyle(basemapInitRef.current),
      center: [77.232, 28.562],
      zoom: 13.5,
      pitch: is3DRef.current ? 56 : 0,
      bearing: is3DRef.current ? -20 : 0,
      maxPitch: 75,
      antialias: true,
      attributionControl: {
        compact: false,
        customAttribution: "Copernicus GLO-30 · AWS Terrarium 3D · OpenFreeMap 3D · © OpenStreetMap contributors",
      },
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    map.on("style.load", () => {
      installNative3DLayers(map);
      setStyleVersion((v) => v + 1);
    });

    const handleZoneClick = (e: maplibregl.MapLayerMouseEvent) => {
      const zid = e.features?.[0]?.properties?.zone_id;
      if (typeof zid === "string") {
        const full = zonesByIdRef.current.get(zid);
        if (full) onSelectZoneRef.current(full);
      }
    };
    const handleZoneMove = (e: maplibregl.MapLayerMouseEvent) => {
      const zid = e.features?.[0]?.properties?.zone_id;
      if (typeof zid === "string") {
        const full = zonesByIdRef.current.get(zid);
        if (full) {
          map.getCanvas().style.cursor = "pointer";
          setHoverInfo({ x: e.point.x, y: e.point.y, zone: full });
          return;
        }
      }
      map.getCanvas().style.cursor = "";
      setHoverInfo(null);
    };
    const handleZoneLeave = () => {
      map.getCanvas().style.cursor = "";
      setHoverInfo(null);
    };

    map.on("click", "ds-zones-fill", handleZoneClick);
    map.on("mousemove", "ds-zones-fill", handleZoneMove);
    map.on("mouseleave", "ds-zones-fill", handleZoneLeave);

    map.on("click", "ds-micro-drains-pts", (e: maplibregl.MapLayerMouseEvent) => {
      const mdId = e.features?.[0]?.properties?.id;
      if (typeof mdId === "string") {
        const full = microDrainsByIdRef.current.get(mdId);
        if (full && onSelectMicroDrainRef.current) {
          onSelectMicroDrainRef.current(full);
        }
      }
    });
    map.on("mouseenter", "ds-micro-drains-pts", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "ds-micro-drains-pts", () => {
      map.getCanvas().style.cursor = "";
    });

    mapRef.current = map;

    return () => {
      if (overlayRef.current) {
        try {
          map.removeControl(overlayRef.current as unknown as maplibregl.IControl);
        } catch {
          // ignore
        }
        overlayRef.current = null;
      }
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Switch basemap style cleanly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || basemap === basemapInitRef.current) return;
    basemapInitRef.current = basemap;
    map.setStyle(resolveBasemapStyle(basemap));
  }, [basemap]);

  // 1. Toggle 3D Terrain & Camera Pitch ONLY when styleVersion / is3D / displayMode changes (MapLibre #6011 safe)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;

    const use3DTerrain = is3D && displayMode === "contours";
    map.stop();

    try {
      if (map.getSource("aws-terrarium-terrain")) {
        const hasTerrain = Boolean(map.getTerrain());
        if (use3DTerrain && !hasTerrain) {
          map.setTerrain({ source: "aws-terrarium-terrain", exaggeration: 2.0 });
        } else if (!use3DTerrain && hasTerrain) {
          map.setTerrain(null);
        }
      }
    } catch {
      map.setTerrain(null);
    }

    const targetPitch = is3D ? 56 : 0;
    if (Math.abs(map.getPitch() - targetPitch) > 1) {
      map.easeTo({
        pitch: targetPitch,
        bearing: is3D ? -20 : 0,
        duration: 650,
      });
    }
  }, [styleVersion, is3D, displayMode]);

  // 2. Sync Layer Visibilities, Draped Flood Opacity & Selected Outline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;

    const use3DTerrain = is3D && displayMode === "contours";
    const setVis = (id: string, visible: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    };

    const showContours = displayMode === "contours";
    setVis("terrain-hillshade", use3DTerrain && basemap === "dark");
    setVis("drainscope-3d-buildings", is3D);
    setVis("ds-zones-fill", showContours);
    setVis("ds-zones-feather", showContours);
    setVis("ds-zones-selected-outline", showContours);
    setVis("ds-drains-glow", showDrains);
    setVis("ds-drains-core", showDrains);
    setVis("ds-parks-fill", showParks);
    setVis("ds-parks-outline", showParks);
    setVis("ds-incidents-pts", showIncidents);
    setVis("ds-micro-drains-pts", showMicroDrains);
    setVis("ds-flow-beds-line", showFlow);
    setVis("ds-flow-pulses-glow", showFlow);
    setVis("ds-flow-pulses-core", showFlow);

    if (map.getLayer("ds-zones-fill")) {
      map.setPaintProperty(
        "ds-zones-fill",
        "fill-opacity",
        Math.max(0.18, Math.min(0.75, contourOpacity * (0.35 + 0.55 * stormProgress)))
      );
    }
    if (map.getLayer("ds-zones-feather")) {
      map.setPaintProperty(
        "ds-zones-feather",
        "line-opacity",
        Math.max(0.15, Math.min(0.65, contourOpacity * (0.3 + 0.5 * stormProgress)))
      );
    }
    if (map.getLayer("ds-zones-selected-outline")) {
      map.setFilter("ds-zones-selected-outline", ["==", ["get", "zone_id"], selectedZoneId ?? "__none__"]);
    }
  }, [
    styleVersion,
    is3D,
    displayMode,
    basemap,
    showDrains,
    showParks,
    showIncidents,
    showMicroDrains,
    showFlow,
    contourOpacity,
    stormProgress,
    selectedZoneId,
  ]);

  // Sync GeoJSON data into MapLibre sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    (map.getSource("ds-zones") as GeoJSONSource | undefined)?.setData((zones ?? EMPTY_FC) as FeatureCollection);
    (map.getSource("ds-drains") as GeoJSONSource | undefined)?.setData((drains ?? EMPTY_FC) as FeatureCollection);
    (map.getSource("ds-parks") as GeoJSONSource | undefined)?.setData((parks ?? EMPTY_FC) as FeatureCollection);
    (map.getSource("ds-underpasses") as GeoJSONSource | undefined)?.setData((underpasses ?? EMPTY_FC) as FeatureCollection);
    (map.getSource("ds-incidents") as GeoJSONSource | undefined)?.setData((incidents ?? EMPTY_FC) as FeatureCollection);
    (map.getSource("ds-micro-drains") as GeoJSONSource | undefined)?.setData((microDrains ?? EMPTY_FC) as FeatureCollection);
    (map.getSource("ds-flow-beds") as GeoJSONSource | undefined)?.setData(buildFlowBedsFC(flowPaths));
  }, [styleVersion, zones, drains, parks, underpasses, incidents, microDrains, flowPaths]);

  // Sync selected zone connectors
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    const { lines, points } = buildSelectionOverlay(selectedZone, stormProgress);
    (map.getSource("ds-sel-lines") as GeoJSONSource | undefined)?.setData(lines);
    (map.getSource("ds-sel-pts") as GeoJSONSource | undefined)?.setData(points);
  }, [styleVersion, selectedZone, stormProgress]);

  // Real-Time Animated Downhill Water Flow Pulses
  useEffect(() => {
    if (!showFlow || flowPaths.length === 0 || styleVersion === 0) return;
    let rafId = 0;
    let lastUpdate = 0;
    let phase = 0;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      if (now - lastUpdate < 36) return;
      const dt = Math.min(100, now - lastUpdate);
      lastUpdate = now;
      const speedMult = 0.45 + (rainfallRef.current / 60.0) * 0.75;
      phase = (phase + dt * 0.00028 * speedMult) % 1.0;

      const map = mapRef.current;
      if (map) {
        const src = map.getSource("ds-flow-pulses") as GeoJSONSource | undefined;
        if (src) {
          src.setData(buildFlowPulsesFC(flowPaths, phase));
        }
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [styleVersion, showFlow, flowPaths]);

  // Camera zoom to selected zone or landmark
  useEffect(() => {
    const map = mapRef.current;
    const z = selectedZoneRef.current;
    if (!map) return;
    if (selectedZoneId && z && z.bbox) {
      let [minLng, minLat, maxLng, maxLat] = z.bbox;
      const expand = (pt: [number, number] | null) => {
        if (!pt) return;
        minLng = Math.min(minLng, pt[0]);
        maxLng = Math.max(maxLng, pt[0]);
        minLat = Math.min(minLat, pt[1]);
        maxLat = Math.max(maxLat, pt[1]);
      };
      expand(z.nearest_drain_coord);
      if (z.nearest_park_m <= 450) expand(z.nearest_park_coord);

      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        {
          padding: { top: 120, bottom: 110, left: 375, right: 395 },
          maxZoom: 15.8,
          pitch: is3DRef.current ? 58 : 0,
          duration: 850,
        }
      );
    } else if (!selectedZoneId && !flyTarget) {
      map.flyTo({
        center: [77.232, 28.562],
        zoom: 13.5,
        pitch: is3DRef.current ? 56 : 0,
        bearing: is3DRef.current ? -20 : 0,
        duration: 800,
      });
    }
  }, [selectedZoneId, flyTarget]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTarget) return;
    map.flyTo({
      center: [flyTarget.lng, flyTarget.lat],
      zoom: flyTarget.zoom,
      pitch: is3DRef.current ? 58 : 0,
      duration: 850,
    });
  }, [flyTarget]);

  // Mount Deck.gl MapboxOverlay ONLY when user switches to unsmoothed H3 mode
  const deckLayers = useMemo<Layer[]>(() => {
    if (displayMode !== "h3" || hexes.length === 0) return [];
    return [
      new H3HexagonLayer<HexFeature>({
        id: "barapullah-h3-unsmoothed-layer",
        data: hexes,
        extruded: is3D,
        elevationScale: is3D ? 45 * stormProgress : 0,
        getElevation: (d) => d[metric],
        filled: true,
        stroked: true,
        lineWidthMinPixels: 0.75,
        getHexagon: (d) => d.h3_id,
        getFillColor: (d) => hexFillColor(d[metric], contourOpacity),
        getLineColor: [255, 255, 255, 24],
        updateTriggers: { getFillColor: [metric, contourOpacity], getElevation: [metric, is3D, stormProgress] },
      }),
    ];
  }, [displayMode, hexes, is3D, metric, contourOpacity, stormProgress]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (displayMode === "h3") {
      if (!overlayRef.current) {
        const ov = new MapboxOverlay({ interleaved: false, layers: deckLayers });
        map.addControl(ov as unknown as maplibregl.IControl);
        overlayRef.current = ov;
      } else {
        overlayRef.current.setProps({ layers: deckLayers });
      }
    } else if (overlayRef.current) {
      try {
        map.removeControl(overlayRef.current as unknown as maplibregl.IControl);
      } catch {
        // ignore
      }
      overlayRef.current = null;
    }
  }, [displayMode, deckLayers]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {hoverInfo && displayMode === "contours" && (
        <div
          style={{ left: hoverInfo.x + 14, top: hoverInfo.y + 14 }}
          className="pointer-events-none absolute z-30 max-w-xs rounded-md border border-[#262E3D] bg-[#11151C] px-3 py-2 text-xs shadow-lg"
        >
          <p className="font-semibold text-white">
            {hoverInfo.zone.risk_tier} Susceptibility · <span className="font-mono text-sky-400">{hoverInfo.zone.zone_id}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-300">{hoverInfo.zone.diagnosis_headline}</p>
          <p className="mt-1 font-mono text-[10px] tabular-nums text-slate-400">
            Depth ~{Math.round(hoverInfo.zone.est_ponding_cm * stormProgress)} cm · Floods at &ge;{hoverInfo.zone.rain_to_flood_mm} mm/hr
          </p>
        </div>
      )}
    </div>
  );
}
