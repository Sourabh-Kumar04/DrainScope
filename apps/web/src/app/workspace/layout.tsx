import WorkspaceNav from "@/components/WorkspaceNav";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080B10] text-slate-100">
      <WorkspaceNav />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
