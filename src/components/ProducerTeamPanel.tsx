import { useMemo } from "react";
import { useStore } from "../state/store";
import type { StudioRecommendation } from "../audio/studioIntelligence";
import type { ProducerTeamNote } from "../state/types";

type RoleId = "vocal" | "mix" | "master" | "producer" | "songwriter" | "performance";

const ROLES: { id: RoleId; title: string; remit: string; domains: StudioRecommendation["domain"][] }[] = [
  { id: "vocal", title: "Vocal Coach", remit: "Pitch, timing, delivery, punch-ins, doubles, and harmony ideas.", domains: ["pitch", "timing", "vocal"] },
  { id: "mix", title: "Mix Engineer", remit: "Track tone, masking, level control, mud, harshness, and FX choices.", domains: ["mix", "fx"] },
  { id: "master", title: "Mastering Engineer", remit: "Loudness, clipping risk, width, export safety, and streaming targets.", domains: ["master"] },
  { id: "producer", title: "Producer", remit: "Arrangement pacing, hook lift, transitions, contrast, and creative direction.", domains: ["arrangement", "memory"] },
  { id: "songwriter", title: "Songwriter", remit: "Lyrics, rhyme scheme, hook strength, phrase density, and emotional clarity.", domains: [] },
  { id: "performance", title: "Performance Guardian", remit: "Lag risk, project weight, analyzer throttling, freeze/bounce advice.", domains: ["performance"] },
];

const actionText = (rec: StudioRecommendation) => {
  if (!rec.action) return "Review";
  switch (rec.action.kind) {
    case "track-preset": return "Apply chain";
    case "master-target": return "Apply master target";
    case "cleanup-vocal": return "Clean vocal";
    case "autotune": return "Tune phrase";
    case "level-ride": return "Level phrase";
    case "auto-gain-stage": return "Gain stage";
    case "stereo-width": return "Set width";
    case "add-marker": return "Add marker";
    case "double-vocal": return "Create double";
    case "harmony-draft": return "Create harmony";
    case "notes": return "Acknowledge";
    default: return "Apply";
  }
};

const fmtTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

