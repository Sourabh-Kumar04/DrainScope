import { Suspense } from "react";
import CatchmentWorkspace from "@/components/CatchmentWorkspace";

export default function WorkspaceMapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-[#080B10] font-mono text-xs text-slate-400">
          Loading Barapullah Map Studio…
        </div>
      }
    >
      <CatchmentWorkspace />
    </Suspense>
  );
}
