import { useMemo, useState } from "react";
import { STUDIO_FACTORY_PRESETS } from "../audio/studioIntelligence";
import { useStore } from "../state/store";

function scoreTone(score: number) {
  if (score >= 80) return "text-panther-green";
  if (score >= 62) return "text-panther-gold";
  return "text-red-300";
}

function MiniScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-panel-900 border border-white/5 p-2">
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className={`text-lg font-semibold leading-5 ${scoreTone(value)}`}>{Math.round(value)}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-gray-500 uppercase">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full h-8 rounded bg-panel-900 border border-white/10 px-2 text-xs outline-none focus:border-accent"
      />
    </label>
  );
}

export function FutureStudioPanel() {
  const project = useStore((s) => s.project);
  const report = useStore((s) => s.studioIntelligenceReport ?? s.project.studioIntelligence?.current ?? null);
  const selectedClipId = useStore((s) => s.selectedClipId);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const analyze = useStore((s) => s.analyzeStudioIntelligence);
  const buildSongStructure = useStore((s) => s.buildSongStructure);
  const addHarmonyDraft = useStore((s) => s.addHarmonyDraft);
  const addDoubleTrack = useStore((s) => s.addDoubleTrack);
  const createPunchIn = useStore((s) => s.createPunchIn);
  const makeItHit = useStore((s) => s.makeItHit);
  const makeItEmotional = useStore((s) => s.makeItEmotional);
  const applyPreset = useStore((s) => s.applyFactoryFxPreset);
  const saveIdeaSnapshot = useStore((s) => s.saveIdeaSnapshot);
  const restoreIdeaSnapshot = useStore((s) => s.restoreIdeaSnapshot);
  const updateMoodBoard = useStore((s) => s.updateMoodBoard);
  const setProducerNotes = useStore((s) => s.setProducerNotes);
  const runPerformanceGuardian = useStore((s) => s.runPerformanceGuardian);
  const enableEmergencySafeMode = useStore((s) => s.enableEmergencySafeMode);
  const setStudioMode = useStore((s) => s.setStudioMode);
  const setLiveSessionMode = useStore((s) => s.setLiveSessionMode);
  const setVibeMode = useStore((s) => s.setVibeMode);
  const updateProjectStory = useStore((s) => s.updateProjectStory);
  const captureInspiration = useStore((s) => s.captureInspiration);
  const creativePanic = useStore((s) => s.creativePanic);
  const runMagicMicChain = useStore((s) => s.runMagicMicChain);
  const performanceHealth = useStore((s) => s.performanceHealth ?? s.project.performanceHealth);
  const studioMode = useStore((s) => s.studioMode);
  const liveSessionMode = useStore((s) => s.liveSessionMode);
  const [snapshotName, setSnapshotName] = useState("");
  const [captureText, setCaptureText] = useState("");

  const mood = project.moodBoard ?? {
    mood: "",
    genre: "",
    bpm: "",
    songKey: "",
    targetStyle: "",
    emotionTags: [],
    notes: "",
  };
  const story = project.projectStory ?? { vibe: "", inspiration: "", concept: "", references: [], artworkPrompt: "", worldNotes: "" };
  const memory = project.studioIntelligence?.memory;

  const compass = report?.scores ?? {
    overall: project.clips.length ? 68 : 35,
    hookEnergy: project.markers.some((m) => /hook|chorus/i.test(m.name)) ? 68 : 42,
    vocalPresence: project.clips.some((c) => c.kind === "audio") ? 65 : 35,
    mixClarity: 62,
    arrangementFlow: project.markers.length >= 3 ? 72 : 45,
    exportReadiness: project.exportHistory?.length ? 80 : 48,
  };

  const hook = report?.sections.find((s) => s.inferredRole === "hook");
  const weakSection = report?.sections.reduce<typeof report.sections[number] | null>(
    (lowest, section) => (!lowest || section.energy < lowest.energy ? section : lowest),
    null
  );
  const selectedClip = project.clips.find((c) => c.id === selectedClipId);
  const selectedTrack = project.tracks.find((t) => t.id === selectedTrackId);
  const smartPreset = useMemo(() => {
    if (!selectedTrack) return STUDIO_FACTORY_PRESETS[0];
    const name = selectedTrack.name.toLowerCase();
    if (name.includes("ad") || name.includes("lib")) return STUDIO_FACTORY_PRESETS.find((p) => p.id === "telephone-adlib") ?? STUDIO_FACTORY_PRESETS[0];
    if (hook) return STUDIO_FACTORY_PRESETS.find((p) => p.id === "wide-hook-double") ?? STUDIO_FACTORY_PRESETS[0];
    return STUDIO_FACTORY_PRESETS.find((p) => p.id === "bring-vocal-forward") ?? STUDIO_FACTORY_PRESETS[0];
  }, [hook, selectedTrack]);

  const addTag = (tag: string) => {
    const clean = tag.trim();
    if (!clean) return;
    updateMoodBoard({ emotionTags: Array.from(new Set([...(mood.emotionTags ?? []), clean])).slice(0, 8) });
  };

  return (
    <div className="flex-1 min-w-0 grid grid-cols-[1.15fr_1.15fr_1fr] gap-3 p-3 overflow-hidden">
      <div className="min-w-0 flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-white">Creative Compass</div>
            <div className="text-[10px] text-gray-500">Song direction, hooks, and finish-readiness</div>
          </div>
          <button onClick={() => void analyze()} className="h-7 px-3 rounded bg-accent hover:bg-accent-hover text-white text-[11px]">
            Scan
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MiniScore label="Energy" value={compass.hookEnergy} />
          <MiniScore label="Vocal" value={compass.vocalPresence} />
          <MiniScore label="Clarity" value={compass.mixClarity} />
          <MiniScore label="Flow" value={compass.arrangementFlow} />
          <MiniScore label="Release" value={compass.exportReadiness} />
          <MiniScore label="Overall" value={compass.overall} />
        </div>

        <div className="rounded bg-panel-900 border border-white/5 p-3 space-y-2">
          <div className="grid grid-cols-5 gap-1.5">
            {([
              ["late-night", "Late"],
              ["recording-session", "Record"],
              ["beatmaking", "Beat"],
              ["emotional-writing", "Write"],
              ["performance", "Stage"],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setVibeMode(project.vibeMode === mode ? "off" : mode)}
                className={`h-7 rounded text-[10px] ${project.vibeMode === mode ? "bg-accent text-white" : "bg-panel-700 hover:bg-panel-650 text-gray-300"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-white">Smart arrangement</div>
              <div className="text-[10px] text-gray-500">
                {hook ? `Hook candidate: ${hook.name} (${Math.round(hook.energy)} energy)` : "No hook labeled yet"}
              </div>
            </div>
            <button onClick={buildSongStructure} className="h-7 px-2 rounded bg-panel-700 hover:bg-panel-650 text-[10px] text-gray-200">
              Auto structure
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => void makeItHit()} className="h-8 rounded bg-accent hover:bg-accent-hover text-white text-xs">
              Make It Hit
            </button>
            <button onClick={() => void makeItEmotional()} className="h-8 rounded bg-panel-700 hover:bg-panel-650 text-gray-200 text-xs">
              Make Emotional
            </button>
          </div>
          <div className="text-[10px] text-gray-500">
            {weakSection ? `Energy dip: ${weakSection.name}. Try a transition, ad-lib, or extra layer before it.` : "Run Scan to map energy dips and hook lift."}
          </div>
        </div>

        <div className="rounded bg-panel-900 border border-white/5 p-3">
          <div className="text-xs text-white mb-2">Vocal creator tools</div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => void runMagicMicChain()} className="h-8 rounded bg-accent hover:bg-accent-hover text-white text-[10px]">
              Magic Mic
            </button>
            <button disabled={!selectedClip} onClick={() => selectedClip && addDoubleTrack(selectedClip.id)} className="h-8 rounded bg-panel-700 hover:bg-panel-650 disabled:opacity-40 text-[10px]">
              Stack double
            </button>
            <button disabled={!selectedClip} onClick={() => selectedClip && void addHarmonyDraft(selectedClip.id)} className="h-8 rounded bg-panel-700 hover:bg-panel-650 disabled:opacity-40 text-[10px]">
              Harmony draft
            </button>
            <button disabled={!selectedClip} onClick={() => selectedClip && createPunchIn(selectedClip.id)} className="h-8 rounded bg-panel-700 hover:bg-panel-650 disabled:opacity-40 text-[10px]">
              Punch planner
            </button>
          </div>
        </div>
      </div>

      <div className="min-w-0 flex flex-col gap-2 overflow-hidden">
        <div>
          <div className="text-sm font-semibold text-white">Song Mood Board</div>
          <div className="text-[10px] text-gray-500">Local-only direction notes for smarter decisions</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Mood" value={mood.mood} onChange={(v) => updateMoodBoard({ mood: v })} placeholder="dark, euphoric..." />
          <Field label="Genre" value={mood.genre} onChange={(v) => updateMoodBoard({ genre: v })} placeholder="rap, pop, R&B..." />
          <Field label="BPM" value={mood.bpm} onChange={(v) => updateMoodBoard({ bpm: v })} placeholder={`${project.tempo}`} />
          <Field label="Key" value={mood.songKey} onChange={(v) => updateMoodBoard({ songKey: v })} placeholder={report?.keyEstimate ?? "C minor"} />
        </div>
        <Field label="Target style" value={mood.targetStyle} onChange={(v) => updateMoodBoard({ targetStyle: v })} placeholder="reference vibe, not a clone" />
        <div className="rounded bg-panel-900 border border-white/5 p-3 space-y-2">
          <div className="text-xs text-white">Project Story</div>
          <input value={story.vibe} onChange={(e) => updateProjectStory({ vibe: e.target.value })} placeholder="World vibe" className="w-full h-7 rounded bg-panel-850 border border-white/10 px-2 text-[11px] outline-none" />
          <input value={story.concept} onChange={(e) => updateProjectStory({ concept: e.target.value })} placeholder="Song concept" className="w-full h-7 rounded bg-panel-850 border border-white/10 px-2 text-[11px] outline-none" />
          <textarea value={story.worldNotes} onChange={(e) => updateProjectStory({ worldNotes: e.target.value })} placeholder="References, artwork, emotional world..." className="w-full h-14 rounded bg-panel-850 border border-white/10 px-2 py-1.5 text-[11px] outline-none resize-none" />
        </div>
        <div className="rounded bg-panel-900 border border-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs text-white">Inspiration Capture</div>
              <div className="text-[10px] text-gray-500">No setup. Capture first, organize later.</div>
            </div>
            <button onClick={() => { void captureInspiration("lyric", captureText); setCaptureText(""); }} className="h-7 px-2 rounded bg-accent hover:bg-accent-hover text-white text-[10px]">Save</button>
          </div>
          <input value={captureText} onChange={(e) => setCaptureText(e.target.value)} placeholder="Lyric, melody note, beat idea..." className="mt-2 w-full h-8 rounded bg-panel-850 border border-white/10 px-2 text-xs outline-none" />
          <div className="mt-2 grid grid-cols-5 gap-1">
            {(["voice", "melody", "lyric", "beat", "rhythm"] as const).map((kind) => (
              <button key={kind} onClick={() => { void captureInspiration(kind, captureText); setCaptureText(""); }} className="h-6 rounded bg-panel-700 hover:bg-panel-650 text-[9px] text-gray-300 capitalize">{kind}</button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-[10px] text-gray-500 uppercase">Producer notes</span>
          <textarea
            value={project.producerNotes ?? ""}
            onChange={(e) => setProducerNotes(e.target.value)}
            className="mt-1 w-full h-16 rounded bg-panel-900 border border-white/10 px-2 py-2 text-xs outline-none focus:border-accent resize-none"
            placeholder="What should this song make the listener feel?"
          />
        </label>
        <div className="flex gap-1 flex-wrap">
          {(mood.emotionTags ?? []).map((tag) => (
            <button
              key={tag}
              onClick={() => updateMoodBoard({ emotionTags: mood.emotionTags.filter((x) => x !== tag) })}
              className="h-6 px-2 rounded bg-accent/20 text-accent text-[10px]"
              title="Remove tag"
            >
              {tag}
            </button>
          ))}
          {["confident", "sad", "late-night", "aggressive", "romantic"].map((tag) => (
            <button key={tag} onClick={() => addTag(tag)} className="h-6 px-2 rounded bg-panel-700 hover:bg-panel-650 text-gray-300 text-[10px]">
              + {tag}
            </button>
          ))}
        </div>

        <div className="rounded bg-panel-900 border border-white/5 p-3 min-h-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs text-white">Time Machine</div>
              <div className="text-[10px] text-gray-500">Save and restore creative branches</div>
            </div>
            <button onClick={() => { void saveIdeaSnapshot(snapshotName); setSnapshotName(""); }} className="h-7 px-2 rounded bg-panel-700 hover:bg-panel-650 text-[10px]">
              Save
            </button>
          </div>
          <input
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            placeholder="Snapshot name"
            className="w-full h-7 rounded bg-panel-850 border border-white/10 px-2 text-[11px] outline-none mb-2"
          />
          <div className="max-h-20 overflow-auto space-y-1">
            {(project.ideaSnapshots ?? []).length === 0 ? (
              <div className="text-[10px] text-gray-600">No snapshots yet.</div>
            ) : (
              (project.ideaSnapshots ?? []).map((snap) => (
                <button
                  key={snap.id}
                  onClick={() => void restoreIdeaSnapshot(snap.id)}
                  className="w-full text-left rounded bg-panel-850 hover:bg-panel-750 px-2 py-1"
                >
                  <div className="text-[11px] text-white truncate">{snap.name}</div>
                  <div className="text-[9px] text-gray-500">{snap.summary}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 flex flex-col gap-2 overflow-hidden">
        <div className="rounded bg-panel-900 border border-white/5 p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-sm font-semibold text-white">Performance Guardian</div>
              <div className="text-[10px] text-gray-500">Playback stability over visuals</div>
            </div>
            <button onClick={() => runPerformanceGuardian("manual")} className="h-7 px-2 rounded bg-panel-700 hover:bg-panel-650 text-[10px]">
              Check
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className={`text-3xl font-semibold ${scoreTone(performanceHealth?.score ?? 82)}`}>
              {performanceHealth?.score ?? 82}
            </div>
            <div className="text-[10px] text-gray-500">
              <div className="capitalize">Risk: {performanceHealth?.risk ?? "low"}</div>
              <div>FX slots: {performanceHealth?.liveEffectSlots ?? 0}</div>
              <div>Voices: {performanceHealth?.activeVoices ?? 0}</div>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            {(performanceHealth?.suggestions ?? ["Run Check after importing or recording."]).slice(0, 3).map((tip) => (
              <div key={tip} className="text-[10px] text-gray-400">{tip}</div>
            ))}
          </div>
          <button onClick={enableEmergencySafeMode} className="mt-3 h-8 w-full rounded bg-panther-red/20 hover:bg-panther-red/30 text-panther-red text-xs">
            Emergency Safe Mode
          </button>
        </div>

        <div className="rounded bg-panel-900 border border-white/5 p-3">
          <div className="text-xs text-white mb-2">Modes</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setStudioMode(!studioMode)} className={`h-8 rounded text-xs ${studioMode ? "bg-accent text-white" : "bg-panel-700 hover:bg-panel-650"}`}>
              Studio Mode
            </button>
            <button onClick={() => setLiveSessionMode(!liveSessionMode)} className={`h-8 rounded text-xs ${liveSessionMode ? "bg-panther-green text-black" : "bg-panel-700 hover:bg-panel-650"}`}>
              Live Session
            </button>
          </div>
        </div>

        <div className="rounded bg-panel-900 border border-white/5 p-3">
          <div className="text-xs text-white mb-2">Creative Panic Buttons</div>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ["harder", "Hit Harder"],
              ["hook", "Bigger Hook"],
              ["emotional", "Emotional"],
              ["space", "More Space"],
              ["clean", "Clean Vocals"],
              ["aggressive", "Aggressive"],
              ["intimate", "Intimate"],
              ["cinematic", "Cinematic"],
            ] as const).map(([kind, label]) => (
              <button key={kind} onClick={() => void creativePanic(kind)} className="h-7 rounded bg-panel-700 hover:bg-panel-650 text-[10px] text-gray-200">{label}</button>
            ))}
          </div>
        </div>

        <div className="rounded bg-panel-900 border border-white/5 p-3 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs text-white">Preset Matchmaker</div>
              <div className="text-[10px] text-gray-500">{selectedTrack ? selectedTrack.name : "Select a track"}</div>
            </div>
            <button disabled={!selectedTrack} onClick={() => applyPreset(smartPreset.id)} className="h-7 px-2 rounded bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-[10px]">
              Apply
            </button>
          </div>
          <div className="text-[11px] text-gray-300">{smartPreset.name}</div>
          <div className="text-[10px] text-gray-500 mt-1">{smartPreset.intendedUse}</div>
        </div>

        <div className="rounded bg-panel-900 border border-white/5 p-3 min-h-0 overflow-auto">
          <div className="text-xs text-white mb-2">Why This Works</div>
          {memory && (
            <div className="mb-2 rounded bg-black/20 p-2 text-[10px] text-gray-500">
              Knows you: BPM {Object.keys(memory.favoriteBpmRanges).slice(0, 2).join(", ") || "learning"} / FX {Object.keys(memory.favoriteFxUsage).slice(0, 2).join(", ") || "learning"} / workflow {memory.lastWorkflowIntent ?? "learning"}
            </div>
          )}
          {(project.smartHistory ?? []).slice(0, 5).map((event) => (
            <div key={event.id} className="border-t border-white/5 py-1.5 first:border-t-0">
              <div className="text-[11px] text-gray-200">{event.title}</div>
              <div className="text-[10px] text-gray-500">{event.detail}</div>
            </div>
          ))}
          {(project.smartHistory ?? []).length === 0 && (
            <div className="text-[10px] text-gray-600">Creative actions will explain themselves here.</div>
          )}
        </div>
      </div>
    </div>
  );
}
