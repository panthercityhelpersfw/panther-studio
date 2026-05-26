import { useState } from "react";
import { EFFECT_LABELS, EFFECT_ORDER } from "../audio/effects/types";
import { PRESETS } from "../audio/presets";
import { useStore } from "../state/store";
import { gainToDb, panLabel } from "../utils/format";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-gray-300">{value}</span>
    </div>
  );
}

export function Inspector({ onCollapse }: { onCollapse?: () => void }) {
  const project = useStore((s) => s.project);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const selectedClipId = useStore((s) => s.selectedClipId);
  const setTrackGain = useStore((s) => s.setTrackGain);
  const setTrackPan = useStore((s) => s.setTrackPan);
  const setStatus = useStore((s) => s.setStatus);
  const applyPreset = useStore((s) => s.applyPreset);
  const autoEnhance = useStore((s) => s.autoEnhance);
  const setClipGain = useStore((s) => s.setClipGain);
  const setClipFade = useStore((s) => s.setClipFade);
  const detectClipTempo = useStore((s) => s.detectClipTempo);
  const setClipSourceBpm = useStore((s) => s.setClipSourceBpm);
  const timeStretchClip = useStore((s) => s.timeStretchClip);
  const matchClipToProjectTempo = useStore((s) => s.matchClipToProjectTempo);
  const pitchShiftClip = useStore((s) => s.pitchShiftClip);
  const setClipTakeLane = useStore((s) => s.setClipTakeLane);
  const setClipCompRole = useStore((s) => s.setClipCompRole);
  const toggleClipMute = useStore((s) => s.toggleClipMute);
  const duplicateClip = useStore((s) => s.duplicateClip);
  const deleteClip = useStore((s) => s.deleteClip);
  const openPianoRoll = useStore((s) => s.openPianoRoll);
  const setLyrics = useStore((s) => s.setLyrics);
  const exportFullSong = useStore((s) => s.exportFullSong);
  const exportFormat = useStore((s) => (s.project.exportSettings ?? s.exportSettings).format);
  const [exporting, setExporting] = useState(false);
  const [stretchRatio, setStretchRatio] = useState(1);
  const [pitchShift, setPitchShift] = useState(0);

  const track = project.tracks.find((t) => t.id === selectedTrackId);
  const clip = project.clips.find((c) => c.id === selectedClipId);
  const asset = clip && project.assets.find((a) => a.id === clip.assetId);

  const exportMixdown = async () => {
    if (project.clips.length === 0) {
      setStatus("Nothing to export yet — record a take first.");
      return;
    }
    setExporting(true);
    setStatus("Rendering mixdown…");
    try {
      await exportFullSong();
    } catch (e) {
      setStatus("Export failed: " + String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="h-full studio-inspector flex flex-col overflow-y-auto">
      <div className="studio-inspector__head">
        <span>INSPECTOR</span>
        {onCollapse && (
          <button onClick={onCollapse} className="studio-icon-btn" title="Collapse inspector">
            &gt;
          </button>
        )}
      </div>

      <div className="p-3 space-y-4">
        {/* Track section */}
        <details open className="studio-section">
          <summary>Track</summary>
          {track ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: track.color }}
                />
                <span className="text-sm">{track.name}</span>
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>Volume</span>
                  <span className="font-mono">{gainToDb(track.gain)} dB</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.01}
                  value={track.gain}
                  onChange={(e) => setTrackGain(track.id, parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>Pan</span>
                  <span className="font-mono">{panLabel(track.pan)}</span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={track.pan}
                  onChange={(e) => setTrackPan(track.id, parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Select a track.</p>
          )}
        </details>

        {/* Effects — quick access; full controls live in the FX RACK dock */}
        <details open className="studio-section">
          <summary>Vocal Chain</summary>
          {track ? (
            <div className="space-y-2">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) applyPreset(track.id, e.target.value);
                }}
                className="w-full bg-panel-900 border border-white/10 rounded px-2 py-1.5 text-xs outline-none"
              >
                <option value="">
                  Preset…{track.presetName ? ` (${track.presetName})` : ""}
                </option>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id} title={p.description}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => autoEnhance(track.id)}
                className="w-full text-xs bg-accent hover:bg-accent-hover text-white rounded py-1.5 font-medium"
              >
                ✨ Auto Make Vocals Sound Good
              </button>
              <div className="text-[11px] text-gray-500">
                Active:{" "}
                {EFFECT_ORDER.filter((k) => track.effects[k].enabled)
                  .map((k) => EFFECT_LABELS[k])
                  .join(", ") || "none"}
              </div>
              <div className="text-[10px] text-gray-600">
                Open the <span className="text-gray-400">FX RACK</span> tab below
                for full knob control.
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Select a track.</p>
          )}
        </details>

        {/* Clip section */}
        <details open className="studio-section">
          <summary>Clip</summary>
          {clip ? (
            <div className="bg-panel-900 rounded p-2 border border-white/5 space-y-2">
              <div className="text-sm truncate">
                {clip.kind === "midi" ? "♪ " : ""}
                {clip.name}
              </div>
              <Row label="Type" value={clip.kind === "midi" ? "MIDI" : "Audio"} />
              <Row label="Start" value={`${clip.startSec.toFixed(2)}s`} />
              <Row label="Length" value={`${clip.durationSec.toFixed(2)}s`} />
              {asset && <Row label="Sample rate" value={`${asset.sampleRate} Hz`} />}
              {clip.kind === "midi" && (
                <Row label="Notes" value={`${clip.notes?.length ?? 0}`} />
              )}

              {clip.kind === "audio" && (
                <>
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>Clip gain</span>
                      <span className="font-mono">{gainToDb(clip.gain)} dB</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.01}
                      value={clip.gain}
                      onChange={(e) => setClipGain(clip.id, parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <div className="text-[10px] text-gray-500">Fade in {clip.fadeInSec.toFixed(2)}s</div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0.01, clip.durationSec)}
                        step={0.01}
                        value={clip.fadeInSec}
                        onChange={(e) => setClipFade(clip.id, parseFloat(e.target.value), clip.fadeOutSec)}
                        className="w-full"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] text-gray-500">Fade out {clip.fadeOutSec.toFixed(2)}s</div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0.01, clip.durationSec)}
                        step={0.01}
                        value={clip.fadeOutSec}
                        onChange={(e) => setClipFade(clip.id, clip.fadeInSec, parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="border-t border-white/10 pt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500">Source BPM</span>
                      <input
                        type="number"
                        min={40}
                        max={240}
                        value={clip.sourceBpm ?? ""}
                        onChange={(e) => setClipSourceBpm(clip.id, e.target.value ? Number(e.target.value) : null)}
                        className="w-20 bg-panel-950 border border-white/10 rounded px-1.5 py-1 text-[10px] outline-none"
                        placeholder="detect"
                      />
                      <button onClick={() => void detectClipTempo(clip.id)} className="text-[10px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Detect</button>
                      <button onClick={() => void matchClipToProjectTempo(clip.id)} className="text-[10px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Match</button>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-500">
                        <span>Time stretch</span>
                        <span className="font-mono">{Math.round(stretchRatio * 100)}%</span>
                      </div>
                      <input type="range" min={0.5} max={2} step={0.01} value={stretchRatio} onChange={(e) => setStretchRatio(Number(e.target.value))} className="w-full" />
                      <button onClick={() => void timeStretchClip(clip.id, stretchRatio)} className="mt-1 text-[10px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Apply stretch</button>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-500">
                        <span>Pitch shift</span>
                        <span className="font-mono">{pitchShift > 0 ? "+" : ""}{pitchShift} st</span>
                      </div>
                      <input type="range" min={-12} max={12} step={1} value={pitchShift} onChange={(e) => setPitchShift(Number(e.target.value))} className="w-full" />
                      <button onClick={() => void pitchShiftClip(clip.id, pitchShift)} disabled={pitchShift === 0} className="mt-1 text-[10px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1 disabled:opacity-40">Apply pitch</button>
                    </div>
                  </div>
                </>
              )}

              <div className="border-t border-white/10 pt-2 grid grid-cols-3 gap-1">
                <label className="text-[10px] text-gray-500 col-span-1">
                  Take lane
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={clip.takeLane ?? clip.take}
                    onChange={(e) => setClipTakeLane(clip.id, Number(e.target.value))}
                    className="mt-1 w-full bg-panel-950 border border-white/10 rounded px-1.5 py-1 text-[10px] outline-none"
                  />
                </label>
                <label className="text-[10px] text-gray-500 col-span-2">
                  Comp role
                  <select
                    value={clip.compRole ?? "candidate"}
                    onChange={(e) => setClipCompRole(clip.id, e.target.value as typeof clip.compRole)}
                    className="mt-1 w-full bg-panel-950 border border-white/10 rounded px-1.5 py-1 text-[10px] outline-none"
                  >
                    <option value="candidate">Candidate</option>
                    <option value="chosen">Chosen</option>
                    <option value="muted">Muted</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-1 pt-1">
                {clip.kind === "midi" && (
                  <button
                    onClick={() => openPianoRoll(clip.id)}
                    className="text-[11px] bg-accent hover:bg-accent-hover text-white rounded px-2 py-1"
                  >
                    Edit notes
                  </button>
                )}
                <button
                  onClick={() => toggleClipMute(clip.id)}
                  className={`text-[11px] rounded px-2 py-1 ${
                    clip.muted ? "bg-panther-gold text-black" : "bg-panel-700 text-gray-200"
                  }`}
                >
                  {clip.muted ? "Unmute" : "Mute"}
                </button>
                <button
                  onClick={() => duplicateClip(clip.id)}
                  className="text-[11px] bg-panel-700 hover:bg-panel-650 text-gray-200 rounded px-2 py-1"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => deleteClip(clip.id)}
                  className="text-[11px] bg-panel-700 hover:bg-panel-650 text-panther-red rounded px-2 py-1"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Select a clip.</p>
          )}
        </details>

        {/* Project stats + export */}
        <details open className="studio-section">
          <summary>Project</summary>
          <div className="bg-panel-900 rounded p-2 border border-white/5">
            <Row label="Tracks" value={`${project.tracks.length}`} />
            <Row label="Clips" value={`${project.clips.length}`} />
            <Row label="Tempo" value={`${project.tempo} BPM`} />
          </div>
          <div className="mt-2">
            <div className="text-[10px] text-gray-500 mb-1">Lyrics / notes</div>
            <textarea
              value={project.lyrics ?? ""}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Write lyrics, ideas, or session notes here. Coach ideas get appended too."
              rows={5}
              className="w-full bg-panel-900 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-accent resize-y"
            />
          </div>
          <button
            onClick={exportMixdown}
            disabled={exporting}
            className="w-full mt-2 text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded py-1.5"
          >
            {exporting ? "Exporting..." : `Export mixdown (${exportFormat.toUpperCase()})`}
          </button>
        </details>
      </div>
    </div>
  );
}
