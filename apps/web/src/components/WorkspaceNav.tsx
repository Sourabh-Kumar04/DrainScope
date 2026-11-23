"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Crosshair, Home, Map as MapIcon, Table2, Waves } from "lucide-react";

const NAV_ITEMS = [
  { href: "/workspace", label: "Map Studio", icon: MapIcon },
  { href: "/workspace/hotspots", label: "Hotspots", icon: Table2 },
  { href: "/workspace/screener", label: "Site Screener", icon: Crosshair },
  { href: "/workspace/analytics", label: "NbS ROI", icon: BarChart3 },
  { href: "/methodology", label: "Methodology", icon: BookOpen },
];

export default function WorkspaceNav() {
  const pathname = usePathname();

  return (
    <aside className="z-30 flex h-screen w-[64px] shrink-0 flex-col items-center justify-between border-r border-white/10 bg-[#080C12] py-4">
      <div className="flex flex-col items-center gap-3">
        <Link
          href="/"
          title="DrainScope Home"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#C8FF00]/15 text-[#C8FF00] ring-1 ring-[#C8FF00]/40 transition hover:bg-[#C8FF00]/25"
        >
          <Waves className="h-5 w-5" />
        </Link>

        <div className="my-1 h-px w-7 bg-white/10" />

        <nav className="flex flex-col items-center gap-2">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/workspace" ? pathname === "/workspace" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
                  active
                    ? "bg-[#C8FF00] text-[#080C12] shadow-[0_0_18px_rgba(200,255,0,0.35)]"
                    : "text-slate-400 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-lg border border-white/10 bg-[#0C121A] px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 shadow-xl transition group-hover:opacity-100">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <Link
        href="/"
        title="Back to Landing Page"
        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
      >
        <Home className="h-4 w-4" />
      </Link>
    </aside>
  );
}
