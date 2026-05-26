import { useStore } from "../state/store";
import type { CoachScores } from "../audio/vocalCoach";

const scoreColor = (v: number) => (v >= 80 ? "#3ddc97" : v >= 60 ? "#e8b341" : "#ff5d6c");

function ScoreRing({ label, value }: { label: string; value: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - value / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={56} height={56} className="-rotate-90">
        <circle cx={28} cy={28} r={r} fill="none" stroke="#202634" strokeWidth={5} />
        <circle cx={28} cy={28} r={r} fill="none" stroke={scoreColor(value)} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <span className="text-sm font-bold -mt-9" style={{ color: scoreColor(value) }}>{value}</span>
      <span className="text-[10px] text-gray-400 mt-6">{label}</span>
    </div>
  );
}

const SCORE_ROWS: [keyof CoachScores, string][] = [
  ["pitch", "Pitch"],
  ["timing", "Timing"],
  ["clarity", "Clarity"],
  ["energy", "Energy"],
  ["consistency", "Consistency"],
  ["mixReady", "Mix-ready"],
];

export function VocalCoach() {
  const open = useStore((s) => s.coachOpen);
  const setOpen = useStore((s) => s.setCoachOpen);
  const clip = useStore((s) => s.project.clips.find((c) => c.id === s.selectedClipId));
  const coachResult = useStore((s) => s.coachResult);
  const processing = useStore((s) => s.processing);
  const analyzeTake = useStore((s) => s.analyzeTake);
  const createPunchIn = useStore((s) => s.createPunchIn);
  const applySafeFixes = useStore((s) => s.applySafeFixes);
  const addDoubleTrack = useStore((s) => s.addDoubleTrack);
  const addHarmonyDraft = useStore((s) => s.addHarmonyDraft);
  const addIdeaToNotes = useStore((s) => s.addIdeaToNotes);
  const clearCoachNotes = useStore((s) => s.clearCoachNotes);
  const history = useStore((s) => s.project.coachHistory ?? []);
  const seek = useStore((s) => s.seek);

  if (!open) return null;

  const result = coachResult && clip && coachResult.clipId === clip.id ? coachResult.result : null;
  const isAudio = clip?.kind === "audio";
  const clipStart = clip?.startSec ?? 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
      <div className="bg-panel-850 rounded-lg border border-white/10 shadow-2xl w-[820px] max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b border-black/40 flex items-center gap-3">
          <h2 className="text-lg font-semibold">🎯 Vocal Coach</h2>
          {clip && <span className="text-xs text-gray-400 truncate">{clip.name}</span>}
          <div className="flex-1" />
          <button onClick={() => isAudio && clip && analyzeTake(clip.id)} disabled={!isAudio}
            className="text-xs bg-accent hover:bg-accent-hover text-white rounded px-3 py-1.5 disabled:opacity-40">Analyze Take</button>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="p-5 overflow-y-auto">
          {!isAudio && <div className="text-sm text-gray-500">Select a recorded vocal clip in the timeline, then click Analyze Take.</div>}

          {isAudio && !result && (
            <div className="text-sm text-gray-500">
              Click <b>Analyze Take</b> to score this vocal and get feedback. All scores come from real pitch, timing, loudness and spectral measurements.
            </div>
          )}

          {result && (
            <div className="space-y-5">
              {/* Overall + score grid */}
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-center">
                  <div className="text-4xl font-bold" style={{ color: scoreColor(result.scores.overall) }}>{result.scores.overall}</div>
                  <div className="text-[11px] text-gray-400">OVERALL</div>
                </div>
                <div className="flex gap-4 flex-wrap">
                  {SCORE_ROWS.map(([k, label]) => (
                    <ScoreRing key={k} label={label} value={result.scores[k]} />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Feedback + markers */}
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] font-semibold text-gray-300 mb-1">COACH FEEDBACK</div>
                    <ul className="space-y-1">
                      {result.feedback.map((f, i) => <li key={i} className="text-[12px] text-gray-300">• {f}</li>)}
                    </ul>
                  </div>
                  {result.markers.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-gray-300 mb-1">TIMELINE MARKERS</div>
                      <div className="space-y-1">
                        {result.markers.map((m, i) => (
                          <button key={i} onClick={() => seek(clipStart + m.timeSec)}
                            className="block w-full text-left text-[11px] hover:bg-panel-800 rounded px-1 py-0.5"
                            style={{ color: m.severity === "bad" ? "#ff5d6c" : m.severity === "warn" ? "#e8b341" : "#9aa6b8" }}>
                            ⚑ {(clipStart + m.timeSec).toFixed(1)}s — {m.text}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-[11px] font-semibold text-gray-300 mb-1">IMPROVEMENT TIPS</div>
                    <ul className="space-y-1">
                      {result.tips.map((t, i) => <li key={i} className="text-[12px] text-gray-400">• {t}</li>)}
                    </ul>
                  </div>
                </div>

                {/* Ideas + actions */}
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] font-semibold text-gray-300 mb-1">✨ SPARK IDEAS <span className="text-gray-600 font-normal">(creative suggestions)</span></div>
                    <div className="space-y-1">
                      {result.ideas.map((idea, i) => (
                        <div key={i} className="flex items-center gap-1 text-[12px] text-gray-300">
                          <span className="flex-1">• {idea}</span>
                          <button onClick={() => addIdeaToNotes(idea)} className="text-[10px] text-accent hover:underline shrink-0">+ notes</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold text-gray-300 mb-1">ONE-CLICK ACTIONS</div>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => clip && void applySafeFixes(clip.id)} disabled={processing} className="text-[11px] bg-panther-green text-black rounded px-2 py-1 disabled:opacity-50">Apply Safe Fixes</button>
                      <button onClick={() => clip && createPunchIn(clip.id)} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Create Punch-In</button>
                      <button onClick={() => clip && addDoubleTrack(clip.id)} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Add Double</button>
                      <button onClick={() => clip && void addHarmonyDraft(clip.id)} disabled={processing} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1 disabled:opacity-50">Add Harmony</button>
                      <button onClick={clearCoachNotes} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Clear markers</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trend */}
              {history.length > 1 && (
                <div>
                  <div className="text-[11px] font-semibold text-gray-300 mb-1">TREND (recent overall scores)</div>
                  <div className="flex items-end gap-1 h-12">
                    {history.slice(0, 20).reverse().map((h) => (
                      <div key={h.id} title={`${h.clipName}: ${h.scores.overall}`} className="flex-1 rounded-t" style={{ height: `${h.scores.overall}%`, background: scoreColor(h.scores.overall), minWidth: 4 }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
