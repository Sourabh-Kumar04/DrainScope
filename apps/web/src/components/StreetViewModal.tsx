"use client";

import { useEffect, useRef, useState } from "react";
import { Viewer } from "mapillary-js";
import "mapillary-js/dist/mapillary.css";
import {
  CloudRain,
  Columns2,
  Compass,
  ExternalLink,
  Eye,
  KeyRound,
  Loader2,
  MapPin,
  Pause,
  Play,
  Sparkles,
  Trees,
  X,
} from "lucide-react";
import { fetchStreetDepthFlood } from "@/lib/api";
import type { StreetDepthResponse, ZoneProperties } from "@/lib/types";

interface StreetViewModalProps {
  zone: ZoneProperties;
  onClose: () => void;
}

type ViewTab = "live_flood" | "split_nbs" | "explore_360";

interface MapillaryImageCandidate {
  id: string;
  is_pano?: boolean;
  captured_at?: number;
  geometry?: { coordinates?: [number, number] };
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function findNearestMapillaryImage(
  lat: number,
  lng: number,
  token: string,
  signal: AbortSignal
): Promise<{ id: string; isPano: boolean; distM: number; capturedDate: string | null } | null> {
  const radiiDeg = [0.0015, 0.0042, 0.0095];
  for (const r of radiiDeg) {
    const bbox = `${(lng - r).toFixed(6)},${(lat - r).toFixed(6)},${(lng + r).toFixed(6)},${(lat + r).toFixed(6)}`;
    const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(
      token
    )}&fields=id,is_pano,captured_at,geometry&bbox=${bbox}&limit=40`;

    const res = await fetch(url, { signal });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("Mapillary token rejected (401/403). Check NEXT_PUBLIC_MAPILLARY_TOKEN in apps/web/.env.local.");
      }
      continue;
    }
    const json = (await res.json()) as { data?: MapillaryImageCandidate[] };
    const items = json.data ?? [];
    if (items.length === 0) continue;

    const scored = items
      .map((item) => {
        const coords = item.geometry?.coordinates;
        const distM = coords ? haversineMeters(lat, lng, coords[1], coords[0]) : 9999;
        return { item, distM };
      })
      .sort((a, b) => {
        const panoDiff = Number(Boolean(b.item.is_pano)) - Number(Boolean(a.item.is_pano));
        if (panoDiff !== 0 && Math.abs(a.distM - b.distM) < 250) return panoDiff;
        return a.distM - b.distM;
      });

    const best = scored[0];
    if (best) {
      const capturedDate = best.item.captured_at
        ? new Date(best.item.captured_at).toISOString().slice(0, 10)
        : null;
      return {
        id: best.item.id,
        isPano: Boolean(best.item.is_pano),
        distM: Math.round(best.distM),
        capturedDate,
      };
    }
  }
  return null;
}

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Perspective Depth-Aware Monsoon Flood + Planar Reflection + Flowing Ripples GLSL Shader
const FRAG_SRC = `
precision highp float;
varying vec2 v_uv;

uniform sampler2D u_photo;
uniform sampler2D u_ground;
uniform float u_time;
uniform float u_waterLeft;   // 0..1 flood level on left side (or full screen)
uniform float u_waterRight;  // 0..1 flood level on right side (After NbS in split mode)
uniform float u_splitX;      // 1.1 in live mode, 0..1 in split mode
uniform float u_rain;        // 0..1 rain intensity

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = v_uv;
  vec3 orig = texture2D(u_photo, uv).rgb;
  float groundH = texture2D(u_ground, uv).r; // 0 = lowest road asphalt, 1 = pillars/cars/sky

  bool isRight = uv.x > u_splitX;
  float waterLevel = isRight ? u_waterRight : u_waterLeft;

  // Perspective road coordinates (foreshortened toward vanishing point at y ~ 0.48)
  float persp = 1.0 / max(0.08, (uv.y - 0.44));
  vec2 flowUV = vec2((uv.x - 0.5) * persp * 2.2, persp * 0.85);

  // Multi-layered downhill flowing monsoon waves
  float t = u_time * (0.8 + u_rain * 1.1);
  float w1 = noise(flowUV * 3.5 + vec2(t * 0.55, -t * 1.35));
  float w2 = noise(flowUV * 8.0 + vec2(-t * 0.35, -t * 2.1));
  float w3 = sin(flowUV.y * 14.0 - t * 4.2 + w1 * 3.0) * 0.5 + 0.5;
  float ripple = (w1 * 0.45 + w2 * 0.35 + w3 * 0.20) - 0.5;

  // Soft depth-masked floodwater boundary (occluded cleanly by pillars, curbs & vehicles)
  float submergence = waterLevel - groundH;
  float waterMask = smoothstep(-0.025, 0.045, submergence);
  // Darkened wet asphalt collar just above the waterline
  float wetCollar = smoothstep(-0.09, -0.01, submergence) * (1.0 - waterMask);

  vec3 col = orig;
  // Slightly overcast monsoon mood on dry parts
  col = mix(col, col * vec3(0.88, 0.92, 0.97), 0.25 * u_rain);
  // Wet darkened asphalt around the water edge
  col *= (1.0 - wetCollar * 0.32);

  if (waterMask > 0.001) {
    // Planar mirror reflection of the real flyover/trees/sky above, distorted by flowing ripples
    float reflY = clamp(uv.y - max(0.06, (uv.y - 0.48) * 1.35) + ripple * 0.032, 0.02, 0.98);
    float reflX = clamp(uv.x + ripple * 0.018 * (1.0 / max(1.0, persp * 0.35)), 0.01, 0.99);
    vec3 reflCol = texture2D(u_photo, vec2(reflX, reflY)).rgb;

    // Realistic muddy-monsoon urban stormwater tint (brownish-slate shallow -> deep murky teal)
    float depthFactor = clamp(submergence * 3.0, 0.0, 1.0);
    vec3 murkyWater = mix(vec3(0.18, 0.21, 0.19), vec3(0.09, 0.14, 0.16), depthFactor);

    // Fresnel-like reflection blend (more reflective at grazing angles near horizon)
    float fresnel = clamp(0.28 + (1.0 - uv.y) * 0.55, 0.25, 0.72);
    vec3 waterCol = mix(murkyWater, reflCol * vec3(0.78, 0.85, 0.90), fresnel);

    // Specular sky/headlight glint on wave crests
    float spec = smoothstep(0.22, 0.46, ripple) * (0.28 + 0.25 * u_rain);
    waterCol += vec3(0.75, 0.86, 0.92) * spec;

    // Subtle foam/debris line right where water laps against curbs & tires
    float edgeFoam = smoothstep(0.0, 0.03, submergence) * (1.0 - smoothstep(0.03, 0.08, submergence));
    waterCol = mix(waterCol, vec3(0.72, 0.78, 0.80), edgeFoam * 0.28);

    col = mix(col, waterCol, waterMask * clamp(0.62 + depthFactor * 0.32, 0.0, 0.94));
  }

  // Subtle slanted falling monsoon rain streaks
  if (u_rain > 0.05) {
    vec2 rUV = vec2(uv.x * 95.0 + uv.y * 14.0, uv.y * 18.0 - u_time * (5.5 + u_rain * 4.5));
    float streak = smoothstep(0.94, 0.995, noise(rUV));
    col += vec3(0.72, 0.84, 0.92) * streak * (0.12 + 0.22 * u_rain);
  }

  // Crisp divider line in Before / After Split Mode
  if (u_splitX < 1.02 && abs(uv.x - u_splitX) < 0.0025) {
    col = vec3(0.78, 1.0, 0.0);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode texture image"));
    img.src = src;
  });
}

