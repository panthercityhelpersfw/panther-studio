import { useRef, useState } from "react";
import { EFFECT_LABELS, type EffectKey, type EffectsState } from "../audio/effects/types";
import { MASTER_PRESETS } from "../audio/masterPresets";
import { TARGET_LABELS, type LoudnessTarget } from "../audio/autoMaster";
import { useStore } from "../state/store";
import { gainToDb } from "../utils/format";
import { PARAMS } from "./effectParams";
import { GainReductionMeter } from "./GainReductionMeter";
import { Knob } from "./Knob";

const MASTER_EFFECTS: EffectKey[] = ["eq", "compressor", "saturation", "limiter"];

function MasterCard({ effectKey, effects }: { effectKey: EffectKey; effects: EffectsState }) {
  const setEnabled = useStore((s) => s.setMasterEffectEnabled);
  const setParam = useStore((s) => s.setMasterEffectParam);
  const red = useStore((s) => s.meters.masterReduction);
  const state = effects[effectKey] as unknown as Record<string, number | boolean>;
  const enabled = state.enabled as boolean;
  const showGR = effectKey === "compressor" || effectKey === "limiter";
  const grDb = effectKey === "compressor" ? red.comp : effectKey === "limiter" ? red.limiter : 0;

  return (
    <div className={`shrink-0 w-[176px] rounded-lg border p-2 ${enabled ? "border-accent/40 bg-panel-800" : "border-white/5 bg-panel-850"}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold">{EFFECT_LABELS[effectKey]}</span>
        <button
          onClick={() => setEnabled(effectKey, !enabled)}
          className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${enabled ? "bg-panther-green text-black" : "bg-panel-700 text-gray-400"}`}
        >
          {enabled ? "ON" : "BYP"}
        </button>
      </div>
      {showGR && <div className="mb-1.5"><GainReductionMeter db={grDb} /></div>}
      <div className="grid grid-cols-3 gap-x-1 gap-y-2">
        {PARAMS[effectKey].map((p) => (
          <Knob
            key={p.key}
            label={p.label}
            value={state[p.key] as number}
            min={p.min}
            max={p.max}
            step={p.step}
            format={p.format}
            disabled={!enabled}
            onChange={(v) => setParam(effectKey, p.key, v)}
          />
        ))}
      </div>
    </div>
  );
}