function RecommendationCard({ rec, role }: { rec: StudioRecommendation; role: string }) {
  const apply = useStore((s) => s.applyStudioRecommendation);
  const dismiss = useStore((s) => s.rejectStudioRecommendation);
  const addIdeaToNotes = useStore((s) => s.addIdeaToNotes);
  const markerTime = rec.action?.kind === "add-marker" ? rec.action.timeSec : null;

  return (
    <div className="bg-panel-950 border border-white/5 rounded-md p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold truncate">{rec.title}</h4>
            <span className={`text-[9px] uppercase ${rec.severity === "high" ? "text-panther-red" : rec.severity === "medium" ? "text-panther-gold" : "text-gray-500"}`}>
              {rec.severity}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-gray-400 leading-4">{rec.detail}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-gray-500">
            <span>Confidence {Math.round(rec.confidence * 100)}%</span>
            <span>Impact {Math.round(rec.impact * 100)}%</span>
            {markerTime !== null && <span>Timeline {fmtTime(markerTime)}</span>}
            {rec.safeToAutoFix ? <span className="text-panther-green">Safe fix</span> : <span>User review</span>}
          </div>
          {rec.evidence.length > 0 && (
            <div className="mt-2 text-[10px] text-gray-600">
              {rec.evidence.slice(0, 2).map((ev) => `${ev.metric}: ${ev.value}${ev.threshold ? ` (target ${ev.threshold})` : ""}`).join(" / ")}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => void apply(rec.id)}
          disabled={rec.informationalOnly && !rec.action}
          className="text-[10px] bg-accent hover:bg-accent-hover disabled:bg-panel-800 disabled:text-gray-600 text-white rounded px-2 py-1"
        >
          {actionText(rec)}
        </button>
        <button onClick={() => addIdeaToNotes(`${role}: ${rec.title} - ${rec.detail}`)} className="text-[10px] bg-panel-800 hover:bg-panel-750 rounded px-2 py-1">
          Save to notes
        </button>
        <button onClick={() => dismiss(rec.id)} className="text-[10px] text-gray-500 hover:text-gray-300 px-1 py-1">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function TeamNoteCard({ note }: { note: ProducerTeamNote }) {
  const apply = useStore((s) => s.applyProducerTeamNote);
  const dismiss = useStore((s) => s.dismissProducerTeamNote);
  const save = useStore((s) => s.saveProducerTeamNote);
  const statusTone = note.status === "applied" ? "text-panther-green" : note.status === "saved" ? "text-panther-gold" : note.status === "dismissed" ? "text-gray-600" : "text-gray-400";

  return (
    <div className="bg-panel-950 border border-white/5 rounded-md p-3">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold flex-1 truncate">{note.title}</h4>
        <span className={`text-[9px] uppercase ${note.severity === "high" ? "text-panther-red" : note.severity === "medium" ? "text-panther-gold" : "text-gray-500"}`}>{note.severity}</span>
      </div>
      <p className="mt-1 text-[11px] text-gray-400 leading-4">{note.detail}</p>
      <p className="mt-2 text-[10px] text-gray-600 leading-4">Why this matters: {note.why}</p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-gray-500">
        <span>Confidence {Math.round(note.confidence * 100)}%</span>
        {note.timeSec != null && <span>Timeline {fmtTime(note.timeSec)}</span>}
        {note.lineId && <span>Lyric line linked</span>}
        <span className={statusTone}>{note.status}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => apply(note.id)} disabled={!note.action || note.status === "applied"} className="text-[10px] bg-accent hover:bg-accent-hover disabled:bg-panel-800 disabled:text-gray-600 text-white rounded px-2 py-1">
          {note.action === "mark-punch" ? "Mark punch" : note.action === "mark-double" ? "Mark double" : note.action === "mark-adlib" ? "Mark ad-lib" : note.action === "mark-breath" ? "Mark breath" : "Apply"}
        </button>
        <button onClick={() => save(note.id)} className="text-[10px] bg-panel-800 hover:bg-panel-750 rounded px-2 py-1">Save to notes</button>
        <button onClick={() => dismiss(note.id)} className="text-[10px] text-gray-500 hover:text-gray-300 px-1 py-1">Dismiss</button>
      </div>
    </div>
  );
}

export function ProducerTeamPanel() {
  const report = useStore((s) => s.studioIntelligenceReport ?? s.project.studioIntelligence?.current);
  const busy = useStore((s) => s.studioIntelligenceBusy);
  const analyze = useStore((s) => s.analyzeStudioIntelligence);
  const health = useStore((s) => s.performanceHealth ?? s.project.performanceHealth);
  const runGuardian = useStore((s) => s.runPerformanceGuardian);
  const selectedClipId = useStore((s) => s.selectedClipId);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const createVocalStack = useStore((s) => s.createVocalStack);
  const autoGainStage = useStore((s) => s.autoGainStage);
  const makeItHit = useStore((s) => s.makeItHit);
  const makeItEmotional = useStore((s) => s.makeItEmotional);
  const autoMaster = useStore((s) => s.autoMaster);
  const freezeTrack = useStore((s) => s.freezeTrack);
  const applyFactoryFxPreset = useStore((s) => s.applyFactoryFxPreset);
  const generateStressTestProject = useStore((s) => s.generateStressTestProject);
  const lyricNotes = useStore((s) => s.project.producerTeam?.notes ?? []);
  const runLyricCoach = useStore((s) => s.runLyricCoach);

  const grouped = useMemo(() => {
    const recs = report?.recommendations ?? [];
    return ROLES.map((role) => ({
      ...role,
      recs: recs
        .filter((rec) => role.domains.includes(rec.domain))
        .sort((a, b) => b.urgency + b.impact - (a.urgency + a.impact))
        .slice(0, 4),
    }));
  }, [report]);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-panel-900/35">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-wide">Producer Team</h3>
          <p className="text-[11px] text-gray-500">Role-based guidance from measured project analysis, not generated guesswork.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => runLyricCoach()} className="text-[11px] bg-panel-800 hover:bg-panel-750 border border-white/10 rounded px-3 py-1.5">
            Lyric coach
          </button>
          <button onClick={() => runGuardian("Producer Team check")} className="text-[11px] bg-panel-800 hover:bg-panel-750 border border-white/10 rounded px-3 py-1.5">
            Check performance
          </button>
          <button onClick={() => void analyze()} disabled={busy} className="text-[11px] bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded px-3 py-1.5">
            {busy ? "Scanning..." : "Run scan"}
          </button>
        </div>
      </div>

      {health && (
        <div className={`rounded-md border px-3 py-2 text-[11px] ${health.risk === "high" ? "border-panther-red/30 bg-panther-red/10" : health.risk === "medium" ? "border-panther-gold/30 bg-panther-gold/10" : "border-panther-green/20 bg-panther-green/10"}`}>
          Performance Guardian: {health.score}/100, {health.risk} risk. {(health.suggestions ?? []).slice(0, 2).join(" ")}
        </div>
      )}

      <div className="bg-panel-850 border border-white/5 rounded-md p-3">
        <div className="mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-200">One-click Safe Fixes</h4>
          <p className="text-[10px] text-gray-500 mt-0.5">These actions run through real project state: chain changes, automation-friendly levels, stacks, mastering, and freeze.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => selectedTrackId && applyFactoryFxPreset("bring-vocal-forward", selectedTrackId)} disabled={!selectedTrackId} className="studio-mini-command disabled:opacity-40">Fix buried vocal</button>
          <button onClick={() => void autoGainStage()} className="studio-mini-command">Clean muddy mix</button>
          <button onClick={() => selectedTrackId && applyFactoryFxPreset("intimate-verse", selectedTrackId)} disabled={!selectedTrackId} className="studio-mini-command disabled:opacity-40">Reduce harshness</button>
          <button onClick={() => void makeItEmotional()} className="studio-mini-command">Widen hook</button>
          <button onClick={() => selectedClipId && createVocalStack(selectedClipId)} disabled={!selectedClipId} className="studio-mini-command disabled:opacity-40">Create vocal stack</button>
          <button onClick={() => void makeItHit()} className="studio-mini-command">Add transition</button>
          <button onClick={() => void autoMaster("streaming")} className="studio-mini-command">Master for streaming</button>
          <button onClick={() => selectedTrackId && void freezeTrack(selectedTrackId)} disabled={!selectedTrackId} className="studio-mini-command disabled:opacity-40">Freeze heavy track</button>
          <button onClick={() => void generateStressTestProject()} className="studio-mini-command">Stress test</button>
        </div>
      </div>

      {!report && (
        <div className="border border-dashed border-white/10 rounded-md p-6 text-center">
          <div className="text-sm font-medium">No current intelligence report</div>
          <p className="mt-1 text-[11px] text-gray-500">Run a scan to measure tracks, clips, mix balance, arrangement energy, and performance load.</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {grouped.map((role) => (
          <section key={role.id} className="bg-panel-850 border border-white/5 rounded-md p-3">
            <div className="mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-200">{role.title}</h4>
              <p className="text-[10px] text-gray-500 mt-0.5">{role.remit}</p>
            </div>
            <div className="space-y-2">
              {role.recs.map((rec) => <RecommendationCard key={rec.id} rec={rec} role={role.title} />)}
              {role.id === "songwriter" && lyricNotes.filter((note) => note.status !== "dismissed").slice(0, 5).map((note) => (
                <TeamNoteCard key={note.id} note={note} />
              ))}
              {report && role.recs.length === 0 && (
                <div className="text-[11px] text-gray-600 bg-panel-950 rounded-md border border-white/5 p-3">
                  {role.id === "songwriter" ? "Run Lyric Coach after writing lines." : "No urgent measured notes for this role."}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
