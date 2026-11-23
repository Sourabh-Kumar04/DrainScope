"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import type { MicroDrainProperties } from "@/lib/types";

interface MicroDrainEvidenceCardProps {
  drain: MicroDrainProperties;
  onClose: () => void;
}

const CONDITION_META: Record<
  MicroDrainProperties["condition"],
  { dot: string; text: string; box: string; label: string }
> = {
  blocked: {
    dot: "bg-rose-500",
    text: "text-rose-400",
    box: "#f43f5e",
    label: "Blocked / Ponding",
  },
  silted: {
    dot: "bg-amber-400",
    text: "text-amber-300",
    box: "#f59e0b",
    label: "Silted / Debris",
  },
  clear: {
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    box: "#10b981",
    label: "Clear Inlet",
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

  const meta = CONDITION_META[drain.condition] ?? CONDITION_META.clear;
  const [x1, y1, x2, y2] =
    Array.isArray(drain.bbox_norm) && drain.bbox_norm.length === 4
      ? drain.bbox_norm
      : [0.4, 0.6, 0.6, 0.8];

  const mapillaryUrl = `https://www.mapillary.com/app/?pKey=${encodeURIComponent(drain.image_id)}&focus=photo`;

  return (
    <aside className="absolute right-0 top-14 z-30 flex w-[360px] flex-col border-b border-l border-[#242B38] bg-[#11151C] text-slate-200 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#242B38] px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-white">{drain.id}</span>
            <span className="text-[#3E4859]">/</span>
            <span className="truncate text-xs font-medium text-slate-300">{drain.corridor}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Street-Mapped Inlet · Captured {drain.captured_date}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close inlet inspector"
          className="rounded p-1 text-slate-400 transition hover:bg-[#1C2330] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Street Photo + Exact SVG Detection Box */}
      <div className="relative aspect-[16/10] w-full border-b border-[#242B38] bg-[#0B0E14]">
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
            stroke={meta.box}
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Tabular Telemetry Grid */}
      <div className="grid grid-cols-3 divide-x divide-[#242B38] border-b border-[#242B38] bg-[#0E1117]">
        <div className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Status</p>
          <p className={`mt-0.5 flex items-center gap-1.5 text-[11px] font-medium ${meta.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label.split(" / ")[0]}
          </p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Confidence</p>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-white">
            {Math.round(drain.confidence * 100)}%
          </p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Curb Dist</p>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-white">~{drain.est_dist_m} m</p>
        </div>
      </div>

      {/* Details & Source Link */}
      <div className="space-y-2.5 p-4 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-medium capitalize text-white">{drain.label}</span>
          {drain.sightings && drain.sightings > 1 && (
            <span className="font-mono text-[10px] tabular-nums text-slate-400">
              {drain.sightings} frame sightings
            </span>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">{drain.condition_note}</p>
        <div className="flex items-center justify-between border-t border-[#242B38] pt-2.5 text-[11px] text-slate-500">
          <span className="truncate pr-2">{drain.detector || "Offline CV Micro-Drain Inventory"}</span>
          <a
            href={mapillaryUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 font-medium text-sky-400 hover:text-sky-300"
          >
            Mapillary
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </aside>
  );
}
