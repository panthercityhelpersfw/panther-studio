import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { KEY_NAMES, SCALES, type ScaleId } from "../audio/autotune";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (m: number) => `${NOTE_NAMES[((Math.round(m) % 12) + 12) % 12]}${Math.floor(Math.round(m) / 12) - 1}`;

function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{label}</span>
        <span className="font-mono">{fmt ? fmt(value) : value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full" />
    </div>
  );
}

/** Pitch lane: detected note (gold) vs target note (green) over the clip. */
function PitchLane() {
  const lane = useStore((s) => s.pitchLane);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#10131a";
    ctx.fillRect(0, 0, w, h);
    if (!lane || lane.frames.length === 0) {
      ctx.fillStyle = "#5a6577";
      ctx.font = "11px sans-serif";
      ctx.fillText("Analyze a clip to see its pitch over time.", 10, h / 2);
      return;
    }
    const voiced = lane.frames.filter((f) => f.midi != null);
    if (voiced.length === 0) {
      ctx.fillStyle = "#5a6577";
      ctx.font = "11px sans-serif";
      ctx.fillText("No pitch detected (unvoiced or too quiet).", 10, h / 2);
      return;
    }
    let lo = Infinity, hi = -Infinity;
    for (const f of voiced) {
      lo = Math.min(lo, f.midi!, f.targetMidi ?? f.midi!);
      hi = Math.max(hi, f.midi!, f.targetMidi ?? f.midi!);
    }
    lo = Math.floor(lo) - 2; hi = Math.ceil(hi) + 2;
    const span = Math.max(4, hi - lo);
    const yOf = (m: number) => h - ((m - lo) / span) * h;
    // Note rows.
    for (let m = lo; m <= hi; m++) {
      const y = yOf(m);
      ctx.strokeStyle = m % 12 === 0 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)";
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      if (m % 12 === 0) {
        ctx.fillStyle = "#5a6577"; ctx.font = "9px monospace";
        ctx.fillText(noteName(m), 2, y - 2);
      }
    }
    const n = lane.frames.length;
    const xOf = (i: number) => (i / Math.max(1, n - 1)) * w;
    // Target (green).
    ctx.fillStyle = "#3ddc97";
    for (let i = 0; i < n; i++) {
      const f = lane.frames[i];
      if (f.targetMidi == null) continue;
      ctx.fillRect(xOf(i) - 1, yOf(f.targetMidi) - 1, 2, 3);
    }
    // Detected (gold).
    ctx.fillStyle = "#e8b341";
    for (let i = 0; i < n; i++) {
      const f = lane.frames[i];
      if (f.midi == null) continue;
      ctx.fillRect(xOf(i) - 1, yOf(f.midi) - 1, 2, 2);
    }
  }, [lane]);

  return <canvas ref={ref} width={520} height={120} className="w-full rounded border border-white/5" style={{ height: 120 }} />;
}

