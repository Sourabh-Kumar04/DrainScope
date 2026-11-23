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
    <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/15 bg-[#0C121A]/92 px-4 py-2.5 backdrop-blur-xl shadow-2xl">
      <button
        onClick={onTogglePlay}
        title={isPlaying ? "Pause storm playback" : "Play 0–60 min storm rise"}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C8FF00] text-[#080B10] shadow-[0_0_16px_rgba(200,255,0,0.35)] transition hover:brightness-105"
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>

      <div className="flex w-[195px] flex-col">
        <div className="mb-1 flex items-center justify-between font-mono text-[10px]">
          <span className="font-bold text-white">T+{Math.round(stormMinute)} min</span>
          <span className="text-slate-400">
            {is3D ? "3D Rise" : "2D Fill"} · {rainfallMmHr} mm/hr
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
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>

      <div className="h-5 w-px bg-white/10" />

      <button
        onClick={onToggleFlow}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
          showFlow
            ? "border border-cyan-400/60 bg-cyan-400/20 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.25)]"
            : "border border-white/10 bg-white/5 text-slate-400 hover:text-white"
        }`}
      >
        <Waves className="h-3.5 w-3.5" />
        Flow
      </button>
    </div>
  );
}
