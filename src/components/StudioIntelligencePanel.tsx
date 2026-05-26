import { STUDIO_FACTORY_PRESETS } from "../audio/studioIntelligence";
import { useStore } from "../state/store";

const scoreKeys = [
  ["overall", "Overall"],
  ["vocalPresence", "Vocal"],
  ["mixClarity", "Clarity"],
  ["masterReadiness", "Master"],
  ["timingTightness", "Timing"],
  ["arrangementFlow", "Flow"],
] as const;

function ScorePill({ label, value }: { label: string; value: number }) {
  const tone = value >= 80 ? "text-panther-green" : value >= 65 ? "text-panther-gold" : "text-red-300";
  return (
    <div className="h-12 min-w-20 rounded bg-panel-900 border border-white/5 px-2 py-1 flex flex-col justify-center">
      <span className="text-[9px] text-gray-500 uppercase">{label}</span>
      <span className={`text-lg leading-5 font-semibold ${tone}`}>{value}</span>
    </div>
  );
}

function severityClass(severity: string) {
  if (severity === "high") return "text-red-300 border-red-400/30";
  if (severity === "medium") return "text-panther-gold border-panther-gold/30";
  return "text-gray-300 border-white/10";
}

export function StudioIntelligencePanel() {
  const project = useStore((s) => s.project);
  const report = useStore((s) => s.studioIntelligenceReport ?? s.project.studioIntelligence?.current ?? null);
  const busy = useStore((s) => s.studioIntelligenceBusy);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const analyze = useStore((s) => s.analyzeStudioIntelligence);
  const applyRec = useStore((s) => s.applyStudioRecommendation);
  const rejectRec = useStore((s) => s.rejectStudioRecommendation);
  const applyPreset = useStore((s) => s.applyFactoryFxPreset);
  const memory = project.studioIntelligence?.memory;

  const topRecs = report?.recommendations.slice(0, 6) ?? [];
  const factory = STUDIO_FACTORY_PRESETS.slice(0, 7);

  return (
    <div className="flex-1 min-w-0 grid grid-cols-[1.1fr_1.4fr_1fr] gap-3 p-3 overflow-hidden">
      <div className="min-w-0 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-white">Studio Intelligence</div>
            <div className="text-[10px] text-gray-500">
              {report ? `Measured ${report.trackCount} tracks, ${report.clipCount} clips` : "Run a measurement-backed project scan"}
            </div>
          </div>
          <button
            onClick={() => void analyze()}
            disabled={busy}
            className="h-7 px-3 rounded bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-[11px]"
          >
            {busy ? "Analyzing..." : "Analyze"}
          </button>
        </div>

        {report ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {scoreKeys.map(([key, label]) => (
                <ScorePill key={key} label={label} value={report.scores[key]} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400">
              <div className="rounded bg-panel-900 border border-white/5 p-2">
                <div className="text-gray-500">Key estimate</div>
                <div className="text-white">{report.keyEstimate} {report.scaleEstimate}</div>
              </div>
              <div className="rounded bg-panel-900 border border-white/5 p-2">
                <div className="text-gray-500">Performance risk</div>
                <div className="text-white capitalize">{report.performance.risk}</div>
              </div>
              <div className="rounded bg-panel-900 border border-white/5 p-2">
                <div className="text-gray-500">Master peak</div>
                <div className="text-white">{report.master ? `${report.master.peakDb.toFixed(1)} dB` : "No mix"}</div>
              </div>
              <div className="rounded bg-panel-900 border border-white/5 p-2">
                <div className="text-gray-500">Local learning</div>
                <div className="text-white">{memory ? Object.keys(memory.acceptedSuggestionKinds).length : 0} accepted types</div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 rounded bg-panel-900 border border-white/5 p-3 text-xs text-gray-500">
            Analysis uses decoded audio, stems, clip timing, pitch frames, spectral bands, stereo metrics, arrangement density, and project settings. Recommendations show their measured evidence.
          </div>
        )}
      </div>

      <div className="min-w-0 flex flex-col gap-2">
        <div className="text-[11px] text-gray-400 uppercase tracking-wide">Suggestion Queue</div>
        <div className="flex-1 overflow-auto pr-1 space-y-2">
          {topRecs.length === 0 && (
            <div className="rounded bg-panel-900 border border-white/5 p-3 text-xs text-gray-500">
              No queued recommendations. Run analysis after recording, editing, or changing the mix.
            </div>
          )}
          {topRecs.map((r) => (
            <div key={r.id} className={`rounded bg-panel-900 border p-2 ${severityClass(r.severity)}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-white truncate">{r.title}</div>
                  <div className="text-[10px] text-gray-400 line-clamp-2">{r.detail}</div>
                </div>
                <div className="text-[10px] text-gray-500 shrink-0">{Math.round(r.confidence)}%</div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.evidence.slice(0, 3).map((e) => (
                  <span key={`${r.id}:${e.metric}`} className="text-[9px] px-1.5 py-0.5 rounded bg-black/20 text-gray-400">
                    {e.metric}: {String(e.value)}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => void applyRec(r.id)}
                  disabled={r.informationalOnly}
                  className="text-[10px] px-2 h-6 rounded bg-accent hover:bg-accent-hover disabled:opacity-40 text-white"
                >
                  {r.safeToAutoFix ? "Apply" : "Open"}
                </button>
                <button onClick={() => rejectRec(r.id)} className="text-[10px] px-2 h-6 rounded bg-panel-700 hover:bg-panel-650 text-gray-300">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-gray-400 uppercase tracking-wide">Smart FX</div>
          <div className="text-[10px] text-gray-600">{selectedTrackId ? "Track ready" : "Select track"}</div>
        </div>
        <div className="flex-1 overflow-auto pr-1 space-y-2">
          {factory.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className="w-full text-left rounded bg-panel-900 border border-white/5 hover:border-accent/50 p-2"
              title={p.intendedUse}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-white truncate">{p.name}</span>
                <span className="text-[9px] text-gray-500 uppercase">{p.intensity}</span>
              </div>
              <div className="text-[10px] text-gray-500 line-clamp-2">{p.intendedUse}</div>
              <div className="mt-1 text-[9px] text-gray-600">{p.category} / {p.routing}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