export default function StreetViewModal({ zone, onClose }: StreetViewModalProps) {
  const viewerMountRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const token = (process.env.NEXT_PUBLIC_MAPILLARY_TOKEN || "").trim();

  const [activeTab, setActiveTab] = useState<ViewTab>("live_flood");
  const [rainfallMmHr, setRainfallMmHr] = useState<number>(60);
  const [nbsEnabled, setNbsEnabled] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [splitX, setSplitX] = useState<number>(0.5);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">(
    token ? "loading" : "idle"
  );
  const [depthLoading, setDepthLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{
    id: string;
    isPano: boolean;
    distM: number;
    capturedDate: string | null;
  } | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [depthAssets, setDepthAssets] = useState<StreetDepthResponse | null>(null);

  const baseDepthCm = Math.max(12, zone.est_ponding_cm);
  const floodedDepthCm = Math.min(125, Math.max(6, Math.round(baseDepthCm * (rainfallMmHr / 60.0))));
  const nbsDepthCm = Math.min(125, Math.max(4, Math.round(floodedDepthCm * 0.52)));
  const currentDepthCm = nbsEnabled ? nbsDepthCm : floodedDepthCm;

  // Map 0..125 cm -> 0.14..0.58 ground-height threshold for the WebGL shader
  const cmToShaderLevel = (cm: number) => Math.min(0.60, Math.max(0.10, 0.12 + (cm / 125) * 0.46));

  const stateRef = useRef({
    waterLeft: cmToShaderLevel(currentDepthCm),
    waterRight: cmToShaderLevel(nbsDepthCm),
    splitX: 1.1,
    rain: rainfallMmHr / 150,
    playing: isPlaying,
  });
  stateRef.current = {
    waterLeft: activeTab === "split_nbs" ? cmToShaderLevel(floodedDepthCm) : cmToShaderLevel(currentDepthCm),
    waterRight: cmToShaderLevel(nbsDepthCm),
    splitX: activeTab === "split_nbs" ? splitX : 1.1,
    rain: rainfallMmHr / 150,
    playing: isPlaying,
  };

  const severityLabel =
    currentDepthCm >= 60
      ? "Engine Stall / Impassable"
      : currentDepthCm >= 30
      ? "Wheel-Hub Deep · Traffic Crawling"
      : "Ankle-Deep · Kerbside Ponding";

  const googleStreetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${zone.centroid_lat},${zone.centroid_lng}`;

  // 1. Find nearest Mapillary image for this zone
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setStatus("loading");
    setErrorMsg(null);
    setDepthAssets(null);

    findNearestMapillaryImage(zone.centroid_lat, zone.centroid_lng, token, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;
        if (!found) {
          setStatus("empty");
          return;
        }
        setImageMeta(found);
        setActiveImageId(found.id);
        setStatus("ready");
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") {
          setErrorMsg(err.message);
          setStatus("error");
        }
      });

    return () => controller.abort();
  }, [zone.centroid_lat, zone.centroid_lng, token]);

  // 2. Run local Depth-Anything-V2 (FastAPI) whenever activeImageId changes
  useEffect(() => {
    if (!token || !activeImageId) return;
    const controller = new AbortController();
    setDepthLoading(true);
    fetchStreetDepthFlood(activeImageId, token, controller.signal)
      .then((assets) => {
        if (!controller.signal.aborted) {
          setDepthAssets(assets);
          setErrorMsg(null);
        }
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setErrorMsg(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDepthLoading(false);
      });
    return () => controller.abort();
  }, [activeImageId, token]);

  // 3. Mount interactive Mapillary 360° Viewer when on "explore_360" tab
  useEffect(() => {
    if (activeTab !== "explore_360" || !token || !activeImageId || !viewerMountRef.current) return;
    const viewer = new Viewer({
      accessToken: token,
      container: viewerMountRef.current,
      imageId: activeImageId,
      component: { cover: false, attribution: true, direction: true, sequence: true, zoom: true },
    });
    viewer.on("image", (evt) => {
      if (evt.image?.id) setActiveImageId(evt.image.id);
    });
    viewerRef.current = viewer;

    return () => {
      viewer.remove();
      viewerRef.current = null;
    };
  }, [activeTab, token, activeImageId]);

  // 4. Mount Real-Time WebGL Depth-Aware Flood Shader on "live_flood" & "split_nbs" tabs
  useEffect(() => {
    if (activeTab === "explore_360" || !depthAssets || !glCanvasRef.current) return;
    const canvas = glCanvasRef.current;
    const gl = canvas.getContext("webgl", { antialias: true, preserveDrawingBuffer: false });
    if (!gl) return;

    let cancelled = false;
    let rafId = 0;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const createTex = (unit: number, img: HTMLImageElement) => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      return tex;
    };

    const uPhoto = gl.getUniformLocation(prog, "u_photo");
    const uGround = gl.getUniformLocation(prog, "u_ground");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uWaterLeft = gl.getUniformLocation(prog, "u_waterLeft");
    const uWaterRight = gl.getUniformLocation(prog, "u_waterRight");
    const uSplitX = gl.getUniformLocation(prog, "u_splitX");
    const uRain = gl.getUniformLocation(prog, "u_rain");

    Promise.all([loadImageElement(depthAssets.image_b64), loadImageElement(depthAssets.ground_mask_b64)]).then(
      ([photoImg, groundImg]) => {
        if (cancelled) return;
        createTex(0, photoImg);
        createTex(1, groundImg);
        gl.uniform1i(uPhoto, 0);
        gl.uniform1i(uGround, 1);

        let t = 0;
        let smoothLeft = stateRef.current.waterLeft;
        let smoothRight = stateRef.current.waterRight;

        const render = () => {
          if (cancelled) return;
          rafId = requestAnimationFrame(render);
          const parent = canvas.parentElement;
          if (parent && (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight)) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
          }

          if (stateRef.current.playing) t += 0.016;
          smoothLeft += (stateRef.current.waterLeft - smoothLeft) * 0.08;
          smoothRight += (stateRef.current.waterRight - smoothRight) * 0.08;

          gl.uniform1f(uTime, t);
          gl.uniform1f(uWaterLeft, smoothLeft);
          gl.uniform1f(uWaterRight, smoothRight);
          gl.uniform1f(uSplitX, stateRef.current.splitX);
          gl.uniform1f(uRain, stateRef.current.rain);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        render();
      }
    );

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [activeTab, depthAssets]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/84 p-4 backdrop-blur-md">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#0A0E15] shadow-2xl">
        {/* Header + Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#C8FF00]/15 text-[#C8FF00] ring-1 ring-[#C8FF00]/40">
              <Eye className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Depth-Aware 3D Street Flood · <span className="font-mono text-[#C8FF00]">{zone.zone_id}</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                {depthAssets
                  ? `${depthAssets.model_used} · ${imageMeta?.distM ?? 0}m from pocket`
                  : "Mapillary Open Street Imagery + Local Depth-Anything-V2 Shader"}
              </p>
            </div>
          </div>

          {/* 3-Tab Mode Switcher */}
          {status === "ready" && (
            <div className="flex items-center gap-1 rounded-full bg-white/[0.05] p-1 ring-1 ring-white/10">
              {(
                [
                  { id: "live_flood", label: "Live 3D Flood", icon: Sparkles },
                  { id: "split_nbs", label: "Before / After NbS", icon: Columns2 },
                  { id: "explore_360", label: "360° Explore", icon: Compass },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      activeTab === tab.id
                        ? "bg-[#C8FF00] text-[#080B10]"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <a
              href={googleStreetViewUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Google
              <ExternalLink className="h-3 w-3" />
            </a>
            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Main Viewport */}
        <div
          className="relative flex-1 overflow-hidden bg-[#080B10]"
          onPointerMove={(e) => {
            if (activeTab === "split_nbs" && e.buttons === 1) {
              const rect = e.currentTarget.getBoundingClientRect();
              setSplitX(Math.max(0.08, Math.min(0.92, (e.clientX - rect.left) / rect.width)));
            }
          }}
        >
          {/* WebGL Depth-Aware Flood Canvas (Live Flood & Before/After Split) */}
          {activeTab !== "explore_360" && (
            <canvas
              ref={glCanvasRef}
              className={`h-full w-full ${activeTab === "split_nbs" ? "cursor-ew-resize" : ""}`}
            />
          )}

          {/* Raw Mapillary 360° Explorer */}
          {activeTab === "explore_360" && <div ref={viewerMountRef} className="h-full w-full" />}

          {/* Live Flood HUD */}
          {status === "ready" && activeTab === "live_flood" && !depthLoading && (
            <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-2xl border border-white/15 bg-[#0C121A]/88 px-4 py-3 backdrop-blur-md">
              <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                Depth-Masked Road Flood Level
              </p>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-black text-[#C8FF00]">{currentDepthCm} cm</span>
                <span className="text-xs font-semibold text-rose-300">{severityLabel}</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                Water occluded by pillars &amp; vehicles · Planar reflections active
              </p>
            </div>
          )}

          {/* Before / After NbS Split Labels + Draggable Handle */}
          {status === "ready" && activeTab === "split_nbs" && !depthLoading && (
            <>
              <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-xl border border-rose-400/40 bg-[#0C121A]/90 px-3.5 py-2 backdrop-blur-md">
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-300">Before (Current)</p>
                <p className="font-mono text-lg font-black text-white">{floodedDepthCm} cm</p>
              </div>
              <div className="pointer-events-none absolute right-4 top-4 z-20 rounded-xl border border-[#C8FF00]/40 bg-[#0C121A]/90 px-3.5 py-2 text-right backdrop-blur-md">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#C8FF00]">After NbS Relief</p>
                <p className="font-mono text-lg font-black text-white">{nbsDepthCm} cm</p>
              </div>
              <div
                style={{ left: `${splitX * 100}%` }}
                className="pointer-events-none absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#C8FF00] bg-[#080B10]/90 px-2.5 py-1 font-mono text-[10px] font-bold text-[#C8FF00] shadow-xl"
              >
                &harr; DRAG
              </div>
            </>
          )}

          {/* 360° Explore Helper Banner */}
          {status === "ready" && activeTab === "explore_360" && (
            <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/15 bg-[#0C121A]/92 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
              <span>Navigate along the street, then run Depth-Anything-V2 on this angle:</span>
              <button
                onClick={() => setActiveTab("live_flood")}
                className="rounded-full bg-[#C8FF00] px-3 py-1 text-[11px] font-bold text-[#080B10]"
              >
                Simulate Flood Here
              </button>
            </div>
          )}

          {/* Missing Token Card */}
          {!token && (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
              <div className="max-w-md rounded-3xl border border-white/15 bg-[#0C121A] p-6 text-center shadow-2xl">
                <KeyRound className="mx-auto h-10 w-10 text-[#C8FF00]" />
                <h3 className="mt-3 text-base font-bold text-white">Add Free Mapillary Token</h3>
                <p className="mt-2 text-xs text-slate-400">
                  Add <code className="text-[#C8FF00]">NEXT_PUBLIC_MAPILLARY_TOKEN=MLY|...</code> to{" "}
                  <code className="text-slate-200">apps/web/.env.local</code> and restart Next.js.
                </p>
              </div>
            </div>
          )}

          {/* Loading Mapillary or Running Depth-Anything-V2 */}
          {token && (status === "loading" || depthLoading) && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2.5 bg-[#080B10]/85 backdrop-blur-sm">
              <Loader2 className="h-7 w-7 animate-spin text-[#C8FF00]" />
              <p className="font-mono text-xs text-slate-200">
                {status === "loading"
                  ? "Finding nearest South Delhi street photo…"
                  : "Estimating 3D road depth & ground plane (Depth-Anything-V2)…"}
              </p>
            </div>
          )}

          {/* Empty / Error */}
          {token && status === "empty" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
              <div className="max-w-sm rounded-2xl border border-white/15 bg-[#0C121A] p-6 text-center">
                <MapPin className="mx-auto h-7 w-7 text-cyan-400" />
                <h3 className="mt-3 text-sm font-bold text-white">No Mapillary Photo Within 1 km</h3>
                <a
                  href={googleStreetViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#C8FF00] px-4 py-2 text-xs font-bold text-[#080B10]"
                >
                  Open in Google Street View <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}

          {token && (status === "error" || errorMsg) && !depthLoading && (
            <div className="absolute bottom-4 right-4 z-30 max-w-md rounded-xl border border-rose-500/40 bg-rose-950/90 px-4 py-2.5 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-[#0C121A] px-5 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying((v) => !v)}
              className="flex items-center gap-1.5 rounded-full bg-[#C8FF00] px-4 py-1.5 text-xs font-bold text-[#080B10] transition hover:brightness-105"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isPlaying ? "Pause Flow" : "Play Flow"}
            </button>

            <div className="flex items-center gap-2.5">
              <CloudRain className="h-4 w-4 text-cyan-400" />
              <span className="text-xs text-slate-300">Rain:</span>
              <input
                type="range"
                min={10}
                max={150}
                step={5}
                value={rainfallMmHr}
                onChange={(e) => setRainfallMmHr(Number(e.target.value))}
                className="w-36 cursor-pointer"
              />
              <span className="w-16 font-mono text-xs font-bold text-[#C8FF00]">{rainfallMmHr} mm/hr</span>
            </div>
          </div>

          {activeTab === "live_flood" && (
            <button
              onClick={() => setNbsEnabled((v) => !v)}
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                nbsEnabled
                  ? "border-[#C8FF00]/60 bg-[#C8FF00]/15 text-[#DFFF66]"
                  : "border-white/15 bg-white/[0.04] text-slate-300 hover:bg-white/10"
              }`}
            >
              <Trees className="h-3.5 w-3.5" />
              {nbsEnabled ? "NbS Bio-Retention Active (-48% depth)" : "Test NbS Bio-Retention Relief"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
