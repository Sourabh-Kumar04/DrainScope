"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  Box,
  CloudRain,
  Droplets,
  Gauge,
  Move3d,
  Pause,
  Play,
  RotateCcw,
  Sprout,
  Wrench,
  X,
} from "lucide-react";
import { fetchTerrainPatch } from "@/lib/api";
import type { TerrainPatchResponse, ZoneProperties } from "@/lib/types";

interface FlowSandbox3DModalProps {
  zone: ZoneProperties;
  initialRainfallMmHr: number;
  onClose: () => void;
}

type ToolMode = "orbit" | "bioswale" | "pump";

interface SimHudStats {
  simMinutes: number;
  maxDepthCm: number;
  floodedAreaPct: number;
  waterVolumeKl: number;
  drainedKl: number;
  bioswaleCount: number;
  pumpCount: number;
}

export default function FlowSandbox3DModal({
  zone,
  initialRainfallMmHr,
  onClose,
}: FlowSandbox3DModalProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [patch, setPatch] = useState<TerrainPatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [rainfallMmHr, setRainfallMmHr] = useState(initialRainfallMmHr);
  const [drainClogPct, setDrainClogPct] = useState(20);
  const [toolMode, setToolMode] = useState<ToolMode>("orbit");
  const [resetNonce, setResetNonce] = useState(0);
  const [stats, setStats] = useState<SimHudStats>({
    simMinutes: 0,
    maxDepthCm: 0,
    floodedAreaPct: 0,
    waterVolumeKl: 0,
    drainedKl: 0,
    bioswaleCount: 0,
    pumpCount: 0,
  });

  // Live refs for the 60fps Three.js + SWE loop
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const rainRef = useRef(rainfallMmHr);
  rainRef.current = rainfallMmHr;
  const clogRef = useRef(drainClogPct);
  clogRef.current = drainClogPct;
  const toolRef = useRef(toolMode);
  toolRef.current = toolMode;

  useEffect(() => {
    const controller = new AbortController();
    fetchTerrainPatch("barapullah", zone.zone_id, controller.signal)
      .then((data) => {
        setPatch(data);
        setError(null);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      });
    return () => controller.abort();
  }, [zone.zone_id]);

  useEffect(() => {
    if (!patch || !mountRef.current) return;
    const container = mountRef.current;
    const N = patch.grid_size;
    const totalCells = N * N;
    const WORLD_SIZE = 44;
    const VERT_SCALE = 1.15;

    // ------------------------------------------------------------------
    // 1. Virtual-Pipe Shallow Water Equation (SWE) State Arrays
    // ------------------------------------------------------------------
    const baseH = new Float32Array(totalCells);
    const curH = new Float32Array(totalCells);
    const imp = new Float32Array(totalCells);
    const water = new Float32Array(totalCells);
    const fL = new Float32Array(totalCells);
    const fR = new Float32Array(totalCells);
    const fT = new Float32Array(totalCells);
    const fB = new Float32Array(totalCells);
    const isDrain = new Uint8Array(totalCells);
    const isBioswale = new Uint8Array(totalCells);
    const isPump = new Uint8Array(totalCells);

    const sortedElev = [...patch.elevations].sort((a, b) => a - b);
    const p05 = sortedElev[Math.floor(totalCells * 0.05)] ?? patch.min_elev_m;
    const p95 = sortedElev[Math.floor(totalCells * 0.95)] ?? patch.max_elev_m;
    const rawSpan = Math.max(0.5, p95 - p05);
    const normScale = Math.min(1.0, 2.4 / rawSpan);

    for (let i = 0; i < totalCells; i++) {
      const clamped = Math.max(p05, Math.min(p95, patch.elevations[i]));
      const rel = (clamped - p05) * normScale;
      baseH[i] = rel;
      curH[i] = rel;
      imp[i] = patch.impervious_mask[i];
      water[i] = 0.0; // start dry for mass conservation
    }
    for (const idx of patch.drain_cells) {
      if (idx >= 0 && idx < totalCells) isDrain[idx] = 1;
    }

    let drainedTotalM3 = 0;
    let boundaryOutflowM3 = 0;
    let rainInflowTotalM3 = 0;
    let simElapsedMin = 0;
    const MAX_STORM_MIN = 60.0;
    let bioswaleCount = 0;
    let pumpCount = 0;

    // ------------------------------------------------------------------
    // 2. Three.js Scene, Camera, Lighting, Terrain, Water & Buildings
    // ------------------------------------------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#070A0F");
    scene.fog = new THREE.FogExp2("#070A0F", 0.0085);

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 560;
    const camera = new THREE.PerspectiveCamera(44, width / height, 0.2, 260);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Spherical Orbit State
    let theta = 0.72;
    let phi = 0.92;
    let radius = 56;
    const target = new THREE.Vector3(0, 1.5, 0);

    const updateCamera = () => {
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(target);
    };
    updateCamera();

    // Lighting
    scene.add(new THREE.AmbientLight(0x94a3b8, 0.9));
    const dirLight = new THREE.DirectionalLight(0xf8fafc, 1.45);
    dirLight.position.set(28, 42, 24);
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.65);
    rimLight.position.set(-30, 18, -26);
    scene.add(rimLight);

    // Subtle Grid Base
    const gridHelper = new THREE.GridHelper(WORLD_SIZE + 8, 24, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -0.35;
    scene.add(gridHelper);

    // Terrain Mesh
    const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, N - 1, N - 1);
    terrainGeo.rotateX(-Math.PI / 2);
    const tPos = terrainGeo.attributes.position as THREE.BufferAttribute;
    const tColors = new Float32Array(totalCells * 3);

    const syncTerrainMesh = () => {
      const span = Math.max(0.5, patch.max_elev_m - patch.min_elev_m);
      for (let i = 0; i < totalCells; i++) {
        tPos.setY(i, curH[i] * VERT_SCALE);
        const norm = Math.min(1, Math.max(0, curH[i] / span));
        if (isDrain[i]) {
          tColors[i * 3] = 0.13;
          tColors[i * 3 + 1] = 0.83;
          tColors[i * 3 + 2] = 0.93;
        } else if (isBioswale[i]) {
          tColors[i * 3] = 0.78;
          tColors[i * 3 + 1] = 1.0;
          tColors[i * 3 + 2] = 0.0;
        } else {
          // Concrete slate vs green park tint
          const concrete = imp[i];
          tColors[i * 3] = 0.10 + norm * 0.14 + concrete * 0.06;
          tColors[i * 3 + 1] = 0.14 + norm * 0.14 + (1 - concrete) * 0.16;
          tColors[i * 3 + 2] = 0.18 + norm * 0.14;
        }
      }
      tPos.needsUpdate = true;
      terrainGeo.setAttribute("color", new THREE.BufferAttribute(tColors, 3));
      terrainGeo.computeVertexNormals();
    };
    syncTerrainMesh();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.08,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    scene.add(terrainMesh);

    // Dynamic Translucent Water Mesh
    const waterGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, N - 1, N - 1);
    waterGeo.rotateX(-Math.PI / 2);
    const wPos = waterGeo.attributes.position as THREE.BufferAttribute;
    const wColors = new Float32Array(totalCells * 3);
    waterGeo.setAttribute("color", new THREE.BufferAttribute(wColors, 3));

    const waterMat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      shininess: 110,
      specular: new THREE.Color(0x67e8f9),
      side: THREE.DoubleSide,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    scene.add(waterMesh);

    // Procedural Urban Building Blocks on high-impervious cells (visual context)
    const bldgGroup = new THREE.Group();
    const bldgMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.7,
      metalness: 0.2,
      transparent: true,
      opacity: 0.55,
    });
    const step = WORLD_SIZE / (N - 1);
    const boxGeo = new THREE.BoxGeometry(step * 0.72, 1, step * 0.72);
    for (let r = 3; r < N - 3; r += 4) {
      for (let c = 3; c < N - 3; c += 4) {
        const idx = r * N + c;
        if (imp[idx] > 0.62 && !isDrain[idx] && curH[idx] > (patch.max_elev_m - patch.min_elev_m) * 0.22) {
          const bh = 0.8 + ((r * 7 + c * 13) % 5) * 0.45;
          const m = new THREE.Mesh(boxGeo, bldgMat);
          m.scale.y = bh;
          m.position.set(
            (c / (N - 1) - 0.5) * WORLD_SIZE,
            curH[idx] * VERT_SCALE + bh * 0.5,
            (r / (N - 1) - 0.5) * WORLD_SIZE
          );
          bldgGroup.add(m);
        }
      }
    }
    scene.add(bldgGroup);

    // Group for placed Sump Pump beacons
    const pumpGroup = new THREE.Group();
    scene.add(pumpGroup);

    // Falling Rain Particles
    const rainCount = 450;
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * WORLD_SIZE;
      rainPositions[i * 3 + 1] = 3 + Math.random() * 20;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * WORLD_SIZE;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0x67e8f9,
      size: 0.22,
      transparent: true,
      opacity: 0.55,
    });
    const rainPoints = new THREE.Points(rainGeo, rainMat);
    scene.add(rainPoints);

    // ------------------------------------------------------------------
    // 3. Pointer Controls: Orbit + Raycast Click-to-Place Bioswale / Pump
    // ------------------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const handlePointerDown = (e: PointerEvent) => {
      if (toolRef.current === "orbit") {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(terrainMesh);
      if (hits.length > 0) {
        const pt = hits[0].point;
        const c = Math.round(((pt.x / WORLD_SIZE) + 0.5) * (N - 1));
        const r = Math.round(((pt.z / WORLD_SIZE) + 0.5) * (N - 1));
        if (toolRef.current === "bioswale") {
          bioswaleCount += 1;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const rr = r + dr;
              const cc = c + dc;
              if (rr >= 1 && rr < N - 1 && cc >= 1 && cc < N - 1 && dr * dr + dc * dc <= 5) {
                const idx = rr * N + cc;
                isBioswale[idx] = 1;
                curH[idx] = Math.max(0, curH[idx] - 0.35);
                imp[idx] = 0.1;
              }
            }
          }
          syncTerrainMesh();
        } else if (toolRef.current === "pump") {
          pumpCount += 1;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr;
              const cc = c + dc;
              if (rr >= 0 && rr < N && cc >= 0 && cc < N) {
                isPump[rr * N + cc] = 1;
              }
            }
          }
          const beacon = new THREE.Mesh(
            new THREE.CylinderGeometry(0.42, 0.42, 2.2, 12),
            new THREE.MeshBasicMaterial({ color: 0x22d3ee })
          );
          beacon.position.set(pt.x, pt.y + 1.1, pt.z);
          pumpGroup.add(beacon);
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      theta -= dx * 0.007;
      phi = Math.max(0.22, Math.min(1.42, phi - dy * 0.007));
      updateCamera();
    };

    const handlePointerUp = () => {
      dragging = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      radius = Math.max(20, Math.min(95, radius + e.deltaY * 0.04));
      updateCamera();
    };

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    dom.addEventListener("wheel", handleWheel, { passive: false });

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    };
    window.addEventListener("resize", handleResize);

    // ------------------------------------------------------------------
    // 4. 60 FPS Virtual-Pipe Shallow Water Simulation + Render Loop
    // ------------------------------------------------------------------
    let frameId = 0;
    let frameCounter = 0;
    const cellAreaM2 = patch.cell_size_m * patch.cell_size_m;

    const stepFluid = () => {
      const dt = 0.05;
      const gravity = 3.2;
      const stepMin = 0.12; // 1 step = 7.2 seconds of storm time (~500 steps = 60 min storm)
      const isRaining = simElapsedMin < MAX_STORM_MIN;
      if (isRaining) {
        simElapsedMin = Math.min(MAX_STORM_MIN, simElapsedMin + stepMin);
      }
      // Exact physical rainfall depth in meters for this timestep: (mm/hr -> m/hr) * (stepMin / 60)
      const rainMPerStep = isRaining ? (rainRef.current / 1000.0) * (stepMin / 60.0) : 0.0;
      const drainEfficiency = 1.0 - clogRef.current / 100.0;

      // 1. Mass-conserving rainfall inflow & explicit sinks (soil/bioswale/drain/pump)
      for (let i = 0; i < totalCells; i++) {
        if (rainMPerStep > 0) {
          const runoffFactor = 0.25 + 0.60 * imp[i];
          const added = rainMPerStep * runoffFactor;
          water[i] += added;
          rainInflowTotalM3 += added * cellAreaM2;
        }
        // Background soil infiltration + minor roadside drainage capacity
        const baseDrainRate = ((1.0 - imp[i]) * 0.00018 + 0.00012 * drainEfficiency);
        if (water[i] > 0) {
          const bgOut = Math.min(water[i], baseDrainRate);
          water[i] -= bgOut;
          drainedTotalM3 += bgOut * cellAreaM2;
        }
        if (isBioswale[i]) {
          const absorbed = Math.min(water[i], 0.0035);
          water[i] -= absorbed;
          drainedTotalM3 += absorbed * cellAreaM2;
        }
        if (isDrain[i]) {
          const drained = Math.min(water[i], 0.012 * drainEfficiency);
          water[i] -= drained;
          drainedTotalM3 += drained * cellAreaM2;
        }
        if (isPump[i]) {
          const pumped = Math.min(water[i], 0.018);
          water[i] -= pumped;
          drainedTotalM3 += pumped * cellAreaM2;
        }
      }

      // 2. Compute directional pipe fluxes from total head (H + w)
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const i = r * N + c;
          const head = curH[i] + water[i];
          const damping = 0.94 - imp[i] * 0.04;

          if (c > 0) {
            const dh = head - (curH[i - 1] + water[i - 1]);
            fL[i] = Math.max(0, fL[i] * damping + dt * gravity * dh);
          } else {
            fL[i] = 0;
          }
          if (c < N - 1) {
            const dh = head - (curH[i + 1] + water[i + 1]);
            fR[i] = Math.max(0, fR[i] * damping + dt * gravity * dh);
          } else {
            fR[i] = 0;
          }
          if (r > 0) {
            const dh = head - (curH[i - N] + water[i - N]);
            fT[i] = Math.max(0, fT[i] * damping + dt * gravity * dh);
          } else {
            fT[i] = 0;
          }
          if (r < N - 1) {
            const dh = head - (curH[i + N] + water[i + N]);
            fB[i] = Math.max(0, fB[i] * damping + dt * gravity * dh);
          } else {
            fB[i] = 0;
          }

          const outSum = (fL[i] + fR[i] + fT[i] + fB[i]) * dt;
          if (outSum > water[i] && outSum > 1e-6) {
            const k = water[i] / outSum;
            fL[i] *= k;
            fR[i] *= k;
            fT[i] *= k;
            fB[i] *= k;
          }
        }
      }

      // 3. Apply mass-conserving water depth update + gentle edge outflow
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const i = r * N + c;
          const inflow =
            (c > 0 ? fR[i - 1] : 0) +
            (c < N - 1 ? fL[i + 1] : 0) +
            (r > 0 ? fB[i - N] : 0) +
            (r < N - 1 ? fT[i + N] : 0);
          const outflow = fL[i] + fR[i] + fT[i] + fB[i];
          water[i] = Math.max(0, water[i] + dt * (inflow - outflow));
          if (r === 0 || r === N - 1 || c === 0 || c === N - 1) {
            const lost = water[i] * 0.14;
            water[i] -= lost;
            boundaryOutflowM3 += lost * cellAreaM2;
          }
        }
      }
    };

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (isPlayingRef.current) {
        stepFluid();
        stepFluid();
        // Animate falling rain drops
        const rp = rainGeo.attributes.position as THREE.BufferAttribute;
        const speed = 0.25 + (rainRef.current / 150) * 0.55;
        for (let i = 0; i < rainCount; i++) {
          let y = rp.getY(i) - speed;
          if (y < 0.5) y = 18 + Math.random() * 6;
          rp.setY(i, y);
        }
        rp.needsUpdate = true;
      }

      // Sync water mesh vertices & depth-colored shading
      let maxW = 0;
      let floodedCells = 0;
      let totalVolM3 = 0;

      for (let i = 0; i < totalCells; i++) {
        const d = water[i];
        if (d > maxW) maxW = d;
        if (d >= 0.08) floodedCells += 1;
        totalVolM3 += d * cellAreaM2;

        if (d < 0.012) {
          wPos.setY(i, curH[i] * VERT_SCALE - 0.14);
          wColors[i * 3] = 0.04;
          wColors[i * 3 + 1] = 0.25;
          wColors[i * 3 + 2] = 0.38;
        } else {
          wPos.setY(i, (curH[i] + Math.min(d, 2.5)) * VERT_SCALE + 0.04);
          // Shallow = bright cyan -> Deep = cobalt blue -> Severe (>0.45m) = coral rose warning
          const t = Math.min(1, d / 0.55);
          if (t < 0.55) {
            const u = t / 0.55;
            wColors[i * 3] = 0.13 * (1 - u) + 0.05 * u;
            wColors[i * 3 + 1] = 0.83 * (1 - u) + 0.45 * u;
            wColors[i * 3 + 2] = 0.94;
          } else {
            const u = (t - 0.55) / 0.45;
            wColors[i * 3] = 0.05 * (1 - u) + 0.96 * u;
            wColors[i * 3 + 1] = 0.45 * (1 - u) + 0.26 * u;
            wColors[i * 3 + 2] = 0.94 * (1 - u) + 0.42 * u;
          }
        }
      }
      wPos.needsUpdate = true;
      (waterGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      waterGeo.computeVertexNormals();

      frameCounter += 1;
      if (frameCounter % 12 === 0) {
        setStats({
          simMinutes: Math.round(simElapsedMin),
          maxDepthCm: Math.round(maxW * 100),
          floodedAreaPct: Math.round((100 * floodedCells) / totalCells),
          waterVolumeKl: Math.round(totalVolM3),
          drainedKl: Math.round(drainedTotalM3),
          bioswaleCount,
          pumpCount,
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      dom.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      dom.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", handleResize);
      terrainGeo.dispose();
      terrainMat.dispose();
      waterGeo.dispose();
      waterMat.dispose();
      boxGeo.dispose();
      bldgMat.dispose();
      rainGeo.dispose();
      rainMat.dispose();
      renderer.dispose();
    };
  }, [patch, resetNonce]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-4 backdrop-blur-md">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#0A0E15] shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#C8FF00]/15 text-[#C8FF00] ring-1 ring-[#C8FF00]/40">
              <Box className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">
                  3D Shallow-Water Flow Sandbox · <span className="font-mono text-[#C8FF00]">{zone.zone_id}</span>
                </h2>
                <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 font-mono text-[10px] text-cyan-300">
                  {patch ? `${patch.grid_size}×${patch.grid_size} Illustrative 1-Hr Flow` : "Loading DEM…"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {patch ? `${patch.dem_source} · Nearest Drain: ${patch.nearest_drain_name}` : "Preparing local 1 km² terrain patch"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Main 3D Viewport + Side Controls */}
        <div className="relative flex flex-1 overflow-hidden">
          <div className="relative flex-1 bg-[#070A0F]">
            <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <p className="rounded-xl border border-rose-500/40 bg-rose-950/90 px-4 py-3 text-xs text-rose-200">
                  {error}
                </p>
              </div>
            )}

            {/* Live Physics Telemetry Strip */}
            <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2 font-mono">
              <div className="rounded-xl border border-white/10 bg-[#0C121A]/90 px-3 py-2 backdrop-blur-md">
                <p className="font-sans text-[10px] text-slate-400">1-Hr Storm</p>
                <p className="text-sm font-bold text-[#22C5E5]">T+{stats.simMinutes} / 60m</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0C121A]/90 px-3 py-2 backdrop-blur-md">
                <p className="font-sans text-[10px] text-slate-400">Max Ponding</p>
                <p className="text-sm font-bold text-rose-400">{stats.maxDepthCm} cm</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0C121A]/90 px-3 py-2 backdrop-blur-md">
                <p className="font-sans text-[10px] text-slate-400">Flooded Area</p>
                <p className="text-sm font-bold text-cyan-300">{stats.floodedAreaPct}%</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0C121A]/90 px-3 py-2 backdrop-blur-md">
                <p className="font-sans text-[10px] text-slate-400">Surface Water</p>
                <p className="text-sm font-bold text-white">{stats.waterVolumeKl.toLocaleString()} KL</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0C121A]/90 px-3 py-2 backdrop-blur-md">
                <p className="font-sans text-[10px] text-slate-400">Drained / Absorbed</p>
                <p className="text-sm font-bold text-[#C8FF00]">{stats.drainedKl.toLocaleString()} KL</p>
              </div>
            </div>

            {/* Mode Helper Banner */}
            <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-white/10 bg-[#0C121A]/85 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur-md">
              {toolMode === "orbit"
                ? "Drag to orbit 3D terrain · Scroll to zoom"
                : toolMode === "bioswale"
                ? "Click anywhere on the 3D terrain to carve a permeable bioswale trench"
                : "Click anywhere on a flooded dip to install a cyan sump pump"}
            </div>
          </div>

          {/* Right Engineering Control Panel */}
          <div className="flex w-[290px] shrink-0 flex-col justify-between border-l border-white/10 bg-[#0C121A] p-4">
            <div className="space-y-4">
              {/* Playback */}
              <div className="flex gap-2">
                <button
                  onClick={() => setIsPlaying((v) => !v)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#C8FF00] py-2 text-xs font-bold text-[#080B10] transition hover:brightness-105"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {isPlaying ? "Pause Flow" : "Resume Flow"}
                </button>
                <button
                  onClick={() => setResetNonce((n) => n + 1)}
                  title="Reset water & interventions"
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Interactive Tool Selector */}
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Interactive 3D Tool
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {(
                    [
                      { id: "orbit", label: "Orbit & Inspect Camera", icon: Move3d },
                      { id: "bioswale", label: `Carve Bioswale (${stats.bioswaleCount})`, icon: Sprout },
                      { id: "pump", label: `Place Sump Pump (${stats.pumpCount})`, icon: Wrench },
                    ] as const
                  ).map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setToolMode(t.id)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                          toolMode === t.id
                            ? "border-[#C8FF00]/60 bg-[#C8FF00]/15 text-[#DFFF66]"
                            : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Rain Inflow Slider */}
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <CloudRain className="h-3.5 w-3.5 text-[#C8FF00]" />
                    Live Rainfall
                  </span>
                  <span className="font-mono font-bold text-[#C8FF00]">{rainfallMmHr} mm/hr</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={150}
                  step={5}
                  value={rainfallMmHr}
                  onChange={(e) => setRainfallMmHr(Number(e.target.value))}
                  className="w-full cursor-pointer"
                />
              </div>

              {/* Drain Siltation / Blockage Slider */}
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Gauge className="h-3.5 w-3.5 text-cyan-400" />
                    Drain Blockage
                  </span>
                  <span className="font-mono font-bold text-rose-300">{drainClogPct}% blocked</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={10}
                  value={drainClogPct}
                  onChange={(e) => setDrainClogPct(Number(e.target.value))}
                  className="w-full cursor-pointer"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Increase blockage to watch stormwater back up and spill across adjacent streets.
                </p>
              </div>
            </div>

            {/* Legend */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[10px] text-slate-400">
              <p className="mb-1.5 flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-300">
                <Droplets className="h-3 w-3 text-cyan-300" />
                3D Water Depth Scale
              </p>
              <div className="flex items-center justify-between font-mono">
                <span className="text-cyan-300">Shallow (5cm)</span>
                <span className="text-blue-400">Mid (25cm)</span>
                <span className="text-rose-400">Deep (&gt;45cm)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
