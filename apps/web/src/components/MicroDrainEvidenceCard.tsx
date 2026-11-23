"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, MapPin, ShieldAlert, X } from "lucide-react";
import type { MicroDrainProperties } from "@/lib/types";

interface MicroDrainEvidenceCardProps {
  drain: MicroDrainProperties;
  onClose: () => void;
}

const CONDITION_STYLES: Record<
  MicroDrainProperties["condition"],
  { badge: string; box: string; label: string }
> = {
  blocked: {
    badge: "border-rose-500/40 bg-rose-500/15 text-rose-300",
    box: "#f43f5e",
    label: "BLOCKED / PONDING",
  },
  silted: {
    badge: "border-amber-400/40 bg-amber-400/15 text-amber-200",
    box: "#f59e0b",
    label: "SILTED / DEBRIS",
  },
  clear: {
    badge: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300",
    box: "#10b981",
    label: "CLEAR INLET",
  },
};

export default function MicroDrainEvidenceCard({ drain, onClose }: MicroDrainEvidenceCardProps) {
  const [imgSrc, setImgSrc] = useState<string>(drain.thumb_url);
  const [refreshed, setRefreshed] = useState<boolean>(false);

  useEffect(() => {
    setImgSrc(drain.thumb_url);
    setRefreshed(false);
  }, [drain]);

  const handleImgError = async () => {
    if (refreshed) return;
    setRefreshed(true);
    const token = (process.env.NEXT_PUBLIC_MAPILLARY_TOKEN || "").trim();
    if (!token || !drain.image_id) return;
    try {
      const res = await fetch(
        `https://graph.mapillary.com/${encodeURIComponent(drain.image_id)}?fields=thumb_1024_url&access_token=${encodeURIComponent(token)}`
      );
      if (res.ok) {
        const data = (await res.json()) as { thumb_1024_url?: string };
        if (data.thumb_1024_url) setImgSrc(data.thumb_1024_url);
      }
    } catch {
      // ignore
    }
  };

  const style = CONDITION_STYLES[drain.condition] ?? CONDITION_STYLES.clear;
  const [x1, y1, x2, y2] = Array.isArray(drain.bbox_norm) && drain.bbox_norm.length === 4
    ? drain.bbox_norm
    : [0.4, 0.6, 0.6, 0.8];

  const Icon =
    drain.condition === "blocked"
      ? ShieldAlert
      : drain.condition === "silted"
      ? AlertTriangle
      : CheckCircle2;

  const mapillaryUrl = `https://www.mapillary.com/app/?pKey=${encodeURIComponent(drain.image_id)}&focus=photo`;

  return (
    <div className="absolute bottom-20 right-4 z-30 w-[370px] overflow-hidden rounded-2xl border border-white/15 bg-[#0A0F17]/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#C8FF00]" />
          <div>
            <p className="font-mono text-xs font-bold text-white">
              {drain.id} · <span className="text-cyan-300">{drain.corridor}</span>
            </p>
            <p className="text-[10px] text-slate-400">
              Street-Mapped Micro-Drainage · Captured {drain.captured_date}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Real Mapillary Photo + Exact Detection Bounding Box */}
      <div className="relative aspect-[16/10] w-full bg-[#06090F]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={`${drain.label} at ${drain.corridor}`}
          onError={handleImgError}
          className="h-full w-full object-cover"
        />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <rect
            x={x1 * 100}
            y={y1 * 100}
            width={Math.max(2, (x2 - x1) * 100)}
            height={Math.max(2, (y2 - y1) * 100)}
            fill="none"
            stroke={style.box}
            strokeWidth="0.9"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className={`absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold backdrop-blur-md ${style.badge}`}
        >
          <Icon className="h-3 w-3" />
          {style.label}
        </div>
        <div className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-0.5 font-mono text-[10px] text-slate-200 backdrop-blur-sm">
          {Math.round(drain.confidence * 100)}% conf · ~{drain.est_dist_m}m
        </div>
      </div>

      <div className="space-y-2 p-3.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-semibold capitalize text-white">{drain.label}</span>
          {drain.sightings && drain.sightings > 1 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-cyan-300">
              {drain.sightings} frame sightings
            </span>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-slate-300">{drain.condition_note}</p>
        <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px] text-slate-400">
          <span className="truncate pr-2">{drain.detector || "Offline CV Micro-Drain Inventory"}</span>
          <a
            href={mapillaryUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#C8FF00] hover:underline"
          >
            Verify Source
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
