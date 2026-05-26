import { useStore } from "../state/store";

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-panel-900 rounded p-2 border border-white/5">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-sm font-mono ${warn ? "text-panther-red" : "text-gray-200"}`}>
        {value}
      </div>
    </div>
  );
}

export function EnhanceReport() {
  const report = useStore((s) => s.enhanceReport);
  const dismiss = useStore((s) => s.dismissEnhanceReport);
  if (!report) return null;
  const a = report.analysis;
  const g = a.guesses;
  const flags = [
    g.quiet && "Quiet",
    g.clipping && "Clipping",
    g.boomy && "Boomy",
    g.harsh && "Harsh",
    g.dull && "Dull",
  ].filter(Boolean) as string[];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
      <div className="bg-panel-800 rounded-lg border border-white/10 shadow-2xl w-[560px] max-h-[80vh] flex flex-col">
        <div className="px-5 py-3 border-b border-black/40 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            ✨ Auto Vocal Enhance — {report.trackName}
          </h2>
          <button onClick={dismiss} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-gray-400 mb-2">What I measured</h3>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Peak" value={`${a.peakDb.toFixed(1)} dBFS`} warn={g.clipping} />
              <Stat label="RMS" value={`${a.rmsDb.toFixed(1)} dBFS`} warn={g.quiet} />
              <Stat label="Loudness" value={`${a.loudnessDb.toFixed(1)} dB`} />
              <Stat label="Clipped" value={`${a.clippedPct.toFixed(2)}%`} warn={g.clipping} />
              <Stat label="Low/Mid/High" value={`${Math.round(a.lowRatio * 100)}/${Math.round(a.midRatio * 100)}/${Math.round(a.highRatio * 100)}`} />
              <Stat label="Flags" value={flags.length ? flags.join(", ") : "Clean"} warn={flags.length > 0} />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 mb-2">What I changed</h3>
            <ul className="space-y-1">
              {report.changes.map((c, i) => (
                <li key={i} className="text-sm text-gray-200 flex gap-2">
                  <span className="text-panther-green">✓</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-black/40 flex justify-end">
          <button
            onClick={dismiss}
            className="px-4 py-2 rounded text-sm bg-accent hover:bg-accent-hover text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