export function VocalLab() {
  const project = useStore((s) => s.project);
  const selectedClipId = useStore((s) => s.selectedClipId);
  const clip = project.clips.find((c) => c.id === selectedClipId);
  const isAudio = clip?.kind === "audio";

  const tuneKey = useStore((s) => s.tuneKey);
  const tuneScale = useStore((s) => s.tuneScale);
  const tuneStrength = useStore((s) => s.tuneStrength);
  const tuneSpeed = useStore((s) => s.tuneSpeed);
  const tuneHumanize = useStore((s) => s.tuneHumanize);
  const tuneFormant = useStore((s) => s.tuneFormant);
  const setTuneOpt = useStore((s) => s.setTuneOpt);
  const analyzePitch = useStore((s) => s.analyzePitch);
  const applyAutotune = useStore((s) => s.applyAutotune);
  const processing = useStore((s) => s.processing);

  const cleanOpts = useStore((s) => s.cleanOpts);
  const setCleanOpt = useStore((s) => s.setCleanOpt);
  const applyCleanup = useStore((s) => s.applyCleanup);
  const toggleProcessBypass = useStore((s) => s.toggleProcessBypass);

  const needClip = (
    <div className="text-xs text-gray-500 p-4">Select an audio clip in the timeline to tune or clean it.</div>
  );

  return (
    <div className="flex-1 flex min-h-0 overflow-y-auto">
      {!isAudio || !clip ? (
        needClip
      ) : (
        <div className="flex-1 grid grid-cols-2 gap-3 p-3 min-h-0">
          {/* Autotune */}
          <div className="bg-panel-900 rounded p-3 border border-white/5 space-y-2 overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-300">AUTOTUNE</span>
              {clip.processedLabel && <span className="text-[10px] text-panther-green">{clip.processedLabel}</span>}
            </div>
            <div className="flex gap-2">
              <select value={tuneKey} onChange={(e) => setTuneOpt({ key: parseInt(e.target.value) })}
                className="flex-1 bg-panel-800 border border-white/10 rounded px-2 py-1 text-xs">
                {KEY_NAMES.map((k, i) => <option key={k} value={i}>{k}</option>)}
              </select>
              <select value={tuneScale} onChange={(e) => setTuneOpt({ scale: e.target.value as ScaleId })}
                className="flex-[2] bg-panel-800 border border-white/10 rounded px-2 py-1 text-xs">
                {(Object.keys(SCALES) as ScaleId[]).map((id) => <option key={id} value={id}>{SCALES[id].name}</option>)}
              </select>
            </div>
            <Slider label="Strength" value={tuneStrength} min={0} max={1} step={0.01} onChange={(v) => setTuneOpt({ strength: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Retune speed" value={tuneSpeed} min={0} max={1} step={0.01} onChange={(v) => setTuneOpt({ speed: v })} fmt={(v) => v > 0.8 ? "Fast" : v > 0.4 ? "Med" : "Slow"} />
            <Slider label="Humanize" value={tuneHumanize} min={0} max={1} step={0.01} onChange={(v) => setTuneOpt({ humanize: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
            <label className="flex items-center justify-between text-[11px] text-gray-300">
              <span>Formant preserve <span className="text-gray-500">(approx)</span></span>
              <input type="checkbox" checked={tuneFormant} onChange={(e) => setTuneOpt({ formant: e.target.checked })} />
            </label>
            <PitchLane />
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => analyzePitch(clip.id)} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Analyze pitch</button>
              <button onClick={() => void applyAutotune(clip.id)} disabled={processing} className="text-[11px] bg-accent hover:bg-accent-hover text-white rounded px-2 py-1 disabled:opacity-50">
                {processing ? "Working…" : "Apply autotune"}
              </button>
              {clip.dryAssetId && (
                <button onClick={() => toggleProcessBypass(clip.id)} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">A/B before/after</button>
              )}
            </div>
          </div>

          {/* Cleanup */}
          <div className="bg-panel-900 rounded p-3 border border-white/5 space-y-2 overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-300">VOCAL CLEANUP</span>
            </div>
            <button onClick={() => void applyCleanup(clip.id, true)} disabled={processing}
              className="w-full text-xs bg-panther-green text-black font-medium rounded py-1.5 disabled:opacity-50">
              {processing ? "Cleaning…" : "✨ Clean Vocal Take (one-click)"}
            </button>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <Slider label="Noise reduce" value={cleanOpts.noiseReduction} min={0} max={1} step={0.01} onChange={(v) => setCleanOpt({ noiseReduction: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Breath reduce" value={cleanOpts.breath} min={0} max={1} step={0.01} onChange={(v) => setCleanOpt({ breath: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="De-ess" value={cleanOpts.deEss} min={0} max={1} step={0.01} onChange={(v) => setCleanOpt({ deEss: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Harshness" value={cleanOpts.harshness} min={0} max={1} step={0.01} onChange={(v) => setCleanOpt({ harshness: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Mud cut" value={cleanOpts.mud} min={0} max={1} step={0.01} onChange={(v) => setCleanOpt({ mud: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Resonance" value={cleanOpts.resonance} min={0} max={1} step={0.01} onChange={(v) => setCleanOpt({ resonance: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
            </div>
            <div className="flex gap-3 text-[11px] text-gray-300">
              <label className="flex items-center gap-1"><input type="checkbox" checked={cleanOpts.gate} onChange={(e) => setCleanOpt({ gate: e.target.checked })} /> Gate</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={cleanOpts.declick} onChange={(e) => setCleanOpt({ declick: e.target.checked })} /> De-click</label>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => void applyCleanup(clip.id, false)} disabled={processing} className="text-[11px] bg-accent hover:bg-accent-hover text-white rounded px-2 py-1 disabled:opacity-50">Apply custom</button>
              {clip.dryAssetId && (
                <button onClick={() => toggleProcessBypass(clip.id)} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">A/B before/after</button>
              )}
            </div>
            <div className="text-[10px] text-gray-600">Processing renders a new clean asset; your original is kept for A/B and is restored by toggling.</div>
          </div>
        </div>
      )}
    </div>
  );
}
