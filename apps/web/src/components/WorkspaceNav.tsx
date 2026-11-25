"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Home,
  Map as MapIcon,
  Table2,
  Waves,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/workspace", label: "Map Workspace", icon: MapIcon },
  { href: "/workspace/hotspots", label: "Risk Hotspots", icon: Table2 },
  { href: "/workspace/screener", label: "Site Screener", icon: Crosshair },
  { href: "/workspace/analytics", label: "Intervention ROI", icon: BarChart3 },
  { href: "/methodology", label: "Data & Methodology", icon: BookOpen },
];

export default function WorkspaceNav() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      className={`z-30 flex h-screen shrink-0 flex-col justify-between border-r border-[#263445] bg-[#0B1018] py-3 transition-[width] duration-200 ${
        expanded ? "w-[210px] px-3" : "w-[56px] items-center"
      }`}
    >
      <div className={`flex flex-col gap-3 ${expanded ? "w-full" : "items-center"}`}>
        <div className={`flex items-center ${expanded ? "justify-between px-1" : "justify-center"}`}>
          <Link
            href="/"
            title="DrainScope Home"
            className="flex items-center gap-2.5 text-[#22C5E5] transition hover:opacity-90"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#263445] bg-[#151D29]">
              <Waves className="h-4 w-4 text-[#22C5E5]" />
            </div>
            {expanded && (
              <span className="text-xs font-semibold tracking-[0.14em] text-[#E5E7EB]">DRAINSCOPE</span>
            )}
          </Link>
        </div>

        <div className="h-px w-full bg-[#263445]/80" />

        <nav className={`flex flex-col gap-1 ${expanded ? "w-full" : "items-center"}`}>
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/workspace" ? pathname === "/workspace" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`group relative flex items-center rounded-md transition ${
                  expanded ? "gap-2.5 px-2.5 py-2 text-xs font-medium" : "h-9 w-9 justify-center"
                } ${
                  active
                    ? "bg-[#151D29] text-[#22C5E5] ring-1 ring-inset ring-[#263445]"
                    : "text-[#94A3B8] hover:bg-[#111925] hover:text-[#E5E7EB]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {expanded ? (
                  <span className="truncate">{item.label}</span>
                ) : (
                  <span className="pointer-events-none absolute left-12 z-50 whitespace-nowrap rounded border border-[#263445] bg-[#151D29] px-2.5 py-1 text-[11px] font-medium text-[#E5E7EB] opacity-0 shadow-lg transition group-hover:opacity-100">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={`flex flex-col gap-1.5 ${expanded ? "w-full" : "items-center"}`}>
        <button
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className={`flex items-center rounded-md text-[#94A3B8] transition hover:bg-[#111925] hover:text-[#E5E7EB] ${
            expanded ? "gap-2.5 px-2.5 py-2 text-xs" : "h-9 w-9 justify-center"
          }`}
        >
          {expanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {expanded && <span>Collapse</span>}
        </button>
        <Link
          href="/"
          title="Back to Landing Page"
          className={`flex items-center rounded-md text-[#94A3B8] transition hover:bg-[#111925] hover:text-[#E5E7EB] ${
            expanded ? "gap-2.5 px-2.5 py-2 text-xs" : "h-9 w-9 justify-center"
          }`}
        >
          <Home className="h-4 w-4 shrink-0" />
          {expanded && <span>Home</span>}
        </Link>
      </div>
    </aside>
  );
}
