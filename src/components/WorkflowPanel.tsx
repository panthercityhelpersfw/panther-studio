import { useState } from "react";
import { DRUM_LANES } from "../audio/instruments";
import { useStore } from "../state/store";

const TEMPLATES = [
  ["rap-recording", "Rap"],
  ["pop-vocal", "Pop Vocal"],
  ["podcast", "Podcast"],
  ["beatmaking", "Beatmaking"],
  ["mixing", "Mixing"],
  ["mastering", "Mastering"],
  ["blank-advanced", "Blank"],
] as const;

export function WorkflowPanel() {
  const selectedClipId = useStore((s) => s.selectedClipId);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const project = useStore((s) => s.project);
  const selectedClip = useStore((s) => s.project.clips.find((c) => c.id === s.selectedClipId));
  const patterns = useStore((s) => s.project.patterns ?? []);
  const applyTemplate = useStore((s) => s.applySessionTemplate);
  const groupSelectedClips = useStore((s) => s.groupSelectedClips);
  const toggleClipLock = useStore((s) => s.toggleClipLock);
  const setClipColorLabel = useStore((s) => s.setClipColorLabel);
  const reverseClip = useStore((s) => s.reverseClip);
  const normalizeClipAudio = useStore((s) => s.normalizeClipAudio);
  const bounceClip = useStore((s) => s.bounceClip);
  const consolidateSelection = useStore((s) => s.consolidateSelection);
  const promoteTake = useStore((s) => s.promoteTake);
  const setClipCompRole = useStore((s) => s.setClipCompRole);
  const setClipTakeLane = useStore((s) => s.setClipTakeLane);
  const runWizard = useStore((s) => s.runVocalRecordingWizard);
  const createStack = useStore((s) => s.createVocalStack);
  const createPattern = useStore((s) => s.createPatternFromGrid);
  const placePattern = useStore((s) => s.placePattern);
  const duplicatePattern = useStore((s) => s.duplicatePattern);
  const convertMidiToAudio = useStore((s) => s.convertMidiToAudio);
  const [grid, setGrid] = useState<Record<string, boolean[]>>(() =>
    Object.fromEntries(DRUM_LANES.map((l) => [l.id, new Array(16).fill(false)]))
  );
  const [swing, setSwing] = useState(0.12);
  const takeTrackId = selectedClip?.trackId ?? selectedTrackId ?? project.tracks[0]?.id ?? null;
  const takeClips = takeTrackId
    ? project.clips
        .filter((clip) => clip.trackId === takeTrackId)
        .sort((a, b) => (a.takeLane ?? a.take) - (b.takeLane ?? b.take) || a.startSec - b.startSec)
    : [];
  const takeLanes = Array.from(new Set(takeClips.map((clip) => clip.takeLane ?? clip.take))).sort((a, b) => a - b);

  const toggleStep = (laneId: string, step: number) => {
    setGrid((g) => {
      const lane = [...(g[laneId] ?? new Array(16).fill(false))];
      lane[step] = !lane[step];
      return { ...g, [laneId]: lane };
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 xl:grid-cols-2 gap-3 bg-panel-900/35">
      <section className="bg-panel-850 border border-white/5 rounded-md p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide">Session Templates</h3>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {TEMPLATES.map(([id, label]) => (
            <button key={id} onClick={() => void applyTemplate(id)} className="text-[11px] bg-panel-800 hover:bg-panel-750 border border-white/5 rounded px-2 py-1.5 text-left">
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-panel-850 border border-white/5 rounded-md p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide">Vocal Session</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => void runWizard()} className="text-[11px] bg-accent hover:bg-accent-hover text-white rounded px-3 py-1.5">Recording wizard</button>
          <button onClick={() => createStack(selectedClipId ?? undefined)} className="text-[11px] bg-panel-800 hover:bg-panel-750 rounded px-3 py-1.5">One-click stack</button>
          {selectedClip && <button onClick={() => promoteTake(selectedClip.id)} className="text-[11px] bg-panel-800 hover:bg-panel-750 rounded px-3 py-1.5">Promote take</button>}
        </div>
      </section>

      <section className="bg-panel-850 border border-white/5 rounded-md p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide">Take Lanes / Comp</h3>
          {selectedClip && (
            <button onClick={() => setClipTakeLane(selectedClip.id, (takeLanes[takeLanes.length - 1] ?? 0) + 1)} className="text-[10px] bg-panel-800 hover:bg-panel-750 rounded px-2 py-1">Move to new lane</button>
          )}
        </div>
        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
          {takeLanes.map((lane) => (
            <div key={lane} className="rounded bg-panel-950 border border-white/5 p-1.5">
              <div className="text-[10px] text-gray-500 mb-1">Lane {lane}</div>
              <div className="space-y-1">
                {takeClips.filter((clip) => (clip.takeLane ?? clip.take) === lane).map((clip) => (
                  <div key={clip.id} className={`flex items-center gap-1 rounded px-1.5 py-1 text-[10px] ${clip.id === selectedClipId ? "bg-accent/20" : "bg-panel-900"}`}>
                    <span className="flex-1 truncate">{clip.name}</span>
                    <button onClick={() => promoteTake(clip.id)} className="text-panther-green hover:text-white">Promote</button>
                    <button onClick={() => setClipCompRole(clip.id, clip.compRole === "muted" ? "candidate" : "muted")} className={clip.compRole === "muted" || clip.muted ? "text-panther-gold" : "text-gray-400 hover:text-white"}>
                      {clip.compRole === "muted" || clip.muted ? "Muted" : "Mute"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {takeClips.length === 0 && <div className="text-[10px] text-gray-600">Record or import takes on a vocal track to build a comp.</div>}
        </div>
      </section>

      <section className="bg-panel-850 border border-white/5 rounded-md p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide">Clip Workflow</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <button disabled={!selectedClip} onClick={groupSelectedClips} className="studio-mini-command disabled:opacity-40">Group</button>
          <button disabled={!selectedClip} onClick={() => selectedClip && toggleClipLock(selectedClip.id)} className="studio-mini-command disabled:opacity-40">{selectedClip?.locked ? "Unlock" : "Lock"}</button>
          <button disabled={!selectedClip} onClick={() => selectedClip && setClipColorLabel(selectedClip.id, "#ff7ad9")} className="studio-mini-command disabled:opacity-40">Pink label</button>
          <button disabled={!selectedClip || selectedClip.kind !== "audio"} onClick={() => selectedClip && void reverseClip(selectedClip.id)} className="studio-mini-command disabled:opacity-40">Reverse</button>
          <button disabled={!selectedClip || selectedClip.kind !== "audio"} onClick={() => selectedClip && void normalizeClipAudio(selectedClip.id)} className="studio-mini-command disabled:opacity-40">Normalize</button>
          <button disabled={!selectedClip} onClick={() => selectedClip && void bounceClip(selectedClip.id)} className="studio-mini-command disabled:opacity-40">Bounce</button>
          <button disabled={!selectedClip} onClick={() => void consolidateSelection()} className="studio-mini-command disabled:opacity-40">Consolidate</button>
          <button disabled={!selectedClip || selectedClip.kind !== "midi"} onClick={() => selectedClip && void convertMidiToAudio(selectedClip.id)} className="studio-mini-command disabled:opacity-40">MIDI to audio</button>
        </div>
        <div className="mt-2 text-[10px] text-gray-600">{selectedClip ? `${selectedClip.name} / take ${selectedClip.takeLane ?? selectedClip.take}` : "Select a clip to edit."}</div>
      </section>

      <section className="bg-panel-850 border border-white/5 rounded-md p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide">Pattern Playlist</h3>
          <button onClick={() => createPattern("Drum Pattern", grid, swing)} className="text-[10px] bg-accent hover:bg-accent-hover text-white rounded px-2 py-1">Save pattern</button>
        </div>
        <div className="mt-2 space-y-1">
          {DRUM_LANES.slice(0, 6).map((lane) => (
            <div key={lane.id} className="flex items-center gap-1">
              <span className="w-12 text-[10px] text-gray-400">{lane.label}</span>
              <div className="flex gap-0.5 flex-1">
                {(grid[lane.id] ?? []).map((on, i) => (
                  <button key={i} onClick={() => toggleStep(lane.id, i)} className={`h-5 flex-1 rounded-sm ${on ? "bg-accent" : i % 4 === 0 ? "bg-panel-700" : "bg-panel-900"}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-[10px] text-gray-500">
          Swing
          <input type="range" min={0} max={0.45} step={0.01} value={swing} onChange={(e) => setSwing(parseFloat(e.target.value))} className="flex-1" />
          {Math.round(swing * 100)}%
        </label>
        <div className="mt-2 space-y-1">
          {patterns.slice(0, 6).map((p) => (
            <div key={p.id} className="flex items-center gap-2 bg-panel-950 rounded px-2 py-1 text-[10px]">
              <span className="flex-1 truncate">{p.name}</span>
              <button onClick={() => placePattern(p.id)} className="hover:text-white text-gray-400">Place</button>
              <button onClick={() => duplicatePattern(p.id, true)} className="hover:text-white text-gray-400">Mutate</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