export function MasterPanel() {
  const master = useStore((s) => s.project.master);
  const masterGain = useStore((s) => s.project.masterGain);
  const setMasterGain = useStore((s) => s.setMasterGain);
  const setMasterBypass = useStore((s) => s.setMasterBypass);
  const applyMasterPreset = useStore((s) => s.applyMasterPreset);
  const clearMaster = useStore((s) => s.clearMaster);
  const autoMaster = useStore((s) => s.autoMaster);
  const analyzeLoudnessNow = useStore((s) => s.analyzeLoudnessNow);
  const analyzing = useStore((s) => s.analyzing);
  const exporting = useStore((s) => s.exporting);
  const exportProgress = useStore((s) => s.exportProgress);
  const exportSettings = useStore((s) => s.project.exportSettings ?? s.exportSettings);
  const updateExportSettings = useStore((s) => s.updateExportSettings);
  const exportFullSong = useStore((s) => s.exportFullSong);
  const exportLoopRegion = useStore((s) => s.exportLoopRegion);
  const exportStems = useStore((s) => s.exportStems);
  const loopEnabled = useStore((s) => s.project.loop.enabled);
  const reference = useStore((s) => s.project.reference);
  const referenceMode = useStore((s) => s.referenceMode);
  const setReferenceMode = useStore((s) => s.setReferenceMode);
  const setReferenceGain = useStore((s) => s.setReferenceGain);
  const importReference = useStore((s) => s.importReference);
  const removeReference = useStore((s) => s.removeReference);
  const stereoWidth = useStore((s) => s.project.stereoWidth ?? 1);
  const monoBelow = useStore((s) => s.project.monoBelowHz ?? 0);
  const setStereoWidth = useStore((s) => s.setStereoWidth);
  const setMonoBelow = useStore((s) => s.setMonoBelow);
  const refInput = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<LoudnessTarget>("streaming");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* control bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-black/40 flex-wrap">
        <span className="text-xs text-gray-400">Master</span>
        <button
          onClick={() => setMasterBypass(!master.bypass)}
          className={`text-[11px] rounded px-2 py-1 font-medium ${master.bypass ? "bg-panther-gold text-black" : "bg-panel-700 text-gray-200"}`}
          title="Bypass the entire master chain"
        >
          {master.bypass ? "BYPASSED" : "Active"}
        </button>
        <select
          value=""
          onChange={(e) => e.target.value && applyMasterPreset(e.target.value)}
          className="bg-panel-900 border border-white/10 rounded px-2 py-1 text-xs outline-none"
        >
          <option value="">Master preset…{master.presetName ? ` (${master.presetName})` : ""}</option>
          {MASTER_PRESETS.map((p) => (
            <option key={p.id} value={p.id} title={p.description}>{p.name}</option>
          ))}
        </select>
        <button onClick={clearMaster} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1">Reset</button>

        <div className="w-px h-5 bg-white/10" />

        <span className="text-[10px] text-gray-500">Auto Master:</span>
        <select value={target} onChange={(e) => setTarget(e.target.value as LoudnessTarget)}
          className="bg-panel-900 border border-white/10 rounded px-2 py-1 text-xs outline-none">
          {(Object.keys(TARGET_LABELS) as LoudnessTarget[]).map((t) => (
            <option key={t} value={t}>{TARGET_LABELS[t]}</option>
          ))}
        </select>
        <button onClick={() => void autoMaster(target)} disabled={analyzing} className="text-[11px] bg-accent hover:bg-accent-hover text-white rounded px-2 py-1 disabled:opacity-50">Master for target</button>
        <button onClick={() => void analyzeLoudnessNow()} disabled={analyzing} className="text-[11px] bg-panel-700 hover:bg-panel-650 rounded px-2 py-1 disabled:opacity-50">
          {analyzing ? "Analyzing…" : "Export-safe preview"}
        </button>

        <div className="flex-1" />

        {/* output gain */}
        <div className="flex items-center gap-1 w-40">
          <span className="text-[10px] text-gray-500">Out</span>
          <input type="range" min={0} max={1.5} step={0.01} value={masterGain} onChange={(e) => setMasterGain(parseFloat(e.target.value))} className="flex-1" />
          <span className="text-[10px] font-mono text-gray-400 w-10 text-right">{gainToDb(masterGain)}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* master chain cards */}
        <div className="flex gap-2 p-3 items-stretch">
          {MASTER_EFFECTS.map((k) => (
            <MasterCard key={k} effectKey={k} effects={master.effects} />
          ))}

          {/* Stereo imaging */}
          <div className="shrink-0 w-[176px] rounded-lg border border-white/5 bg-panel-850 p-2 space-y-3">
            <span className="text-xs font-semibold">Stereo Image</span>
            <div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Width</span>
                <span className="font-mono">{stereoWidth === 1 ? "Normal" : `${Math.round(stereoWidth * 100)}%`}</span>
              </div>
              <input type="range" min={0} max={2} step={0.01} value={stereoWidth} onChange={(e) => setStereoWidth(parseFloat(e.target.value))} className="w-full" />
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Low-end mono</span>
                <span className="font-mono">{monoBelow > 20 ? `${Math.round(monoBelow)} Hz` : "Off"}</span>
              </div>
              <input type="range" min={0} max={300} step={5} value={monoBelow} onChange={(e) => setMonoBelow(parseFloat(e.target.value))} className="w-full" />
            </div>
            <div className="text-[9px] text-gray-600">Applied at render/export &amp; the export-safe preview.</div>
          </div>

          {/* Export + reference column */}
          <div className="shrink-0 w-56 rounded-lg border border-white/10 bg-panel-800 p-2 space-y-2">
            <div className="text-xs font-semibold">Export</div>
            <div className="grid grid-cols-2 gap-1">
              <select value={exportSettings.format} onChange={(e) => updateExportSettings({ format: e.target.value as typeof exportSettings.format })} className="bg-panel-900 border border-white/10 rounded px-1.5 py-1 text-[10px] outline-none">
                <option value="wav">WAV</option>
                <option value="mp3">MP3</option>
              </select>
              <select value={exportSettings.sampleRate} onChange={(e) => updateExportSettings({ sampleRate: Number(e.target.value) as typeof exportSettings.sampleRate })} className="bg-panel-900 border border-white/10 rounded px-1.5 py-1 text-[10px] outline-none">
                <option value={48000}>48 kHz</option>
                <option value={44100}>44.1 kHz</option>
              </select>
              {exportSettings.format === "wav" ? (
                <select value={exportSettings.wavBitDepth} onChange={(e) => updateExportSettings({ wavBitDepth: Number(e.target.value) as typeof exportSettings.wavBitDepth })} className="bg-panel-900 border border-white/10 rounded px-1.5 py-1 text-[10px] outline-none">
                  <option value={24}>24-bit</option>
                  <option value={16}>16-bit</option>
                </select>
              ) : (
                <select value={exportSettings.mp3Kbps} onChange={(e) => updateExportSettings({ mp3Kbps: Number(e.target.value) as typeof exportSettings.mp3Kbps })} className="bg-panel-900 border border-white/10 rounded px-1.5 py-1 text-[10px] outline-none">
                  <option value={128}>128 kbps</option>
                  <option value={192}>192 kbps</option>
                  <option value={256}>256 kbps</option>
                  <option value={320}>320 kbps</option>
                </select>
              )}
              <label className="flex items-center gap-1 text-[10px] text-gray-400 bg-panel-900 border border-white/10 rounded px-1.5 py-1">
                <input type="checkbox" checked={exportSettings.includeMaster} onChange={(e) => updateExportSettings({ includeMaster: e.target.checked })} />
                Master
              </label>
            </div>
            <label className="flex items-center gap-1 text-[10px] text-gray-500">
              <input type="checkbox" checked={exportSettings.normalizePeak} onChange={(e) => updateExportSettings({ normalizePeak: e.target.checked })} />
              Normalize peak before encoding
            </label>
            <button onClick={() => void exportFullSong()} disabled={exporting} className="w-full text-[11px] bg-accent hover:bg-accent-hover text-white rounded py-1.5 disabled:opacity-50">Export full song ({exportSettings.format.toUpperCase()})</button>
            <button onClick={() => void exportLoopRegion()} disabled={exporting || !loopEnabled} className="w-full text-[11px] bg-panel-700 hover:bg-panel-650 rounded py-1.5 disabled:opacity-40" title={loopEnabled ? "Export the loop region" : "Enable a loop region first"}>Export loop region ({exportSettings.format.toUpperCase()})</button>
            <button onClick={() => void exportStems()} disabled={exporting} className="w-full text-[11px] bg-panel-700 hover:bg-panel-650 rounded py-1.5 disabled:opacity-50">Export stems ({exportSettings.format.toUpperCase()})</button>
            {exportProgress && <div className="text-[10px] text-panther-gold">{exportProgress}</div>}
            <div className="text-[9px] text-gray-600">Offline export supports format, sample rate, bit depth/bitrate, master bypass, and peak normalization.</div>

            <div className="border-t border-white/10 pt-2 text-xs font-semibold">Reference A/B</div>
            <input ref={refInput} type="file" accept="audio/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) void importReference(e.target.files[0]); e.target.value = ""; }} />
            {reference ? (
              <>
                <div className="text-[10px] text-gray-400 truncate">{reference.name}</div>
                <div className="flex rounded overflow-hidden border border-white/10 text-[11px]">
                  <button onClick={() => setReferenceMode("mix")} className={`flex-1 py-1 ${referenceMode === "mix" ? "bg-accent text-white" : "bg-panel-900 text-gray-400"}`}>A · Mix</button>
                  <button onClick={() => setReferenceMode("ref")} className={`flex-1 py-1 ${referenceMode === "ref" ? "bg-accent text-white" : "bg-panel-900 text-gray-400"}`}>B · Ref</button>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-gray-500">Vol</span>
                  <input type="range" min={0} max={1.5} step={0.01} value={reference.gain} onChange={(e) => setReferenceGain(parseFloat(e.target.value))} className="flex-1" />
                </div>
                <button onClick={removeReference} className="w-full text-[10px] text-panther-red hover:underline">Remove reference</button>
                <div className="text-[9px] text-gray-600">Reference bypasses the master chain.</div>
              </>
            ) : (
              <button onClick={() => refInput.current?.click()} className="w-full text-[11px] bg-panel-700 hover:bg-panel-650 rounded py-1.5">Import reference…</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
