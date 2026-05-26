import { useStore } from "../state/store";

const sevColor = (s: "ok" | "warn" | "bad") =>
  s === "bad" ? "text-panther-red" : s === "warn" ? "text-panther-gold" : "text-panther-green";

/** Pro mixing assistant: per-track analysis with one-click fixes, plus
 *  auto gain-staging and bus routing. */
export function MixAssistant() {
  const reports = useStore((s) => s.mixReports);
  const analyzing = useStore((s) => s.analyzing);
  const analyzeMixNow = useStore((s) => s.analyzeMixNow);
  const applyMixFix = useStore((s) => s.applyMixFix);
  const autoGainStage = useStore((s) => s.autoGainStage);
  const autoRouteBuses = useStore((s) => s.autoRouteBuses);
  const buses = useStore((s) => s.project.buses ?? []);
  const setBusGain = useStore((s) => s.setBusGain);
  const toggleBusMute = useStore((s) => s.toggleBusMute);

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-black/30">
          <button onClick={() => void analyzeMixNow()} disabled={analyzing}
            className="text-[11px] bg-accent hover:bg-accent-hover text-white rounded px-3 py-1 disabled:opacity-50">
            {analyzing ? "Analyzing…" : "Analyze mix"}
          </button>
          <button onClick={() => void autoGainStage()} disabled={analyzing}
            className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-3 py-1">Auto gain-stage</button>
          <button onClick={autoRouteBuses}
            className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-3 py-1">Auto-route buses</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {!reports && <div className="text-xs text-gray-500 p-3">Click "Analyze mix" to scan every track for clipping, level, mud, harshness and over-compression.</div>}
          {reports?.filter((r) => r.hasAudio).map((r) => (
            <div key={r.trackId} className="bg-panel-900 rounded p-2 border border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-sm">{r.trackName}</span>
                <span className="text-[10px] font-mono text-gray-500">peak {r.peakDb.toFixed(1)} · RMS {r.rmsDb.toFixed(1)} · crest {r.crest.toFixed(1)}</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {r.issues.map((iss, i) => (
                  <div key={i} className={`text-[11px] ${sevColor(iss.severity)}`}>• {iss.text}</div>
                ))}
              </div>
              {r.fixes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {r.fixes.map((f) => (
                    <button key={f.kind} onClick={() => applyMixFix(r.trackId, f.kind)}
                      className="text-[10px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-0.5">{f.label}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {reports && reports.filter((r) => r.hasAudio).length === 0 && (
            <div className="text-xs text-gray-500 p-3">No audio tracks to analyze yet.</div>
          )}
        </div>
      </div>

      {/* Buses */}
      <div className="w-52 shrink-0 border-l border-black/40 p-2 space-y-2 overflow-y-auto">
        <div className="text-[11px] font-semibold text-gray-300">MIX BUSES</div>
        {buses.map((b) => (
          <div key={b.id} className="bg-panel-900 rounded p-2 border border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-xs">{b.name}</span>
              <button onClick={() => toggleBusMute(b.id)}
                className={`text-[10px] rounded px-1.5 py-0.5 ${b.muted ? "bg-panther-red text-black" : "bg-panel-700 text-gray-300"}`}>
                {b.muted ? "Muted" : "Mute"}
              </button>
            </div>
            <input type="range" min={0} max={1.5} step={0.01} value={b.gain}
              onChange={(e) => setBusGain(b.id, parseFloat(e.target.value))} className="w-full mt-1" />
          </div>
        ))}
        <div className="text-[10px] text-gray-600">Assign tracks to buses in each track's header, or use Auto-route.</div>
      </div>
    </div>
  );
}
