import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";

/** Compact File menu: Save / Save As / project bundles / Library. */
export function FileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const bundleInput = useRef<HTMLInputElement>(null);
  const saveNow = useStore((s) => s.saveNow);
  const saveProjectAs = useStore((s) => s.saveProjectAs);
  const exportBundle = useStore((s) => s.exportBundle);
  const importBundle = useStore((s) => s.importBundle);
  const setLibraryOpen = useStore((s) => s.setLibraryOpen);
  const projectName = useStore((s) => s.project.name);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const Item = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button
      onClick={() => { onClick(); setOpen(false); }}
      className="w-full text-left text-xs px-3 py-1.5 hover:bg-panel-700 rounded"
    >
      {label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`h-9 px-3 rounded-md text-xs ${open ? "bg-accent text-white" : "bg-panel-700 hover:bg-panel-650 text-gray-200"}`}
        title="File"
      >
        File
      </button>
      {open && (
        <div className="absolute z-40 top-11 right-0 w-48 bg-panel-800 border border-white/10 rounded-lg shadow-2xl p-1">
          <Item label="Save" onClick={() => void saveNow()} />
          <Item label="Save As…" onClick={() => { const n = prompt("Save project as:", projectName + " copy"); if (n) void saveProjectAs(n); }} />
          <div className="h-px bg-white/10 my-1" />
          <Item label="Export project bundle…" onClick={() => void exportBundle()} />
          <Item label="Open project bundle…" onClick={() => bundleInput.current?.click()} />
          <div className="h-px bg-white/10 my-1" />
          <Item label="Library…" onClick={() => setLibraryOpen(true)} />
          <input
            ref={bundleInput}
            type="file"
            accept=".panther,application/json"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBundle(f); e.target.value = ""; }}
          />
        </div>
      )}
    </div>
  );
}
