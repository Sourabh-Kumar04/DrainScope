"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Crosshair,
  Droplets,
  Layers,
  Map as MapIcon,
  ShieldCheck,
  Table2,
  Waves,
} from "lucide-react";
import { simulateOrganicZones } from "@/lib/api";
import type { CatchmentSummary } from "@/lib/types";

export default function LandingPage() {
  const [summary, setSummary] = useState<CatchmentSummary | null>(null);
  const [previewRain, setPreviewRain] = useState<number>(60);

  useEffect(() => {
    const controller = new AbortController();
    simulateOrganicZones(
      "barapullah",
      {
        rainfall_mm_hr: previewRain,
        projection_years: 0,
        nbs_impervious_reduction_pct: 0,
        park_detention_enabled: false,
      },
      controller.signal
    )
      .then((res) => setSummary(res.summary))
      .catch(() => {});
    return () => controller.abort();
  }, [previewRain]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#080B10] text-[#E8EDF5]">
      {/* Ambient Neon-Lime Radial Spotlight (inspired by dark editorial hero aesthetic) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-[-140px] h-[540px] w-[780px] -translate-x-1/2 rounded-full bg-[#C8FF00]/[0.09] blur-[130px]"
      />

      {/* Minimal Floating Navbar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#080B10]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C8FF00] text-[#080B10]">
              <Waves className="h-4 w-4 stroke-[2.5]" />
            </div>
            <span className="text-sm font-extrabold tracking-[0.18em] text-[#F4F6F9]">DRAINSCOPE</span>
          </Link>

          <nav className="hidden items-center gap-7 text-xs font-medium text-slate-400 md:flex">
            <Link href="/workspace" className="transition hover:text-[#F4F6F9]">Map Studio</Link>
            <Link href="/workspace/hotspots" className="transition hover:text-[#F4F6F9]">Hotspots</Link>
            <Link href="/workspace/screener" className="transition hover:text-[#F4F6F9]">Site Screener</Link>
            <Link href="/workspace/analytics" className="transition hover:text-[#F4F6F9]">NbS ROI</Link>
            <Link href="/methodology" className="transition hover:text-[#F4F6F9]">Methodology</Link>
          </nav>

          <Link
            href="/workspace"
            className="flex items-center gap-1.5 rounded-full bg-[#C8FF00] px-4 py-2 text-xs font-bold text-[#080B10] shadow-[0_0_24px_rgba(200,255,0,0.28)] transition hover:brightness-105"
          >
            Open Studio
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Editorial Product-Led Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          {/* Left: High-Contrast Condensed Editorial Copy */}
          <div className="lg:col-span-7">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C8FF00]">
              Urban Flood Intelligence · South Delhi Pilot
            </p>

            <h1 className="mt-4 text-5xl font-black leading-[0.98] tracking-[-0.04em] text-[#F4F6F9] sm:text-7xl">
              SEE WHERE CITIES{" "}
              <span className="text-[#C8FF00]">FLOOD</span> BEFORE THE RAIN HITS.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400">
              Pinpoint street-level waterlogging pockets, test green drainage fixes in real time, and screen any
              property or portfolio in seconds—powered by open terrain and satellite data.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/workspace"
                className="flex items-center gap-2 rounded-full bg-[#C8FF00] px-6 py-3.5 text-sm font-extrabold text-[#080B10] shadow-[0_0_32px_rgba(200,255,0,0.3)] transition hover:brightness-105"
              >
                <MapIcon className="h-4 w-4" />
                Launch Map Studio
              </Link>
              <Link
                href="/workspace/screener"
                className="flex items-center gap-2 rounded-full border border-white/15 bg-[#101620] px-6 py-3.5 text-sm font-semibold text-[#F4F6F9] transition hover:border-white/30 hover:bg-[#161F2D]"
              >
                <Crosshair className="h-4 w-4 text-[#C8FF00]" />
                Screen a Site
              </Link>
            </div>
          </div>

          {/* Right: Interactive Live Product Preview Card (Above-the-Fold Demo) */}
          <div className="lg:col-span-5">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#101620] p-6 shadow-2xl">
              <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#C8FF00]/15 blur-3xl" />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
                    Live Catchment Preview
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-[#F4F6F9]">Barapullah Basin · 78 km²</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-[#C8FF00]/15 px-2.5 py-1 font-mono text-[10px] font-bold text-[#C8FF00]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#C8FF00] animate-pulse" />
                  LIVE API
                </span>
              </div>

              {/* Interactive Storm Toggle right inside the Hero */}
              <div className="mt-5 rounded-2xl border border-white/[0.07] bg-[#161F2D] p-3.5">
                <div className="mb-2 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 font-medium text-slate-300">
                    <Droplets className="h-3.5 w-3.5 text-[#C8FF00]" />
                    Test a Rainfall Burst
                  </span>
                  <span className="font-mono font-bold text-[#C8FF00]">{previewRain} mm/hr</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[25, 60, 100, 140].map((mm) => (
                    <button
                      key={mm}
                      onClick={() => setPreviewRain(mm)}
                      className={`rounded-xl py-1.5 font-mono text-xs font-bold transition ${
                        previewRain === mm
                          ? "bg-[#C8FF00] text-[#080B10]"
                          : "bg-[#0C121A] text-slate-400 hover:text-white"
                      }`}
                    >
                      {mm}mm
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Numbers Responding to the Hero Toggle */}
              <div className="mt-4 grid grid-cols-3 gap-2.5 font-mono">
                <div className="rounded-2xl border border-white/[0.06] bg-[#0C121A] p-3.5">
                  <p className="font-sans text-[10px] text-slate-400">Critical</p>
                  <p className="mt-1 text-2xl font-bold text-rose-400">{summary?.critical_count ?? "—"}</p>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-[#0C121A] p-3.5">
                  <p className="font-sans text-[10px] text-slate-400">High Risk</p>
                  <p className="mt-1 text-2xl font-bold text-orange-400">{summary?.high_count ?? "—"}</p>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-[#0C121A] p-3.5">
                  <p className="font-sans text-[10px] text-slate-400">Mean Risk</p>
                  <p className="mt-1 text-2xl font-bold text-[#C8FF00]">
                    {summary ? `${Math.round(summary.mean_wsi * 100)}%` : "—"}
                  </p>
                </div>
              </div>

              <Link
                href={`/workspace?rain=${previewRain}`}
                className="mt-4 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#161F2D] px-4 py-3 text-xs font-semibold text-[#F4F6F9] transition hover:border-[#C8FF00]/50"
              >
                <span>Open {previewRain} mm/hr scenario on the interactive map</span>
                <ArrowUpRight className="h-4 w-4 text-[#C8FF00]" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Feature Grid (Surface Stepping: #080B10 -> #101620 -> #161F2D) */}
      <section className="border-t border-white/[0.07] bg-[#0B0F17] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#C8FF00]">
                Four Connected Workflows
              </p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#F4F6F9]">
                From city-wide triage to street-level fixes.
              </h2>
            </div>
            <Link
              href="/methodology"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 transition hover:text-[#C8FF00]"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Read Methodology &amp; Data Licenses
            </Link>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: MapIcon,
                tag: "01 · MAP STUDIO",
                title: "Street-Level X-Ray",
                desc: "Toggle Dark & Satellite views, inspect nearest OSM trunk drains, plot historical flood pins, and launch 360° Street View.",
                href: "/workspace",
              },
              {
                icon: Table2,
                tag: "02 · TRIAGE",
                title: "Hotspot Register",
                desc: "Sort every waterlogging zone by priority, Rain-to-Flood threshold, or underpass traps—and export clean CSV or GeoJSON.",
                href: "/workspace/hotspots",
              },
              {
                icon: Crosshair,
                tag: "03 · PORTFOLIOS",
                title: "Site Flood Screener",
                desc: "Paste up to 100 coordinates to score properties 0–100 with screening ponding depths and nearest drainage access.",
                href: "/workspace/screener",
              },
              {
                icon: BarChart3,
                tag: "04 · ECONOMICS",
                title: "NbS Park ROI",
                desc: "Compare Baseline vs. Stress scenarios, rank public parks by detention capacity (KL), and estimate ₹/KL relief budgets.",
                href: "/workspace/analytics",
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.title}
                  href={card.href}
                  className="group flex flex-col justify-between rounded-3xl border border-white/[0.08] bg-[#101620] p-6 transition hover:-translate-y-0.5 hover:border-[#C8FF00]/45 hover:bg-[#141C29]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-slate-500">
                        {card.tag}
                      </span>
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#161F2D] text-[#C8FF00]">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <h3 className="mt-5 text-lg font-bold text-[#F4F6F9]">{card.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">{card.desc}</p>
                  </div>
                  <span className="mt-6 inline-flex items-center gap-1 text-xs font-bold text-[#C8FF00]">
                    Explore
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Grounded Engineering Footer */}
      <footer className="border-t border-white/[0.07] py-12">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-3">
          <div className="flex items-start gap-3">
            <Layers className="mt-0.5 h-4 w-4 shrink-0 text-[#C8FF00]" />
            <div>
              <p className="text-xs font-bold text-[#F4F6F9]">Commercial-Safe Open Data</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Copernicus GLO-30 DEM, ESA WorldCover 10m (CC BY 4.0), and &copy; OpenStreetMap contributors (ODbL).
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#C8FF00]" />
            <div>
              <p className="text-xs font-bold text-[#F4F6F9]">Deterministic Hydrology Core</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                WhiteboxTools terrain metrics and zone-scale Rational Method (&le;50 ha cap) with explicit &plusmn;30m screening bounds.
              </p>
            </div>
          </div>
          <div className="flex items-center md:justify-end">
            <Link
              href="/methodology"
              className="rounded-full border border-white/15 bg-[#101620] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#C8FF00]/40 hover:text-white"
            >
              Validation &amp; Licenses &rarr;
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
