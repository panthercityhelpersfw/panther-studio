import { useRef } from "react";
import { useStore } from "../state/store";
import { gainToDb } from "../utils/format";

export function PadGrid() {
  const pads = useStore((s) => s.project.pads);
  const addPadFromFile = useStore((s) => s.addPadFromFile);
  const triggerPad = useStore((s) => s.triggerPad);
  const removePad = useStore((s) => s.removePad);
  const setPadGain = useStore((s) => s.setPadGain);
  const renamePad = useStore((s) => s.renamePad);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-black/40">
        <span className="text-xs text-gray-400">Sample Pads</span>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            files.forEach((f) => void addPadFromFile(f));
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="text-xs bg-accent hover:bg-accent-hover text-white rounded px-3 py-1"
        >
          + Import sample
        </button>
        <span className="text-[11px] text-gray-500">
          Click a pad or press its key to trigger.
        </span>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {pads.length === 0 ? (
          <div className="text-sm text-gray-500">
            No pads yet. Import a one-shot sample (kick, snare, vocal chop, ad-lib…).
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 max-w-3xl">
            {pads.map((pad) => (
              <div
                key={pad.id}
                className="rounded-lg border border-white/10 bg-panel-800 p-2 flex flex-col gap-1"
                style={{ borderTopColor: pad.color, borderTopWidth: 3 }}
              >
                <button
                  onPointerDown={() => triggerPad(pad.id)}
                  className="h-12 rounded bg-panel-700 hover:bg-panel-650 active:bg-accent active:text-black text-sm font-medium flex items-center justify-center"
                  title="Trigger"
                >
                  <span className="truncate px-1">{pad.name}</span>
                </button>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono bg-panel-900 rounded px-1.5 py-0.5 text-panther-gold">
                    {pad.key ? pad.key.toUpperCase() : "—"}
                  </span>
                  <button
                    onClick={() => removePad(pad.id)}
                    className="text-[10px] text-gray-500 hover:text-panther-red"
                  >
                    remove
                  </button>
                </div>
                <input
                  value={pad.name}
                  onChange={(e) => renamePad(pad.id, e.target.value)}
                  className="bg-panel-900 text-[11px] rounded px-1 py-0.5 outline-none border border-white/5"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.01}
                    value={pad.gain}
                    onChange={(e) => setPadGain(pad.id, parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-[9px] font-mono text-gray-400 w-8 text-right">
                    {gainToDb(pad.gain)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
