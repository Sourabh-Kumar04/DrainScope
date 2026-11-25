"use client";

import { Pause, Play, RotateCcw, Waves } from "lucide-react";

interface StormPlaybackBarProps {
  stormMinute: number;
  onMinuteChange: (m: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  showFlow: boolean;
  onToggleFlow: () => void;
  is3D: boolean;
  rainfallMmHr: number;
}

export default function StormPlaybackBar({
  stormMinute,
  onMinuteChange,
  isPlaying,
  onTogglePlay,
  showFlow,
  onToggleFlow,
  is3D,
  rainfallMmHr,
}: StormPlaybackBarProps) {
  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-md border border-[#263445] bg-[#151D29] px-3.5 py-2 shadow-lg">
      <button
        onClick={onTogglePlay}
        title={isPlaying ? "Pause storm playback" : "Play 0–60 min storm rise"}
        className="flex h-7 w-7 items-center justify-center rounded-md bg-[#22C5E5] text-[#0B1018] transition hover:brightness-110"
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>

      <div className="flex w-[190px] flex-col">
        <div className="mb-1 flex items-center justify-between font-mono text-[10px] tabular-nums">
          <span className="font-semibold text-[#E5E7EB]">T+{Math.round(stormMinute)} min</span>
          <span className="text-[#94A3B8]">
            {is3D ? "3D" : "2D"} · {rainfallMmHr} mm/hr
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={60}
          step={1}
          value={Math.round(stormMinute)}
          onChange={(e) => onMinuteChange(Number(e.target.value))}
          className="w-full cursor-pointer"
        />
      </div>

      <button
        onClick={() => onMinuteChange(0)}
        title="Reset storm clock to T+0 min"
        className="rounded p-1 text-[#94A3B8] transition hover:bg-[#111925] hover:text-white"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>

      <div className="h-4 w-px bg-[#263445]" />

      <button
        onClick={onToggleFlow}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
          showFlow
            ? "border-[#22C5E5]/60 bg-[#22C5E5]/15 text-[#22C5E5]"
            : "border-[#263445] bg-[#0B1018] text-[#94A3B8] hover:text-[#E5E7EB]"
        }`}
      >
        <Waves className="h-3.5 w-3.5" />
        Flow
      </button>
    </div>
  );
}
